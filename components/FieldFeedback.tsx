'use client';

import { useState, useEffect } from 'react';
import { Button } from './ui/Button';

interface FieldFeedbackProps {
  extractionId: string;
  fieldName: string;
  model: 'claude' | 'gemini';
  value: string;
  existingFeedback?: {
    is_correct: boolean;
    why?: string;
  } | null;
  onFeedbackSubmitted?: () => void;
}

export function FieldFeedback({
  extractionId,
  fieldName,
  model,
  value,
  existingFeedback,
  onFeedbackSubmitted,
}: FieldFeedbackProps) {
  const [isCorrect, setIsCorrect] = useState<boolean | null>(
    existingFeedback?.is_correct ?? null
  );
  const [why, setWhy] = useState(existingFeedback?.why || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!existingFeedback);

  useEffect(() => {
    if (existingFeedback) {
      setIsCorrect(existingFeedback.is_correct);
      setWhy(existingFeedback.why || '');
      setSubmitted(true);
    }
  }, [existingFeedback]);

  const handleSubmit = async () => {
    if (isCorrect === null) {
      return;
    }

    if (!isCorrect && why.trim().length === 0) {
      alert('Please provide a reason why this is incorrect (max 100 characters)');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          extraction_id: extractionId,
          field_name: fieldName,
          model,
          is_correct: isCorrect,
          why: isCorrect ? null : why.trim(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit feedback');
      }

      setSubmitted(true);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted();
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
      alert(`Failed to submit feedback: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCorrect = () => {
    setIsCorrect(true);
    setWhy('');
    setSubmitted(false);
  };

  const handleWrong = () => {
    setIsCorrect(false);
    setSubmitted(false);
  };

  const modelColor = model === 'claude' ? 'purple' : 'blue';
  const modelLabel = model === 'claude' ? 'Claude' : 'Gemini';

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className={`font-medium text-${modelColor}-700 min-w-[100px]`}>
          {modelLabel}:
        </span>
        <div className="flex-1">
          <p className="text-gray-700 break-words">{value || '(empty)'}</p>
        </div>
      </div>

      <div className="ml-[108px] space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCorrect}
            disabled={isSubmitting || submitted}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              isCorrect === true
                ? 'bg-green-500 text-white'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            } ${isSubmitting || submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            ✓ Correct
          </button>
          <button
            onClick={handleWrong}
            disabled={isSubmitting || submitted}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              isCorrect === false
                ? 'bg-red-500 text-white'
                : 'bg-red-100 text-red-700 hover:bg-red-200'
            } ${isSubmitting || submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            ✗ Wrong
          </button>
          {submitted && (
            <span className="text-xs text-gray-500">✓ Feedback submitted</span>
          )}
        </div>

        {isCorrect === false && (
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-700">
              Why is this wrong? (required, max 100 chars)
            </label>
            <textarea
              value={why}
              onChange={(e) => {
                const newWhy = e.target.value.slice(0, 100);
                setWhy(newWhy);
              }}
              placeholder="e.g., Missing accent on José, Wrong digit (6 vs 8), OCR error..."
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded resize-none"
              rows={2}
              maxLength={100}
              disabled={isSubmitting || submitted}
            />
            <div className="text-xs text-gray-500 text-right">
              {why.length}/100
            </div>
          </div>
        )}

        {isCorrect !== null && !submitted && (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (isCorrect === false && why.trim().length === 0)}
            className="text-xs py-1 px-3"
            variant="secondary"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        )}

        {submitted && existingFeedback && (
          <div className="text-xs text-gray-600">
            {isCorrect ? (
              <span className="text-green-700">✓ Marked as correct</span>
            ) : (
              <div>
                <span className="text-red-700">✗ Marked as wrong</span>
                {why && (
                  <div className="mt-1 text-gray-600">
                    <strong>Why:</strong> {why}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

