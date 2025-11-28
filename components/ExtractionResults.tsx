'use client';

import { ExtractedField } from '@/types';
import { CopyButton } from './ui/CopyButton';
import { Card } from './ui/Card';

interface ExtractionResultsProps {
  fields: ExtractedField[];
  confidence: 'full' | 'partial' | 'review_required';
  discrepancies?: string[];
}

export function ExtractionResults({
  fields,
  confidence,
  discrepancies,
}: ExtractionResultsProps) {
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
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

