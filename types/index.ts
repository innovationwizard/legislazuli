// Field extraction types
export interface PatenteComercionFields {
  tipo_patente: string;
  numero_patente: string;
  titular: string;
  nombre_entidad: string;
  numero_registro: string;
  folio: string;
  libro: string;
  numero_expediente: string;
  categoria: string;
  direccion_comercial: string;
  direccion_propietario?: string;
  direccion_entidad?: string;
  objeto: string;
  clase_establecimiento?: string;
  fecha_inscripcion: {
    numeric: string;
    words: string;
  };
  fecha_emision: {
    numeric: string;
    words: string;
  };
  inscripcion_provisional?: {
    numeric: string;
    words: string;
  };
  inscripcion_definitiva?: {
    numeric: string;
    words: string;
  };
  nombre_propietario: string;
  nacionalidad: string;
  documento_identificacion?: string;
  representante?: string;
  hecho_por: string;
}

// Raw API response format
// Note: JSON objects cannot have duplicate keys, so if a document has multiple
// fields with the same semantic meaning, the AI should return them as arrays
// or with distinguishing suffixes. The final ExtractedField[] array can contain
// multiple entries with the same field_name to preserve all occurrences.
export interface RawExtractionFields {
  tipo_patente: string;
  numero_patente: string;
  titular: string;
  nombre_entidad: string;
  numero_registro: string;
  folio: string;
  libro: string;
  numero_expediente: string;
  categoria: string;
  direccion_comercial: string;
  direccion_propietario?: string;
  direccion_entidad?: string;
  objeto: string;
  clase_establecimiento?: string;
  fecha_inscripcion_dia: string;
  fecha_inscripcion_mes: string;
  fecha_inscripcion_ano: string;
  nombre_propietario: string;
  nacionalidad: string;
  documento_identificacion?: string;
  representante?: string;
  fecha_emision_dia: string;
  fecha_emision_mes: string;
  fecha_emision_ano: string;
  hecho_por: string;
  // If a document has multiple occurrences of the same field type,
  // they can be returned with suffixes (e.g., direccion_propietario_2)
  // or as arrays. The consensus engine will handle them appropriately.
  [key: string]: string | string[] | undefined;
}

export interface ConsensusResult {
  field_name: string;
  claude_value: string;
  openai_value: string;
  final_value: string | null;
  match: boolean;
  confidence: number;
}

export interface ExtractionResult {
  extraction_id: string;
  confidence: 'full' | 'partial' | 'review_required';
  fields: ExtractedField[];
  discrepancies?: string[];
}

export interface ExtractedField {
  field_name: string;
  field_value: string;
  field_value_words?: string;
  needs_review: boolean;
  // Debug fields for user "condor" - shows model outputs
  claude_value?: string;
  openai_value?: string;
  match?: boolean;
  confidence?: number;
}

export type DocType = 'patente_empresa' | 'patente_sociedad' | 'otros';

