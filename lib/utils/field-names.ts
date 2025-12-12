/**
 * Maps database field keys to Spanish display names
 */
export const FIELD_NAME_MAP: Record<string, string> = {
  tipo_patente: 'Tipo de Patente',
  numero_patente: 'Número de Patente',
  titular: 'Titular',
  nombre_entidad: 'Nombre de la Entidad',
  numero_registro: 'Número de Registro',
  folio: 'Folio',
  libro: 'Libro',
  numero_expediente: 'Número de Expediente',
  categoria: 'Categoría',
  direccion_comercial: 'Dirección Comercial',
  direccion_propietario: 'Dirección del Propietario',
  direccion_entidad: 'Dirección de la Entidad',
  objeto: 'Objeto',
  clase_establecimiento: 'Clase de Establecimiento',
  fecha_inscripcion: 'Fecha de Inscripción',
  fecha_emision: 'Fecha de Emisión',
  inscripcion_provisional: 'Inscripción Provisional',
  inscripcion_definitiva: 'Inscripción Definitiva',
  nombre_propietario: 'Nombre del Propietario',
  nacionalidad: 'Nacionalidad',
  documento_identificacion: 'Documento de Identificación',
  representante: 'Representante',
  hecho_por: 'Hecho por',
};

/**
 * Translates confidence level to Spanish
 */
export function translateConfidence(confidence: string): string {
  const translations: Record<string, string> = {
    full: 'completa',
    partial: 'parcial',
    review_required: 'requiere revisión',
  };
  return translations[confidence] || confidence;
}

/**
 * Converts field keys to display names
 */
export function getFieldDisplayName(fieldKey: string): string {
  return FIELD_NAME_MAP[fieldKey] || fieldKey;
}








