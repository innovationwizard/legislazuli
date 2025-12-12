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

  // Log completion for debugging
  useEffect(() => {
    if (result?.status === 'COMPLETED' && result.jobId) {
      console.log('Processing completed:', result);
    } else if (result?.status === 'FAILED') {
      console.error('Processing failed:', result.error);
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
                {result.immediateAvailability && <p>Disponibilidad inmediata: ${result.immediateAvailability.toLocaleString()}</p>}
                {result.instrumentNumber && <p>Número de instrumento: {result.instrumentNumber}</p>}
              </div>
            </div>
            
            {/* Full Results Section */}
            {(result.rawText || result.aiAnalysis) && (
              <div className="border-t pt-4 mt-4">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Ver resultados completos
                  </summary>
                  
                  <div className="mt-4 space-y-4">
                    {/* AI Analysis */}
                    {result.aiAnalysis && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                        <h4 className="font-medium text-blue-800 mb-2">Análisis de IA</h4>
                        <pre className="text-xs text-blue-700 whitespace-pre-wrap overflow-auto max-h-96">
                          {JSON.stringify(result.aiAnalysis, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    {/* Raw Text - Paginated */}
                    {result.textByPage && Object.keys(result.textByPage).length > 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-800">Texto extraído (por página)</h4>
                          <button
                            onClick={() => {
                              const allText = Object.values(result.textByPage || {}).join('\n\n');
                              navigator.clipboard.writeText(allText);
                              alert('Texto copiado al portapapeles');
                            }}
                            className="text-xs text-gray-600 hover:text-gray-800 underline"
                          >
                            Copiar todo
                          </button>
                        </div>
                        <div className="space-y-4">
                          {Object.keys(result.textByPage)
                            .sort((a, b) => parseInt(a) - parseInt(b))
                            .map((pageNum) => (
                              <div key={pageNum} className="bg-white border border-gray-300 rounded p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="text-sm font-semibold text-gray-700">
                                    Página {pageNum}
                                  </h5>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(result.textByPage?.[pageNum] || '');
                                      alert(`Página ${pageNum} copiada al portapapeles`);
                                    }}
                                    className="text-xs text-gray-600 hover:text-gray-800 underline"
                                  >
                                    Copiar página
                                  </button>
                                </div>
                                <textarea
                                  readOnly
                                  value={result.textByPage?.[pageNum] || ''}
                                  className="w-full h-48 p-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded resize-none"
                                  style={{ fontSize: '10px', lineHeight: '1.4' }}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  {(result.textByPage?.[pageNum]?.length || 0).toLocaleString()} caracteres
                                </p>
                              </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          Total: {Object.values(result.textByPage || {}).reduce((sum, text) => sum + (text?.length || 0), 0).toLocaleString()} caracteres en {Object.keys(result.textByPage || {}).length} página(s)
                        </p>
                      </div>
                    ) : result.rawText ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-800">Texto extraído</h4>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(result.rawText || '');
                              alert('Texto copiado al portapapeles');
                            }}
                            className="text-xs text-gray-600 hover:text-gray-800 underline"
                          >
                            Copiar todo
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={result.rawText}
                          className="w-full h-64 p-3 text-sm font-mono bg-white border border-gray-300 rounded resize-none"
                          style={{ fontSize: '11px', lineHeight: '1.4' }}
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          {result.rawText.length.toLocaleString()} caracteres
                        </p>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            )}
            
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  // Reset by reloading the page to clear hook state
                  window.location.reload();
                }}
                variant="secondary"
              >
                Procesar otro documento
              </Button>
            </div>
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

