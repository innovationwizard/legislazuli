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
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for fetch
          
          const pollRes = await fetch(`/api/status?key=${encodeURIComponent(key)}`, {
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (pollRes.status === 200) {
            const data = await pollRes.json();
            if (data.status === 'COMPLETED') {
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
          } else if (pollRes.status === 404) {
            // Job not found yet, continue polling
            // This is expected during the initial processing phase
          } else {
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
          // Ignore abort errors (timeout)
          if (pollError.name !== 'AbortError') {
            console.error('Polling error:', pollError);
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

