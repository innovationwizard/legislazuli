/**
 * Textract Verifier - The Deterministic Third Voter
 * 
 * This class acts as a "veto" system: it doesn't vote on what the value is,
 * but exercises veto power on what the value is NOT.
 * 
 * If Claude and Gemini agree on a value, but Textract cannot find it in the
 * document's raw text, we flag a Critical Discrepancy.
 */

import { Block, DetectDocumentTextCommandOutput } from '@aws-sdk/client-textract';
import levenshtein from 'js-levenshtein';

export interface VerificationResult {
  field: string;
  value: string;
  status: 'VERIFIED' | 'FUZZY_MATCH' | 'NOT_FOUND';
  confidence: number; // 0-1
  foundText?: string;
  location?: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM' | 'UNKNOWN';
  blockId?: string;
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
   * @returns VerificationResult with status and confidence
   */
  public verifyField(fieldName: string, value: string): VerificationResult {
    // 1. Sanitize input (remove spaces/symbols for comparison)
    const target = this.sanitize(value);
    
    if (!target) {
      // Empty values are considered verified (no data to verify)
      return {
        field: fieldName,
        value,
        status: 'VERIFIED',
        confidence: 1.0,
        location: 'UNKNOWN',
      };
    }

    let bestMatch = {
      text: '',
      score: 0,
      block: null as Block | null,
      blockId: '',
    };

    // 2. Iterate through all RAW TEXT LINES from Textract
    const lineBlocks = this.blocks.filter(
      (b) => b.BlockType === 'LINE' && b.Text
    );

    for (const block of lineBlocks) {
      const rawText = this.sanitize(block.Text || '');

      // A. Direct Inclusion Check (exact substring match)
      if (rawText.includes(target)) {
        bestMatch = {
          text: block.Text!,
          score: 1.0,
          block,
          blockId: block.Id || '',
        };
        break; // Perfect match found
      }

      // B. Fuzzy Match (Levenshtein distance)
      const distance = levenshtein(target, rawText);
      const maxLength = Math.max(target.length, rawText.length);
      const similarity = maxLength > 0 
        ? 1 - distance / maxLength 
        : 0;

      if (similarity > bestMatch.score && similarity > 0.8) {
        // 80% similarity threshold
        bestMatch = {
          text: block.Text!,
          score: similarity,
          block,
          blockId: block.Id || '',
        };
      }
    }

    // 3. Determine Status
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
    } else if (bestMatch.score > 0.8) {
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
   * Verify multiple fields at once
   */
  public verifyFields(
    fields: Array<{ fieldName: string; value: string }>
  ): VerificationResult[] {
    return fields.map(({ fieldName, value }) =>
      this.verifyField(fieldName, value)
    );
  }

  /**
   * Sanitize text for comparison (remove spaces, symbols, convert to uppercase)
   */
  private sanitize(text: string): string {
    return text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
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
    expectedLocation: 'TOP_RIGHT' | 'TOP_LEFT' | 'BOTTOM'
  ): VerificationResult {
    const result = this.verifyField(fieldName, value);

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
      };
    }

    return result;
  }
}

