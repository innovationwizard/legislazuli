/**
 * Sanitizes a filename for Supabase Storage
 * Removes spaces, special characters, and ensures URL-safe format
 */
export function sanitizeFilename(filename: string): string {
  // Get the file extension
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
  const extension = lastDot > 0 ? filename.substring(lastDot) : '';

  // Remove or replace problematic characters
  let sanitized = name
    // Replace spaces with underscores
    .replace(/\s+/g, '_')
    // Remove or replace accented characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    // Remove special characters except dots, hyphens, underscores
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Remove multiple consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '');

  // Ensure we have a valid filename
  if (!sanitized) {
    sanitized = 'file';
  }

  // Limit length to avoid issues
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }

  return sanitized + extension;
}








