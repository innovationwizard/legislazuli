/**
 * Parses "Número de Expediente" to extract the file number and year parts.
 * 
 * Examples:
 * - "28824 2019" -> { number: "28824", year: "2019" }
 * - "28824" -> { number: "28824", year: null }
 * - "2019" -> { number: null, year: "2019" }
 * - "28824-2019" -> { number: "28824", year: "2019" }
 */
export function parseExpediente(value: string | null | undefined): {
  number: string | null;
  year: string | null;
} {
  if (!value) {
    return { number: null, year: null };
  }

  const trimmed = value.trim();
  
  // Try to match patterns like "28824 2019" or "28824-2019"
  // Look for a 4-digit year (1900-2099)
  const yearMatch = trimmed.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : null;
  
  // Extract the number part (everything except the year)
  let number: string | null = null;
  if (year) {
    // Remove the year and any separators around it
    const withoutYear = trimmed.replace(/\s*[-]?\s*(19|20)\d{2}\b\s*/, '').trim();
    number = withoutYear || null;
  } else {
    // No year found, assume the whole thing is the number
    number = trimmed || null;
  }

  return { number, year };
}

/**
 * Combines expediente parts from multiple sources.
 * If one source has the number and another has the year, combine them.
 */
export function combineExpedienteParts(
  claudeValue: string | null | undefined,
  openaiValue: string | null | undefined
): { number: string | null; year: string | null } {
  const claude = parseExpediente(claudeValue);
  const openai = parseExpediente(openaiValue);

  // Combine: prefer non-null values, with Claude taking precedence if both exist
  return {
    number: claude.number || openai.number || null,
    year: claude.year || openai.year || null,
  };
}

