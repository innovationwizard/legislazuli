'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { ExtractedField } from '@/types';
import { CopyButton } from './ui/CopyButton';
import { Card } from './ui/Card';
import { FieldFeedback } from './FieldFeedback';
import { getFieldDisplayName } from '@/lib/utils/field-names';

interface ExtractionResultsProps {
  extractionId: string;
  fields: ExtractedField[];
  confidence: 'full' | 'partial' | 'review_required';
  discrepancies?: string[];
}

export function ExtractionResults({
  extractionId,
  fields,
  confidence,
  discrepancies,
}: ExtractionResultsProps) {
  const { data: session } = useSession();
  const isCondor = session?.user?.email === 'condor';
  const [feedback, setFeedback] = useState<Record<string, Record<string, any>>>({});
  const [loadingFeedback, setLoadingFeedback] = useState(true);

  // Load existing feedback
  useEffect(() => {
    if (isCondor && extractionId) {
      fetchFeedback();
    } else {
      setLoadingFeedback(false);
    }
  }, [isCondor, extractionId]);

  const fetchFeedback = async () => {
    try {
      const response = await fetch(`/api/feedback?extraction_id=${extractionId}`);
      if (response.ok) {
        const data = await response.json();
        const feedbackMap: Record<string, Record<string, any>> = {};
        data.feedback.forEach((f: any) => {
          if (!feedbackMap[f.field_name]) {
            feedbackMap[f.field_name] = {};
          }
          feedbackMap[f.field_name][f.model] = {
            is_correct: f.is_correct,
            why: f.why,
          };
        });
        setFeedback(feedbackMap);
      }
    } catch (error) {
      console.error('Error fetching feedback:', error);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const handleFeedbackSubmitted = () => {
    fetchFeedback();
  };
  
  const getConfidenceDisplay = () => {
    const displays = {
      full: { text: '✓ COMPLETA (100% consenso)', className: 'text-green-600' },
      partial: { text: '⚠ PARCIAL (>90% consenso)', className: 'text-gold' },
      review_required: { text: '⚠ REQUIERE REVISIÓN', className: 'text-red-600' },
    };
    const display = displays[confidence];
    return (
      <div className={`font-semibold mb-6 ${display.className}`}>
        Confianza: {display.text}
      </div>
    );
  };

  return (
    <div>
      {getConfidenceDisplay()}

      <div className="space-y-4">
        {fields.map((field, index) => (
          <Card key={index} className={field.needs_review ? 'border-yellow-300 border-2' : ''}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-gray-800">
                    {field.field_name}
                  </h3>
                  {field.needs_review && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                      ⚠ Revisar
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-gray-700 whitespace-pre-line">{field.field_value}</p>
                  <CopyButton value={field.field_value} />
                </div>
                {field.field_value_words && (
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600 italic text-sm">
                      {field.field_value_words}
                    </p>
                    <CopyButton value={field.field_value_words} />
                  </div>
                )}
                {/* Debug section for user "condor" - shows model outputs and feedback */}
                {isCondor && (field.claude_value !== undefined || field.openai_value !== undefined) && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-xs font-semibold text-gray-500 mb-3">
                      🔍 Behind the Scenes (Debug Info)
                    </div>
                    {loadingFeedback ? (
                      <div className="text-xs text-gray-500">Loading feedback...</div>
                    ) : (
                      <div className="space-y-4 text-sm">
                        {field.claude_value !== undefined && (
                          <FieldFeedback
                            extractionId={extractionId}
                            fieldName={field.field_name}
                            model="claude"
                            value={field.claude_value}
                            existingFeedback={feedback[field.field_name]?.claude}
                            onFeedbackSubmitted={handleFeedbackSubmitted}
                          />
                        )}
                        {field.openai_value !== undefined && (
                          <FieldFeedback
                            extractionId={extractionId}
                            fieldName={field.field_name}
                            model="openai"
                            value={field.openai_value}
                            existingFeedback={feedback[field.field_name]?.openai}
                            onFeedbackSubmitted={handleFeedbackSubmitted}
                          />
                        )}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                          <span className="font-medium text-gray-600 min-w-[100px]">Match:</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            field.match 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {field.match ? '✓ Match' : '✗ No Match'}
                          </span>
                          {field.confidence !== undefined && (
                            <>
                              <span className="font-medium text-gray-600 ml-4">Confidence:</span>
                              <span className="text-gray-700">
                                {(field.confidence * 100).toFixed(1)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {discrepancies && discrepancies.length > 0 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">
            Campos con discrepancias:
          </h4>
          <ul className="list-disc list-inside text-yellow-700">
            {discrepancies.map((field) => (
              <li key={field}>{getFieldDisplayName(field)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

