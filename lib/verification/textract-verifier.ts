/**
 * Textract Verifier - The Deterministic Third Voter
 * 
 * This class acts as a "veto" system: it doesn't vote on what the value is,
 * but exercises veto power on what the value is NOT.
 * 
 * If Claude and Gemini agree on a value, but Textract cannot find it in the
 * document's raw text, we flag a Critical Discrepancy.
 * 
 * CRITICAL: Numeric fields use strict verification (exact match + OCR normalization only).
 * Text fields use fuzzy matching (Levenshtein distance).
 * 
 * The "Numeric Levenshtein Trap": Using Levenshtein on numbers is dangerous.
 * Example: Patent 76869 vs Textract 76868 = 80% similarity, but it's a critical error.
 */

import { Block, DetectDocumentTextCommandOutput } from '@aws-sdk/client-textract';
import levenshtein from 'js-levenshtein';

export type VerificationStatus = 'VERIFIED' | 'FUZZY_MATCH' | 'NOT_FOUND' | 'SUSPICIOUS';

export interface VerificationResult {
  field: string;
  value: string;
  status: VerificationStatus;
  confidence: number; // 0-1
  foundText?: string;
  location?: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM' | 'UNKNOWN';
  blockId?: string;
  note?: string; // Optional explanation for the verification result
}

export class TextractVerifier {
  private blocks: Block[];

  constructor(textractResponse: DetectDocumentTextCommandOutput) {
    this.blocks = textractResponse.Blocks || [];
  }

  /**
   * Verify a field value against Textract's extracted text
   * 
   * @param fieldName - The name of the field being verified
   * @param value - The value proposed by the LLMs
   * @param type - 'TEXT' for names/addresses (uses Levenshtein), 'NUMERIC' for IDs/numbers (strict matching)
   * @returns VerificationResult with status and confidence
   */
  public verifyField(
    fieldName: string,
    value: string,
    type: 'TEXT' | 'NUMERIC' = 'TEXT'
  ): VerificationResult {
    if (type === 'NUMERIC') {
      return this.verifyNumeric(fieldName, value);
    }
    return this.verifyText(fieldName, value);
  }

  /**
   * STRICT NUMERIC VERIFICATION
   * 
   * For numeric fields (numero_patente, numero_registro, etc.):
   * - Uses exact matching with OCR normalization (O→0, I→1, etc.)
   * - Does NOT use generic Levenshtein distance (prevents "76869" vs "76868" false positives)
   * - A single digit difference is a critical error, not a fuzzy match
   */
  private verifyNumeric(fieldName: string, value: string): VerificationResult {
    // Extract digits only from the value
    const cleanTarget = (value || '').replace(/[^0-9]/g, '');
    
    if (!cleanTarget) {
      // Empty values are considered verified (no data to verify)
      return {
        field: fieldName,
        value,
        status: 'VERIFIED',
        confidence: 1.0,
        location: 'UNKNOWN',
      };
    }

    // Get all text lines from Textract
    const lineBlocks = this.blocks.filter(
      (b) => b.BlockType === 'LINE' && b.Text
    );

    for (const block of lineBlocks) {
      // Remove all non-alphanumeric characters (to catch OCR errors like 'O' instead of '0')
      const rawLine = (block.Text || '').replace(/[^a-zA-Z0-9]/g, '');

      // A. Exact Match (Best Case)
      if (rawLine.includes(cleanTarget)) {
        return {
          field: fieldName,
          value,
          status: 'VERIFIED',
          confidence: 1.0,
          foundText: block.Text!,
          location: this.getLocation(block),
          blockId: block.Id || '',
        };
      }

      // B. OCR Normalization Check
      // Common OCR errors: O→0, I→1, B→8, D→0, L→1, Z→2, S→5
      // This is NOT generic Levenshtein - we only allow known OCR substitutions
      const normalizedLine = this.normalizeOcrNumbers(rawLine);
      if (normalizedLine.includes(cleanTarget)) {
        return {
          field: fieldName,
          value,
          status: 'VERIFIED',
          confidence: 0.95,
          foundText: block.Text!,
          location: this.getLocation(block),
          blockId: block.Id || '',
          note: 'Matched via OCR normalization (O=0, I=1, B=8, etc.)',
        };
      }

      // C. Safety Check: If Levenshtein is very close (e.g., 1 digit off),
      // flag as SUSPICIOUS (not FUZZY_MATCH) - requires human review
      // This catches cases like "76869" vs "76868" where it's likely a real error
      const distance = levenshtein(cleanTarget, rawLine.replace(/[^0-9]/g, ''));
      const maxLength = Math.max(cleanTarget.length, rawLine.replace(/[^0-9]/g, '').length);
      if (maxLength > 0) {
        const similarity = 1 - distance / maxLength;
        // If similarity is high (>0.85) but not exact, it's suspicious
        // This means a digit is wrong, which is critical for numeric IDs
        if (similarity > 0.85 && similarity < 1.0) {
          return {
            field: fieldName,
            value,
            status: 'SUSPICIOUS',
            confidence: similarity,
            foundText: block.Text!,
            location: this.getLocation(block),
            blockId: block.Id || '',
            note: `Close match but digit difference detected (${cleanTarget} vs ${rawLine.replace(/[^0-9]/g, '')}) - requires review`,
          };
        }
      }
    }

    // No match found
    return {
      field: fieldName,
      value,
      status: 'NOT_FOUND',
      confidence: 0,
      location: 'UNKNOWN',
    };
  }

  /**
   * RELAXED TEXT VERIFICATION
   * 
   * For text fields (names, addresses, etc.):
   * - Uses Levenshtein distance for fuzzy matching
   * - Allows minor spelling variations, OCR errors, whitespace differences
   * - Threshold: 85% similarity for FUZZY_MATCH
   */
  private verifyText(fieldName: string, value: string): VerificationResult {
    const cleanTarget = (value || '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanTarget) {
      // Empty values are considered verified (no data to verify)
      return {
        field: fieldName,
        value,
        status: 'VERIFIED',
        confidence: 1.0,
        location: 'UNKNOWN',
      };
    }

    const lineBlocks = this.blocks.filter(
      (b) => b.BlockType === 'LINE' && b.Text
    );

    let bestMatch = {
      text: '',
      score: 0,
      block: null as Block | null,
      blockId: '',
    };

    for (const block of lineBlocks) {
      const rawText = (block.Text || '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();

      // A. Direct Inclusion Check (exact substring match)
      if (rawText.includes(cleanTarget)) {
        return {
          field: fieldName,
          value,
          status: 'VERIFIED',
          confidence: 1.0,
          foundText: block.Text!,
          location: this.getLocation(block),
          blockId: block.Id || '',
        };
      }

      // B. Fuzzy Match (Levenshtein distance) - Safe for text fields
      const distance = levenshtein(cleanTarget, rawText);
      const maxLength = Math.max(cleanTarget.length, rawText.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;

      if (similarity > bestMatch.score && similarity > 0.85) {
        // 85% similarity threshold for text fields
        bestMatch = {
          text: block.Text!,
          score: similarity,
          block,
          blockId: block.Id || '',
        };
      }
    }

    // Determine Status
    if (bestMatch.score === 1.0) {
      return {
        field: fieldName,
        value,
        status: 'VERIFIED',
        confidence: 1.0,
        foundText: bestMatch.text,
        location: this.getLocation(bestMatch.block),
        blockId: bestMatch.blockId,
      };
    } else if (bestMatch.score > 0.85) {
      return {
        field: fieldName,
        value,
        status: 'FUZZY_MATCH',
        confidence: bestMatch.score,
        foundText: bestMatch.text,
        location: this.getLocation(bestMatch.block),
        blockId: bestMatch.blockId,
      };
    }

    return {
      field: fieldName,
      value,
      status: 'NOT_FOUND',
      confidence: 0,
      location: 'UNKNOWN',
    };
  }

  /**
   * Normalize common OCR number substitutions
   * O→0, D→0, I→1, L→1, Z→2, B→8, S→5
   */
  private normalizeOcrNumbers(text: string): string {
    return text
      .replace(/O/g, '0')
      .replace(/D/g, '0')
      .replace(/I/g, '1')
      .replace(/L/g, '1')
      .replace(/Z/g, '2')
      .replace(/B/g, '8')
      .replace(/S/g, '5');
  }

  /**
   * Verify multiple fields at once
   */
  public verifyFields(
    fields: Array<{ fieldName: string; value: string; type?: 'TEXT' | 'NUMERIC' }>
  ): VerificationResult[] {
    return fields.map(({ fieldName, value, type = 'TEXT' }) =>
      this.verifyField(fieldName, value, type)
    );
  }

  /**
   * Determine spatial location based on bounding box geometry
   * 
   * Textract provides normalized coordinates (0-1) where:
   * - Left: 0 = left edge, 1 = right edge
   * - Top: 0 = top edge, 1 = bottom edge
   */
  private getLocation(
    block: Block | null
  ): 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM' | 'UNKNOWN' {
    if (!block?.Geometry?.BoundingBox) {
      return 'UNKNOWN';
    }

    const { Left, Top } = block.Geometry.BoundingBox;

    if (Left === undefined || Top === undefined) {
      return 'UNKNOWN';
    }

    // Top half of document
    if (Top < 0.5) {
      return Left > 0.5 ? 'TOP_RIGHT' : 'TOP_LEFT';
    }

    // Bottom half
    return 'BOTTOM';
  }

  /**
   * Get all text blocks for debugging
   */
  public getAllText(): string[] {
    return this.blocks
      .filter((b) => b.BlockType === 'LINE' && b.Text)
      .map((b) => b.Text!);
  }

  /**
   * Check if a specific location contains expected text
   * Useful for fields like "numero_patente" which should be in TOP_RIGHT
   */
  public verifyFieldWithLocation(
    fieldName: string,
    value: string,
    expectedLocation: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM',
    type: 'TEXT' | 'NUMERIC' = 'TEXT'
  ): VerificationResult {
    const result = this.verifyField(fieldName, value, type);

    // If found but in wrong location, reduce confidence
    if (
      result.status === 'VERIFIED' &&
      result.location !== expectedLocation &&
      result.location !== 'UNKNOWN'
    ) {
      return {
        ...result,
        status: 'FUZZY_MATCH',
        confidence: result.confidence * 0.7, // Penalize wrong location
        note: `Found in ${result.location} but expected ${expectedLocation}`,
      };
    }

    // If SUSPICIOUS and in wrong location, escalate to NOT_FOUND
    if (
      result.status === 'SUSPICIOUS' &&
      result.location !== expectedLocation &&
      result.location !== 'UNKNOWN'
    ) {
      return {
        ...result,
        status: 'NOT_FOUND',
        confidence: 0,
        note: `Suspicious match found in wrong location (${result.location} vs ${expectedLocation})`,
      };
    }

    return result;
  }
}
