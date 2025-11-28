'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Extraction {
  id: string;
  confidence: string;
  created_at: string;
  documents: {
    id: string;
    filename: string;
    doc_type: string;
  };
}

export function ExtractionList() {
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExtractions();
  }, []);

  const fetchExtractions = async () => {
    try {
      const response = await fetch('/api/extractions');
      if (response.ok) {
        const data = await response.json();
        setExtractions(data);
      }
    } catch (error) {
      console.error('Error fetching extractions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const badges = {
      full: { text: '✓ Completo', className: 'bg-green-100 text-green-800' },
      partial: { text: '⚠ Parcial', className: 'bg-yellow-100 text-yellow-800' },
      review_required: { text: '⚠ Revisar', className: 'bg-red-100 text-red-800' },
    };
    const badge = badges[confidence as keyof typeof badges] || badges.partial;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${badge.className}`}>
        {badge.text}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  if (extractions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No hay extracciones aún. Sube un documento para comenzar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold mb-4">Extracciones recientes</h2>
      {extractions.map((extraction) => (
        <div
          key={extraction.id}
          className="flex items-center justify-between p-4 bg-white rounded-lg shadow border border-gray-200"
        >
          <div className="flex items-center gap-4 flex-1">
            <span className="text-2xl">📄</span>
            <div className="flex-1">
              <div className="font-medium">{extraction.documents.filename}</div>
              <div className="text-sm text-gray-500">
                {formatDate(extraction.created_at)}
              </div>
            </div>
            {getConfidenceBadge(extraction.confidence)}
          </div>
          <Link
            href={`/extraction/${extraction.id}`}
            className="px-4 py-2 bg-lapis text-white rounded-md hover:bg-lapis-dark transition-colors"
          >
            Ver
          </Link>
        </div>
      ))}
    </div>
  );
}

