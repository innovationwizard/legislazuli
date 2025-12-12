import { useState, useCallback } from 'react';

// Types matching our DynamoDB structure
export interface ExtractionResult {
  jobId: string;
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  gapDetected?: boolean;
  gapAmount?: number;
  totalAmount?: number;
  immediateAvailability?: number;
  instrumentNumber?: string;
  rawText?: string;
  textByPage?: Record<string, string>; // Page number -> text content
  aiAnalysis?: any;
  error?: string;
}

export function useLegislazuli() {
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processDeed = useCallback(async (file: File) => {
    try {
      setIsProcessing(true);
      setResult({ jobId: '', status: 'UPLOADING' });

      // 1. Get Presigned URL (tiny Vercel API for this part only)
      const presignRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename: file.name, filetype: file.type }),
      });

      if (!presignRes.ok) {
        const error = await presignRes.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { uploadUrl, key } = await presignRes.json();

      // 2. Upload Direct to S3 (Bypasses Vercel Timeouts)
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to S3');
      }

      setResult({ jobId: key, status: 'PROCESSING' });

      // 3. Poll for Results (The "LegislazuliResults" DynamoDB Table)
      // The S3 Key effectively becomes the tracking ID
      // We'll use the Textract JobId as stored in DynamoDB, but for now use the S3 key
      let pollInterval: NodeJS.Timeout | null = null;
      let pollCount = 0;
      const startTime = Date.now();
      
      console.log(`[Legislazuli] 🚀 Starting polling for key: ${key.substring(0, 30)}...`);
      
      const pollForResults = async () => {
        // Use requestIdleCallback or setTimeout to avoid blocking main thread
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(async () => {
            await performPoll();
          }, { timeout: 5000 });
        } else {
          // Fallback: use setTimeout to defer execution
          setTimeout(async () => {
            await performPoll();
          }, 0);
        }
      };

      const performPoll = async () => {
        pollCount++;
        const pollStartTime = performance.now();
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        
        console.log(`[Legislazuli] ⏱️  Poll #${pollCount} (${elapsedSeconds}s elapsed) - Checking status...`);
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for fetch
          
          const pollRes = await fetch(`/api/status?key=${encodeURIComponent(key)}`, {
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          const pollDuration = Math.round(performance.now() - pollStartTime);
          
          if (pollRes.status === 200) {
            const data = await pollRes.json();
            console.log(`[Legislazuli] ✅ Poll #${pollCount} completed in ${pollDuration}ms - Status: ${data.status}`);
            
            if (data.status === 'COMPLETED') {
              const totalTime = Math.round((Date.now() - startTime) / 1000);
              console.log(`[Legislazuli] 🎉 Processing COMPLETED after ${totalTime}s (${pollCount} polls)`);
              console.log(`[Legislazuli] 📊 Results:`, {
                gapDetected: data.gapDetected,
                gapAmount: data.gapAmount,
                totalAmount: data.totalAmount,
                instrumentNumber: data.instrumentNumber,
              });
              
              if (pollInterval) clearInterval(pollInterval);
              setIsProcessing(false);
              setResult({
                jobId: data.jobId || key,
                status: 'COMPLETED',
                gapDetected: data.gapDetected,
                gapAmount: data.gapAmount,
                totalAmount: data.totalAmount,
                immediateAvailability: data.immediateAvailability,
                instrumentNumber: data.instrumentNumber,
                rawText: data.rawText,
                aiAnalysis: data.aiAnalysis,
              });
              return;
            } else if (data.status === 'FAILED') {
              const totalTime = Math.round((Date.now() - startTime) / 1000);
              console.error(`[Legislazuli] ❌ Processing FAILED after ${totalTime}s (${pollCount} polls):`, data.error);
              
              if (pollInterval) clearInterval(pollInterval);
              setIsProcessing(false);
              setResult({ 
                jobId: data.jobId || key, 
                status: 'FAILED',
                error: data.error || 'Processing failed'
              });
              return;
            }
            // If status is still PROCESSING, continue polling
            console.log(`[Legislazuli] ⏳ Poll #${pollCount} - Still processing, next poll in 10s...`);
          } else if (pollRes.status === 404) {
            console.log(`[Legislazuli] 🔍 Poll #${pollCount} completed in ${pollDuration}ms - Job not found yet (404), continuing...`);
            // Job not found yet, continue polling
            // This is expected during the initial processing phase
          } else {
            const totalTime = Math.round((Date.now() - startTime) / 1000);
            console.error(`[Legislazuli] ⚠️  Poll #${pollCount} failed after ${totalTime}s - Unexpected status: ${pollRes.status}`);
            
            // Unexpected error
            if (pollInterval) clearInterval(pollInterval);
            setIsProcessing(false);
            setResult({ 
              jobId: key, 
              status: 'FAILED',
              error: 'Failed to check job status'
            });
            return;
          }
        } catch (pollError: any) {
          const pollDuration = Math.round(performance.now() - pollStartTime);
          // Ignore abort errors (timeout)
          if (pollError.name !== 'AbortError') {
            console.error(`[Legislazuli] ❌ Poll #${pollCount} error after ${pollDuration}ms:`, pollError);
          } else {
            console.warn(`[Legislazuli] ⏱️  Poll #${pollCount} timed out after ${pollDuration}ms (fetch timeout)`);
          }
          // Continue polling on network errors
        }
      };

      pollInterval = setInterval(pollForResults, 10000); // Poll every 10 seconds

      // Cleanup: Stop polling after 10 minutes (safety timeout)
      setTimeout(() => {
        if (pollInterval) clearInterval(pollInterval);
        setIsProcessing(false);
        setResult((prev) => {
          if (prev?.status === 'PROCESSING') {
            return { 
              jobId: key, 
              status: 'FAILED',
              error: 'Processing timeout - job may still be running'
            };
          }
          return prev;
        });
      }, 10 * 60 * 1000); // 10 minutes

    } catch (err: any) {
      console.error('Processing error:', err);
      setIsProcessing(false);
      setResult({ 
        jobId: '', 
        status: 'FAILED', 
        error: err.message || 'Unknown error occurred'
      });
    }
  }, [result?.status]);

  return { processDeed, result, isProcessing };
}

