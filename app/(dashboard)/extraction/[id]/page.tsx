'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ExtractionResults } from '@/components/ExtractionResults';
import { ExtractedField } from '@/types';
import { Button } from '@/components/ui/Button';

export default function ExtractionPage() {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<{
    id: string;
    confidence: 'full' | 'partial' | 'review_required';
    fields: ExtractedField[];
    discrepancies?: string[];
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.id) {
      fetchExtraction(params.id as string);
    }
  }, [params.id]);

  const fetchExtraction = async (id: string) => {
    try {
      const response = await fetch(`/api/extractions/${id}`);
      if (!response.ok) {
        throw new Error('Extraction not found');
      }
      const data = await response.json();
      
      // Transform fields from database format
      const fields: ExtractedField[] = (data.fields || []).map((f: any) => ({
        field_name: f.field_name,
        field_value: f.field_value,
        field_value_words: f.field_value_words,
        needs_review: f.needs_review,
      }));

      setExtraction({
        id: data.id,
        confidence: data.confidence,
        fields,
        discrepancies: data.discrepancies,
      });
    } catch (err) {
      setError('Error al cargar la extracción');
      console.error('Error fetching extraction:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!extraction) return;
    window.open(`/api/download/${extraction.id}?format=txt`, '_blank');
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div>Cargando...</div>
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">{error || 'Extracción no encontrada'}</div>
        <Link href="/dashboard" className="text-lapis hover:text-lapis-dark transition-colors">
          Volver al dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-lapis hover:text-lapis-dark flex items-center gap-2 transition-colors"
        >
          ← Volver
        </Link>
        <Button
          variant="secondary"
          onClick={handleDownload}
        >
          Descargar TXT
        </Button>
      </div>

      <ExtractionResults
        fields={extraction.fields}
        confidence={extraction.confidence}
        discrepancies={extraction.discrepancies}
      />
    </div>
  );
}

