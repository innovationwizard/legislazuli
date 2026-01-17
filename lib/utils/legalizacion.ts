export type LegalizacionDocType = 'dpi' | 'patente_empresa' | 'patente_sociedad';

export interface DpiFields {
  type: 'dpi';
  cui: string;
  nombreCompleto: string;
}

export interface PatenteFields {
  type: 'patente_empresa' | 'patente_sociedad';
  nombreEntidad: string;
  numeroRegistro: string;
  folio: string;
  libro: string;
}

export type LegalizacionFields = DpiFields | PatenteFields;

export function detectLegalizacionDocType(text: string): {
  type: LegalizacionDocType | 'unknown';
  reason?: string;
} {
  const normalized = normalizeForMatch(text);

  if (normalized.includes('DOCUMENTO PERSONAL DE IDENTIFICACION') || /\bDPI\b/.test(normalized)) {
    return { type: 'dpi', reason: 'Coincidencia con DPI' };
  }

  if (normalized.includes('PATENTE DE COMERCIO DE SOCIEDAD') || (normalized.includes('PATENTE DE COMERCIO') && normalized.includes('SOCIEDAD'))) {
    return { type: 'patente_sociedad', reason: 'Coincidencia con Patente de Comercio de Sociedad' };
  }

  if (normalized.includes('PATENTE DE COMERCIO DE EMPRESA') || (normalized.includes('PATENTE DE COMERCIO') && normalized.includes('EMPRESA MERCANTIL'))) {
    return { type: 'patente_empresa', reason: 'Coincidencia con Patente de Comercio de Empresa' };
  }

  return { type: 'unknown' };
}

export function extractLegalizacionFields(text: string, type: LegalizacionDocType): LegalizacionFields {
  switch (type) {
    case 'dpi':
      return extractDpiFields(text);
    case 'patente_sociedad':
      return extractPatenteFields(text, 'patente_sociedad');
    case 'patente_empresa':
    default:
      return extractPatenteFields(text, 'patente_empresa');
  }
}

function extractDpiFields(text: string): DpiFields {
  const lines = splitLines(text);

  const cuiMatch = text.match(/\b\d{4}\s?\d{5}\s?\d{4}\b/);
  const cui = cuiMatch ? cuiMatch[0].replace(/\s+/g, '') : '';

  const nombre = findValueByLabels(lines, [
    'NOMBRES',
    'NOMBRE',
  ]);
  const apellido = findValueByLabels(lines, [
    'APELLIDOS',
    'APELLIDO',
  ]);

  const nombreCompleto = [nombre, apellido].filter(Boolean).join(' ').trim();

  return {
    type: 'dpi',
    cui,
    nombreCompleto,
  };
}

function extractPatenteFields(text: string, type: PatenteFields['type']): PatenteFields {
  const lines = splitLines(text);

  const nombreLabels = type === 'patente_sociedad'
    ? ['NOMBRE DE LA SOCIEDAD', 'SOCIEDAD']
    : ['NOMBRE DE LA EMPRESA MERCANTIL', 'EMPRESA MERCANTIL', 'NOMBRE DE LA EMPRESA'];

  const nombreEntidad = findValueByLabels(lines, nombreLabels);
  const numeroRegistro = findNumberAfterLabels(text, ['NUMERO DE REGISTRO', 'NO. REGISTRO', 'NÚMERO DE REGISTRO']);
  const folio = findNumberAfterLabels(text, ['FOLIO']);
  const libro = findNumberAfterLabels(text, ['LIBRO']);

  return {
    type,
    nombreEntidad,
    numeroRegistro,
    folio,
    libro,
  };
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function findValueByLabels(lines: string[], labels: string[]): string {
  const normalizedLabels = labels.map((label) => normalizeForMatch(label));

  for (let i = 0; i < lines.length; i += 1) {
    const normalizedLine = normalizeForMatch(lines[i]);

    for (const label of normalizedLabels) {
      if (!normalizedLine.includes(label)) continue;

      const originalLine = lines[i];
      const valueFromLine = extractAfterLabel(originalLine, label);
      if (valueFromLine) {
        return valueFromLine;
      }

      if (lines[i + 1]) {
        return lines[i + 1];
      }
    }
  }

  return '';
}

function extractAfterLabel(line: string, normalizedLabel: string): string {
  const parts = line.split(/[:\-]/);
  if (parts.length <= 1) {
    return '';
  }

  const head = normalizeForMatch(parts[0]);
  if (!head.includes(normalizedLabel)) {
    return '';
  }

  return parts.slice(1).join(':').trim();
}

function findNumberAfterLabels(text: string, labels: string[]): string {
  const labelPattern = labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  const regex = new RegExp(`(?:${labelPattern})\\s*[:\\-]?\\s*([0-9][0-9\\s.-]{0,20})`, 'i');
  const match = text.match(regex);
  if (!match) return '';

  return match[1].replace(/[^\d]/g, '');
}
