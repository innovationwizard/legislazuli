'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import { ExtractionList } from '@/components/ExtractionList';
import { DocType } from '@/types';

export default function DashboardPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File, docType: DocType) => {
    setUploading(true);
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

      const result = await response.json();
      router.push(`/extraction/${result.extraction_id}`);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Error al subir el archivo. Por favor intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">Sube un documento para extraer datos</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <FileUpload onUpload={handleUpload} processing={uploading} />
      </div>

      <div className="border-t pt-8">
        <ExtractionList />
      </div>
    </div>
  );
}

