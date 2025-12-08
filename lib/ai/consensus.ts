import { RawExtractionFields, PatenteComercionFields, ConsensusResult, ExtractedField } from '@/types';
import { normalize, fuzzyMatch } from '@/lib/utils/normalize';
import { dateToWords, formatDateNumeric } from '@/lib/utils/numbers-to-words';

const CRITICAL_FIELDS = [
  'numero_registro',
  'numero_patente',
  'nombre_entidad',
  'fecha_inscripcion',
  'fecha_emision',
];

const ALL_FIELDS = [
  'tipo_patente',
  'numero_patente',
  'titular',
  'nombre_entidad',
  'numero_registro',
  'folio',
  'libro',
  'numero_expediente',
  'categoria',
  'direccion_comercial',
  'direccion_propietario',
  'direccion_entidad',
  'objeto',
  'clase_establecimiento',
  'fecha_inscripcion',
  'fecha_emision',
  'inscripcion_provisional',
  'inscripcion_definitiva',
  'nombre_propietario',
  'nacionalidad',
  'documento_identificacion',
  'representante',
  'hecho_por',
];

function convertRawToStructured(raw: RawExtractionFields): Partial<PatenteComercionFields> {
  const fechaInscripcionNumeric = formatDateNumeric(
    raw.fecha_inscripcion_dia,
    raw.fecha_inscripcion_mes,
    raw.fecha_inscripcion_ano
  );
  const fechaInscripcionWords = dateToWords(
    raw.fecha_inscripcion_dia,
    raw.fecha_inscripcion_mes,
    raw.fecha_inscripcion_ano
  );

  const fechaEmisionNumeric = formatDateNumeric(
    raw.fecha_emision_dia,
    raw.fecha_emision_mes,
    raw.fecha_emision_ano
  );
  const fechaEmisionWords = dateToWords(
    raw.fecha_emision_dia,
    raw.fecha_emision_mes,
    raw.fecha_emision_ano
  );

  return {
    tipo_patente: raw.tipo_patente,
    numero_patente: raw.numero_patente,
    titular: raw.titular,
    nombre_entidad: raw.nombre_entidad,
    numero_registro: raw.numero_registro,
    folio: raw.folio,
    libro: raw.libro,
    numero_expediente: raw.numero_expediente,
    categoria: raw.categoria,
    direccion_comercial: raw.direccion_comercial,
    direccion_propietario: raw.direccion_propietario,
    direccion_entidad: raw.direccion_entidad,
    objeto: raw.objeto,
    clase_establecimiento: raw.clase_establecimiento,
    fecha_inscripcion: {
      numeric: fechaInscripcionNumeric,
      words: fechaInscripcionWords,
    },
    fecha_emision: {
      numeric: fechaEmisionNumeric,
      words: fechaEmisionWords,
    },
    nombre_propietario: raw.nombre_propietario,
    nacionalidad: raw.nacionalidad,
    documento_identificacion: raw.documento_identificacion,
    representante: raw.representante,
    hecho_por: raw.hecho_por,
  };
}

function compareField(
  fieldName: string,
  claudeValue: any,
  openaiValue: any
): ConsensusResult {
  const c = typeof claudeValue === 'string' ? normalize(claudeValue) : String(claudeValue || '');
  const o = typeof openaiValue === 'string' ? normalize(openaiValue) : String(openaiValue || '');

  if (c === o) {
    return {
      field_name: fieldName,
      claude_value: c,
      openai_value: o,
      final_value: c,
      match: true,
      confidence: 1.0,
    };
  }

  const similarity = fuzzyMatch(c, o);
  if (similarity > 0.95) {
    return {
      field_name: fieldName,
      claude_value: c,
      openai_value: o,
      final_value: c,
      match: true,
      confidence: similarity,
    };
  }

  return {
    field_name: fieldName,
    claude_value: c,
    openai_value: o,
    final_value: null,
    match: false,
    confidence: similarity,
  };
}

export function compareResults(
  claudeRaw: RawExtractionFields,
  openaiRaw: RawExtractionFields
): {
  consensus: PatenteComercionFields;
  results: ConsensusResult[];
  confidence: 'full' | 'partial' | 'review_required';
  discrepancies: string[];
} {
  const claude = convertRawToStructured(claudeRaw);
  const openai = convertRawToStructured(openaiRaw);

  const results: ConsensusResult[] = [];
  const discrepancies: string[] = [];
  const consensus: any = {};

  // Compare simple fields
  const simpleFields = [
    'tipo_patente',
    'numero_patente',
    'titular',
    'nombre_entidad',
    'numero_registro',
    'folio',
    'libro',
    'numero_expediente',
    'categoria',
    'direccion_comercial',
    'direccion_propietario',
    'direccion_entidad',
    'objeto',
    'clase_establecimiento',
    'nombre_propietario',
    'nacionalidad',
    'documento_identificacion',
    'representante',
    'hecho_por',
  ];

  for (const field of simpleFields) {
    const result = compareField(field, claude[field as keyof typeof claude], openai[field as keyof typeof openai]);
    results.push(result);
    
    if (result.match) {
      consensus[field] = result.final_value;
    } else {
      consensus[field] = result.claude_value || result.openai_value || '';
      discrepancies.push(field);
    }
  }

  // Compare date fields
  const fechaInscripcionResult = compareField(
    'fecha_inscripcion',
    claude.fecha_inscripcion?.numeric || '',
    openai.fecha_inscripcion?.numeric || ''
  );
  results.push(fechaInscripcionResult);
  
  if (fechaInscripcionResult.match) {
    consensus.fecha_inscripcion = claude.fecha_inscripcion || openai.fecha_inscripcion;
  } else {
    consensus.fecha_inscripcion = claude.fecha_inscripcion || openai.fecha_inscripcion;
    discrepancies.push('fecha_inscripcion');
  }

  const fechaEmisionResult = compareField(
    'fecha_emision',
    claude.fecha_emision?.numeric || '',
    openai.fecha_emision?.numeric || ''
  );
  results.push(fechaEmisionResult);
  
  if (fechaEmisionResult.match) {
    consensus.fecha_emision = claude.fecha_emision || openai.fecha_emision;
  } else {
    consensus.fecha_emision = claude.fecha_emision || openai.fecha_emision;
    discrepancies.push('fecha_emision');
  }

  // Determine confidence level
  const totalFields = results.length;
  const matchedFields = results.filter(r => r.match).length;
  const matchPercentage = matchedFields / totalFields;

  // Check critical fields
  const criticalFieldResults = results.filter(r => CRITICAL_FIELDS.includes(r.field_name));
  const criticalMatches = criticalFieldResults.filter(r => r.match).length;
  const allCriticalMatch = criticalMatches === CRITICAL_FIELDS.length;

  let confidence: 'full' | 'partial' | 'review_required';
  if (matchPercentage === 1.0 && allCriticalMatch) {
    confidence = 'full';
  } else if (matchPercentage >= 0.9 && allCriticalMatch) {
    confidence = 'partial';
  } else {
    confidence = 'review_required';
  }

  return {
    consensus: consensus as PatenteComercionFields,
    results,
    confidence,
    discrepancies,
  };
}

export function convertToExtractedFields(
  consensus: PatenteComercionFields,
  discrepancies: string[]
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // Add all fields in order
  const fieldOrder: Array<{ key: keyof PatenteComercionFields; label: string }> = [
    { key: 'tipo_patente', label: 'Tipo de Patente' },
    { key: 'numero_patente', label: 'Número de Patente' },
    { key: 'titular', label: 'Titular' },
    { key: 'nombre_entidad', label: 'Nombre de la Entidad' },
    { key: 'numero_registro', label: 'Número de Registro' },
    { key: 'folio', label: 'Folio' },
    { key: 'libro', label: 'Libro' },
    { key: 'numero_expediente', label: 'Número de Expediente' },
    { key: 'categoria', label: 'Categoría' },
    { key: 'direccion_comercial', label: 'Dirección Comercial' },
    { key: 'direccion_propietario', label: 'Dirección del Propietario' },
    { key: 'direccion_entidad', label: 'Dirección de la Entidad' },
    { key: 'objeto', label: 'Objeto' },
    { key: 'clase_establecimiento', label: 'Clase de Establecimiento' },
    { key: 'nombre_propietario', label: 'Nombre del Propietario' },
    { key: 'nacionalidad', label: 'Nacionalidad' },
    { key: 'documento_identificacion', label: 'Documento de Identificación' },
    { key: 'representante', label: 'Representante' },
    { key: 'hecho_por', label: 'Hecho por' },
  ];

  fieldOrder.forEach(({ key, label }, index) => {
    const value = consensus[key];
    if (value !== undefined && value !== null && value !== '') {
      fields.push({
        field_name: label,
        field_value: String(value),
        needs_review: discrepancies.includes(key as string),
      });
    }
  });

  // Add date fields
  if (consensus.fecha_inscripcion) {
    fields.push({
      field_name: 'Fecha de Inscripción',
      field_value: consensus.fecha_inscripcion.numeric,
      field_value_words: consensus.fecha_inscripcion.words,
      needs_review: discrepancies.includes('fecha_inscripcion'),
    });
  }

  if (consensus.fecha_emision) {
    fields.push({
      field_name: 'Fecha de Emisión',
      field_value: consensus.fecha_emision.numeric,
      field_value_words: consensus.fecha_emision.words,
      needs_review: discrepancies.includes('fecha_emision'),
    });
  }

  return fields;
}

/**
 * Generic consensus function for "Otros" documents
 * Works with any fields dynamically extracted from the document
 */
export function compareGenericResults(
  claudeRaw: RawExtractionFields,
  openaiRaw: RawExtractionFields
): {
  consensus: Record<string, any>;
  results: ConsensusResult[];
  confidence: 'full' | 'partial' | 'review_required';
  discrepancies: string[];
} {
  // Get all unique field names from both results
  const allFields = new Set<string>();
  Object.keys(claudeRaw).forEach(key => allFields.add(key));
  Object.keys(openaiRaw).forEach(key => allFields.add(key));

  const results: ConsensusResult[] = [];
  const discrepancies: string[] = [];
  const consensus: Record<string, any> = {};

  // Compare all fields
  for (const fieldName of allFields) {
    const claudeValue = claudeRaw[fieldName];
    const openaiValue = openaiRaw[fieldName];

    // Skip if both are empty/null/undefined
    if (!claudeValue && !openaiValue) {
      continue;
    }

    const result = compareField(fieldName, claudeValue, openaiValue);
    results.push(result);

    if (result.match) {
      consensus[fieldName] = result.final_value;
    } else {
      // Prefer Claude's value, fallback to OpenAI's
      consensus[fieldName] = result.claude_value || result.openai_value || '';
      discrepancies.push(fieldName);
    }
  }

  // Determine confidence level
  const totalFields = results.length;
  if (totalFields === 0) {
    return {
      consensus: {},
      results: [],
      confidence: 'review_required',
      discrepancies: [],
    };
  }

  const matchedFields = results.filter(r => r.match).length;
  const matchPercentage = matchedFields / totalFields;

  let confidence: 'full' | 'partial' | 'review_required';
  if (matchPercentage >= 0.95) {
    confidence = 'full';
  } else if (matchPercentage >= 0.8) {
    confidence = 'partial';
  } else {
    confidence = 'review_required';
  }

  return {
    consensus,
    results,
    confidence,
    discrepancies,
  };
}

/**
 * Convert generic consensus result to ExtractedField array
 */
export function convertGenericToExtractedFields(
  consensus: Record<string, any>,
  discrepancies: string[]
): ExtractedField[] {
  const fields: ExtractedField[] = [];

  // Sort fields by name for consistent ordering
  const sortedFields = Object.keys(consensus).sort();

  sortedFields.forEach((fieldName, index) => {
    const value = consensus[fieldName];
    if (value !== undefined && value !== null && value !== '') {
      // Format field name: convert snake_case to Title Case
      const formattedName = fieldName
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      fields.push({
        field_name: formattedName,
        field_value: String(value),
        needs_review: discrepancies.includes(fieldName),
      });
    }
  });

  return fields;
}

