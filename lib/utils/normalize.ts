/**
 * CRITICAL LEGAL REQUIREMENT:
 * Spanish accents (á, é, í, ó, ú, ñ, ü) MUST be preserved exactly.
 * Removing or modifying accents makes legal documents INVALID under
 * Guatemalan law and can result in legal consequences, monetary penalties, and even possibly jail time.
 * 
 * This function normalizes for comparison ONLY (whitespace, case, punctuation)
 * but NEVER modifies accent marks.
 */
export function normalize(value: string | null | undefined): string {
  if (!value || value === '[VACÍO]' || value === '[NO APLICA]' || value === '[ILEGIBLE]') {
    return '';
  }
  
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/, '');
}

export function fuzzyMatch(str1: string, str2: string): number {
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return 1.0;
  
  // Calculate Levenshtein distance similarity
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

