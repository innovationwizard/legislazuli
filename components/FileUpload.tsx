'use client';

import { useState, useRef } from 'react';
import { DocType } from '@/types';

interface FileUploadProps {
  onUpload: (file: File, docType: DocType) => Promise<void>;
}

export function FileUpload({ onUpload }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<DocType>('patente_empresa');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && isValidFile(file)) {
      await handleFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      await handleFile(file);
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      await onUpload(file, docType);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Error al subir el archivo. Por favor intenta de nuevo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isValidFile = (file: File): boolean => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    return validTypes.includes(file.type);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          dragging
            ? 'border-gold bg-amber-50'
            : 'border-gray-300 hover:border-lapis'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <p className="text-lg text-gray-600 mb-4">
          Arrastra tu archivo aquí
        </p>
        <p className="text-sm text-gray-500 mb-4">
          PDF, PNG o JPG
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-6 py-2 bg-lapis text-white rounded-md hover:bg-lapis-dark disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Subiendo...' : 'Seleccionar archivo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de documento:
        </label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lapis"
        >
          <option value="patente_empresa">Patente de Comercio - Empresa</option>
          <option value="patente_sociedad">Patente de Comercio - Sociedad</option>
        </select>
      </div>
    </div>
  );
}

