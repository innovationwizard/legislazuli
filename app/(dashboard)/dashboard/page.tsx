'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { FileUpload } from '@/components/FileUpload';
import { ExtractionList } from '@/components/ExtractionList';
import { JobStatus } from '@/components/JobStatus';
import { DocType } from '@/types';
import { Button } from '@/components/ui/Button';
import { useLegislazuli } from '@/hooks/useLegislazuli';

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { processDeed, result, isProcessing } = useLegislazuli();
  const isCondor = session?.user?.email === 'condor';

  // Handle completion - redirect to extraction page
  useEffect(() => {
    if (result?.status === 'COMPLETED' && result.jobId) {
      // For now, we'll need to create an extraction record in Supabase
      // or redirect to a results page that shows the DynamoDB data
      // For MVP, let's show the results inline or create a new extraction record
      // TODO: Create extraction record from DynamoDB result
      console.log('Processing completed:', result);
      // For now, we'll show a success message
      alert(`Procesamiento completado. Gap detectado: ${result.gapDetected ? 'Sí' : 'No'}`);
    } else if (result?.status === 'FAILED') {
      alert(`Error en el procesamiento: ${result.error || 'Error desconocido'}`);
    }
  }, [result]);

  const handleUpload = async (file: File, docType: DocType) => {
    try {
      // Use the new enterprise architecture hook
      await processDeed(file);
      // The hook handles polling and updates result state automatically
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Error al subir el archivo. Por favor intenta de nuevo.');
    }
  };

  const handleJobComplete = (extractionId: string) => {
    router.push(`/extraction/${extractionId}`);
  };

  const handleJobError = (error: string) => {
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
        {result?.status === 'PROCESSING' || result?.status === 'UPLOADING' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-lapis"></div>
              <div>
                <p className="font-medium text-gray-700">
                  {result.status === 'UPLOADING' ? 'Subiendo archivo...' : 'Procesando documento...'}
                </p>
                <p className="text-sm text-gray-500">
                  Esto puede tardar varios minutos
                </p>
              </div>
            </div>
            {result.status === 'PROCESSING' && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  El documento se está procesando. Esta página se actualizará automáticamente cuando esté listo.
                </p>
              </div>
            )}
          </div>
        ) : result?.status === 'COMPLETED' ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="font-medium text-green-800 mb-2">✓ Procesamiento completado</h3>
              <div className="space-y-1 text-sm text-green-700">
                <p>Gap detectado: {result.gapDetected ? 'Sí' : 'No'}</p>
                {result.gapAmount && <p>Monto del gap: ${result.gapAmount.toLocaleString()}</p>}
                {result.totalAmount && <p>Monto total: ${result.totalAmount.toLocaleString()}</p>}
                {result.instrumentNumber && <p>Número de instrumento: {result.instrumentNumber}</p>}
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Nota: Los resultados completos se guardarán en la base de datos.
            </p>
          </div>
        ) : (
          <FileUpload onUpload={handleUpload} processing={isProcessing} />
        )}
      </div>

      <div className="border-t pt-8">
        <ExtractionList />
      </div>
    </div>
  );
}

