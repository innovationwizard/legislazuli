'use client';

import { useState, useRef } from 'react';
import { DocType } from '@/types';

interface FileUploadProps {
  onUpload: (file: File, docType: DocType) => Promise<void>;
  processing?: boolean;
}

export function FileUpload({ onUpload, processing = false }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && isValidFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      setSelectedFile(file);
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;
    try {
      await onUpload(selectedFile, docType);
      // Reset after successful upload
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      // Error handling is done in parent component
    }
  };

  const isValidFile = (file: File): boolean => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    return validTypes.includes(file.type);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Document Type Selector */}
      <div className="border-l-4 border-lapis pl-4 py-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">
            1
          </span>
          <label className="block text-sm font-medium text-gray-700">
            Tipo de documento:
          </label>
        </div>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          disabled={processing}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lapis disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="patente_empresa">Patente de Comercio - Empresa</option>
          <option value="patente_sociedad">Patente de Comercio - Sociedad</option>
        </select>
      </div>

      {/* Step 2: File Upload */}
      <div className="border-l-4 border-lapis pl-4 py-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">
            2
          </span>
          <label className="block text-sm font-medium text-gray-700">
            Subir documento:
          </label>
        </div>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragging
              ? 'border-gold bg-amber-50'
              : 'border-gray-300 hover:border-lapis'
          } ${processing ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {selectedFile ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-medium">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                disabled={processing}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                Eliminar archivo
              </button>
            </div>
          ) : (
            <>
              <p className="text-lg text-gray-600 mb-2">
                Arrastra tu archivo aquí
              </p>
              <p className="text-sm text-gray-500 mb-4">
                PDF, PNG o JPG
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={processing}
                className="px-6 py-2 bg-lapis text-white rounded-md hover:bg-lapis-dark disabled:opacity-50 transition-colors"
              >
                Seleccionar archivo
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileSelect}
            disabled={processing}
            className="hidden"
          />
        </div>
      </div>

      {/* Step 3: Send Button */}
      <div className="border-l-4 border-lapis pl-4 py-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-lapis text-white font-bold text-sm">
            3
          </span>
          <label className="block text-sm font-medium text-gray-700">
            Procesar documento:
          </label>
        </div>
        <button
          onClick={handleSend}
          disabled={!selectedFile || processing}
          className="w-full px-6 py-3 bg-lapis text-white rounded-md hover:bg-lapis-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <LoadingSpinner />
              <span>Procesando...</span>
            </>
          ) : (
            'Enviar'
          )}
        </button>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

