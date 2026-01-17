'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getFieldDisplayName } from '@/lib/utils/field-names';

interface GoldenSetCandidate {
  id: string;
  filename: string;
  doc_type: string;
  is_golden_set: boolean;
  uploaded_at: string;
  priority?: 'hard' | 'easy'; // 'hard' = flagged but verified, 'easy' = perfect
  extraction: {
    id: string;
    confidence: string;
    created_at: string;
    fields: Array<{
      id: string;
      field_name: string;
      field_value: string;
      field_value_words?: string;
      needs_review: boolean;
    }>;
  };
}

export default function GoldenSetPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<GoldenSetCandidate[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<GoldenSetCandidate | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [addingDocumentId, setAddingDocumentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (session?.user?.email !== 'condor') {
      router.push('/dashboard');
      return;
    }
    fetchCandidates();
  }, [session, router]);

  const fetchCandidates = async () => {
    try {
      const response = await fetch('/api/golden-set');
      if (!response.ok) {
        throw new Error('Failed to fetch candidates');
      }
      const data = await response.json();
      setCandidates(data.documents || []);
    } catch (err: any) {
      setError(err.message || 'Error loading candidates');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToGoldenSet = (document: GoldenSetCandidate) => {
    setSelectedDocument(document);
    setShowConfirmDialog(true);
  };

  const confirmAddToGoldenSet = async () => {
    if (!selectedDocument) return;

    setAddingDocumentId(selectedDocument.id);
    setError('');

    try {
      const response = await fetch('/api/golden-set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: selectedDocument.id,
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add to Golden Set');
      }

      // Remove from candidates list
      setCandidates(candidates.filter(c => c.id !== selectedDocument.id));
      setShowConfirmDialog(false);
      setSelectedDocument(null);
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Error adding to Golden Set');
    } finally {
      setAddingDocumentId(null);
    }
  };

  const cancelAdd = () => {
    setShowConfirmDialog(false);
    setSelectedDocument(null);
    setNotes('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600">Cargando candidatos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Golden Set Management</h1>
          <p className="text-gray-600 mt-2">
            Documentos con 100% de precisión candidatos para el Golden Set
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="secondary">Volver al Dashboard</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-600">
            No hay documentos candidatos disponibles. Los documentos con 100% de precisión aparecerán aquí.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <Card key={candidate.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{candidate.filename}</h3>
                    {candidate.priority === 'hard' ? (
                      <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded font-semibold">
                        🔥 Hard Case (Prioritized)
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        ✓ 100% Precisión
                      </span>
                    )}
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {candidate.doc_type}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded ${
                      candidate.extraction.confidence === 'full' 
                        ? 'bg-green-100 text-green-800' 
                        : candidate.extraction.confidence === 'partial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {candidate.extraction.confidence}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Subido: {new Date(candidate.uploaded_at).toLocaleString('es-GT')}
                  </p>
                </div>
                <Button
                  onClick={() => handleAddToGoldenSet(candidate)}
                  disabled={addingDocumentId === candidate.id}
                  className="ml-4"
                >
                  {addingDocumentId === candidate.id ? 'Agregando...' : 'Agregar al Golden Set'}
                </Button>
              </div>

              {/* Show all fields for review */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Campos Extraídos ({candidate.extraction.fields.length}):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {candidate.extraction.fields.map((field) => (
                    <div key={field.id} className="text-sm">
                      <div className="font-medium text-gray-700">
                        {getFieldDisplayName(field.field_name)}:
                      </div>
                      <div className="text-gray-900 mt-1">
                        {field.field_value || <span className="text-gray-400 italic">[Vacío]</span>}
                      </div>
                      {field.field_value_words && (
                        <div className="text-gray-600 italic text-xs mt-1">
                          ({field.field_value_words})
                        </div>
                      )}
                      {field.needs_review && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded">
                          ⚠ Revisar
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <Link
                  href={`/extraction/${candidate.extraction.id}`}
                  className="text-sm text-lapis hover:underline"
                >
                  Ver extracción completa →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Confirmar Agregar al Golden Set
            </h3>
            <p className="text-gray-700 mb-2">
              ¿Estás seguro de que quieres agregar este documento al Golden Set?
            </p>
            <div className="bg-gray-50 p-3 rounded mb-4">
              <p className="font-medium text-sm text-gray-900">{selectedDocument.filename}</p>
              <p className="text-xs text-gray-600 mt-1">
                {selectedDocument.extraction.fields.length} campos extraídos
                {selectedDocument.priority === 'hard' && (
                  <span className="ml-2 text-orange-600 font-semibold">(Hard Case - High Value)</span>
                )}
              </p>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              El Golden Set se usa para pruebas de regresión. Se creará una <strong>instantánea inmutable</strong> de los valores actuales como &quot;verdad&quot; para comparaciones futuras.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas (opcional):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Documento con marca de agua, verificado manualmente después de corrección..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lapis text-sm"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={cancelAdd}>
                Cancelar
              </Button>
              <Button
                onClick={confirmAddToGoldenSet}
                disabled={addingDocumentId !== null}
              >
                {addingDocumentId ? 'Agregando...' : 'Sí, Agregar'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

