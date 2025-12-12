'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/FileUpload';

interface JobStatusProps {
  jobId: string;
  onComplete?: (extractionId: string) => void;
  onError?: (error: string) => void;
}

interface JobStatusData {
  id: string;
  status: 'PENDING' | 'PROCESSING_TEXTTRACT' | 'PROCESSING_LLM' | 'COMPLETED' | 'FAILED';
  statusMessage?: string;
  textractStatus?: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  extractionId?: string;
  fields?: any[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: any;
}

export function JobStatus({ jobId, onComplete, onError }: JobStatusProps) {
  const router = useRouter();
  const [jobStatus, setJobStatus] = useState<JobStatusData | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}/status`);
        if (!response.ok) {
          throw new Error('Failed to fetch job status');
        }

        const data: JobStatusData = await response.json();
        setJobStatus(data);

        if (data.status === 'COMPLETED' && data.extractionId) {
          setPolling(false);
          if (onComplete) {
            onComplete(data.extractionId);
          } else {
            router.push(`/extraction/${data.extractionId}`);
          }
        } else if (data.status === 'FAILED') {
          setPolling(false);
          const errorMsg = data.error?.error || data.statusMessage || 'Job failed';
          if (onError) {
            onError(errorMsg);
          } else {
            alert(`Error: ${errorMsg}`);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        setPolling(false);
        if (onError) {
          onError(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    };

    // Poll immediately, then every 3 seconds
    pollStatus();
    const interval = setInterval(pollStatus, 3000);

    return () => clearInterval(interval);
  }, [jobId, polling, router, onComplete, onError]);

  if (!jobStatus) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
        <span className="ml-3 text-gray-600">Cargando estado del trabajo...</span>
      </div>
    );
  }

  const getStatusText = () => {
    switch (jobStatus.status) {
      case 'PENDING':
        return 'Pendiente';
      case 'PROCESSING_TEXTTRACT':
        return 'Procesando con Textract...';
      case 'PROCESSING_LLM':
        return 'Procesando con IA...';
      case 'COMPLETED':
        return 'Completado';
      case 'FAILED':
        return 'Error';
      default:
        return jobStatus.status;
    }
  };

  const getStatusColor = () => {
    switch (jobStatus.status) {
      case 'PENDING':
      case 'PROCESSING_TEXTTRACT':
      case 'PROCESSING_LLM':
        return 'text-blue-600';
      case 'COMPLETED':
        return 'text-green-600';
      case 'FAILED':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getProgressPercentage = () => {
    switch (jobStatus.status) {
      case 'PENDING':
        return 10;
      case 'PROCESSING_TEXTTRACT':
        return 40;
      case 'PROCESSING_LLM':
        return 80;
      case 'COMPLETED':
        return 100;
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  };

  return (
    <div className="space-y-4 p-6 bg-white rounded-lg shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Estado del Procesamiento</h3>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div
          className="bg-lapis h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${getProgressPercentage()}%` }}
        />
      </div>

      {/* Status Message */}
      {jobStatus.statusMessage && (
        <p className="text-sm text-gray-600">{jobStatus.statusMessage}</p>
      )}

      {/* Textract Status */}
      {jobStatus.textractStatus && jobStatus.status === 'PROCESSING_TEXTTRACT' && (
        <div className="text-sm text-gray-500">
          <span className="font-medium">Textract:</span>{' '}
          {jobStatus.textractStatus === 'IN_PROGRESS' && 'Analizando documento...'}
          {jobStatus.textractStatus === 'SUCCEEDED' && '✓ Análisis completado'}
          {jobStatus.textractStatus === 'FAILED' && '✗ Error en análisis'}
        </div>
      )}

      {/* Error Details */}
      {jobStatus.status === 'FAILED' && jobStatus.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <strong>Error:</strong> {jobStatus.error.error || JSON.stringify(jobStatus.error)}
          </p>
        </div>
      )}

      {/* Loading Indicator */}
      {(jobStatus.status === 'PENDING' || 
        jobStatus.status === 'PROCESSING_TEXTTRACT' || 
        jobStatus.status === 'PROCESSING_LLM') && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LoadingSpinner />
          <span>Procesando... Esto puede tomar 2-5 minutos para documentos grandes.</span>
        </div>
      )}

      {/* Completed Message */}
      {jobStatus.status === 'COMPLETED' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            ✓ Procesamiento completado exitosamente
          </p>
        </div>
      )}

      {/* Cancel/Back Button */}
      {jobStatus.status !== 'COMPLETED' && jobStatus.status !== 'FAILED' && (
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-gray-600 hover:text-gray-800 underline mt-4"
        >
          Cancelar y volver
        </button>
      )}
    </div>
  );
}

