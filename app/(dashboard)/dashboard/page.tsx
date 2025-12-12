'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { FileUpload } from '@/components/FileUpload';
import { ExtractionList } from '@/components/ExtractionList';
import { JobStatus } from '@/components/JobStatus';
import { DocType } from '@/types';
import { Button } from '@/components/ui/Button';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [uploading, setUploading] = useState(false);
  const [asyncJobId, setAsyncJobId] = useState<string | null>(null);
  const isCondor = session?.user?.email === 'condor';

  const handleUpload = async (file: File, docType: DocType) => {
    setUploading(true);
    setAsyncJobId(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('doc_type', docType);

      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al procesar el documento');
      }

      // Check if async processing (202 Accepted)
      if (response.status === 202) {
        const result = await response.json();
        // Show job status component for async processing
        setAsyncJobId(result.jobId);
        setUploading(false);
        return;
      }

      // Synchronous processing (200 OK)
      const result = await response.json();
      router.push(`/extraction/${result.extraction_id}`);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Error al subir el archivo. Por favor intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const handleJobComplete = (extractionId: string) => {
    setAsyncJobId(null);
    router.push(`/extraction/${extractionId}`);
  };

  const handleJobError = (error: string) => {
    setAsyncJobId(null);
    alert(`Error en el procesamiento: ${error}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-600">Sube un documento para extraer datos</p>
        </div>
        {isCondor && (
          <div className="flex gap-3">
            <Link href="/golden-set">
              <Button variant="secondary">
                🏆 Golden Set Management
              </Button>
            </Link>
            <Link href="/prompts/leaderboard">
              <Button variant="secondary">
                📊 Prompt Leaderboard
              </Button>
            </Link>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {asyncJobId ? (
          <JobStatus 
            jobId={asyncJobId} 
            onComplete={handleJobComplete}
            onError={handleJobError}
          />
        ) : (
          <FileUpload onUpload={handleUpload} processing={uploading} />
        )}
      </div>

      <div className="border-t pt-8">
        <ExtractionList />
      </div>
    </div>
  );
}

