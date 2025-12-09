'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ExtractionResults } from '@/components/ExtractionResults';
import { ExtractedField, ConsensusResult } from '@/types';
import { Button } from '@/components/ui/Button';
import { FIELD_NAME_MAP } from '@/lib/utils/field-names';

export default function ExtractionPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<{
    id: string;
    confidence: 'full' | 'partial' | 'review_required';
    fields: ExtractedField[];
    discrepancies?: string[];
  } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.id && session) {
      fetchExtraction(params.id as string);
    }
  }, [params.id, session]);

  const fetchExtraction = async (id: string) => {
    try {
      const response = await fetch(`/api/extractions/${id}`);
      if (!response.ok) {
        throw new Error('Extraction not found');
      }
      const data = await response.json();
      
      // Create reverse mapping from display name to field key
      const displayNameToKey: Record<string, string> = {};
      Object.entries(FIELD_NAME_MAP).forEach(([key, displayName]) => {
        displayNameToKey[displayName] = key;
      });
      
      // Map consensus results to fields (for user "condor")
      const consensusResultsMap: Record<string, ConsensusResult> = {};
      if (data.consensus_results && Array.isArray(data.consensus_results)) {
        data.consensus_results.forEach((result: ConsensusResult) => {
          consensusResultsMap[result.field_name] = result;
        });
      }
      
      // Helper function to convert display name to field key
      const getFieldKey = (displayName: string): string => {
        // First try direct mapping
        if (displayNameToKey[displayName]) {
          return displayNameToKey[displayName];
        }
        // For date fields, check if it matches the pattern
        if (displayName === 'Fecha de Inscripción') return 'fecha_inscripcion';
        if (displayName === 'Fecha de Emisión') return 'fecha_emision';
        // For generic fields, convert Title Case back to snake_case
        // e.g., "Field Name" -> "field_name"
        return displayName.toLowerCase().replace(/\s+/g, '_');
      };
      
      // Transform fields from database format
      const fields: ExtractedField[] = (data.fields || []).map((f: any) => {
        const fieldKey = getFieldKey(f.field_name);
        const consensusResult = consensusResultsMap[fieldKey];
        
        const field: ExtractedField = {
          field_name: f.field_name,
          field_value: f.field_value,
          field_value_words: f.field_value_words,
          needs_review: f.needs_review,
        };
        
        // Add model outputs for user "condor" if consensus result exists
        if (consensusResult && session?.user?.email === 'condor') {
          field.claude_value = consensusResult.claude_value;
          field.openai_value = consensusResult.openai_value;
          field.match = consensusResult.match;
          field.confidence = consensusResult.confidence;
        }
        
        return field;
      });

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
        extractionId={extraction.id}
        fields={extraction.fields}
        confidence={extraction.confidence}
        discrepancies={extraction.discrepancies}
      />
    </div>
  );
}

