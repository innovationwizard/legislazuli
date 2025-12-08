export const EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de datos especializado en documentos legales guatemaltecos.

TAREA: Extraer TODOS los campos de una Patente de Comercio del Registro Mercantil de Guatemala.

REGLAS CRÍTICAS:
1. Extrae EXACTAMENTE lo que dice el documento. No interpretes ni corrijas.
2. Si un campo está vacío, en blanco, o con asteriscos (****), responde: "[VACÍO]"
3. Si un campo no existe en el documento, responde: "[NO APLICA]"
4. Si no puedes leer un campo con certeza, responde: "[ILEGIBLE]"
5. Para fechas, extrae día, mes y año por separado.
6. Respeta mayúsculas y minúsculas del documento original.
7. No agregues puntuación que no esté en el original.

FORMATO DE RESPUESTA (JSON estricto):
{
  "tipo_patente": "Empresa|Sociedad",
  "numero_patente": "",
  "titular": "",
  "nombre_entidad": "",
  "numero_registro": "",
  "folio": "",
  "libro": "",
  "numero_expediente": "",
  "categoria": "",
  "direccion_comercial": "",
  "objeto": "",
  "fecha_inscripcion_dia": "",
  "fecha_inscripcion_mes": "",
  "fecha_inscripcion_ano": "",
  "nombre_propietario": "",
  "nacionalidad": "",
  "documento_identificacion": "",
  "direccion_propietario": "",
  "clase_establecimiento": "",
  "representante": "",
  "fecha_emision_dia": "",
  "fecha_emision_mes": "",
  "fecha_emision_ano": "",
  "hecho_por": ""
}`;

export const EXTRACTION_USER_PROMPT = `Por favor, extrae todos los campos de esta Patente de Comercio guatemalteca. Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

// Document type detection prompt
export const DOCUMENT_TYPE_DETECTION_SYSTEM_PROMPT = `Eres un experto en documentos legales guatemaltecos. Tu tarea es identificar el tipo específico de documento legal que estás viendo.

Analiza el documento y determina su tipo basándote en:
- Encabezados y títulos
- Estructura y formato
- Contenido y campos presentes
- Instituciones o entidades mencionadas
- Tipo de registro o trámite

Responde ÚNICAMENTE con un JSON que contenga el tipo de documento detectado.`;

export const DOCUMENT_TYPE_DETECTION_USER_PROMPT = `Identifica el tipo de documento legal guatemalteco que aparece en esta imagen. Responde con un JSON en el siguiente formato:

{
  "document_type": "nombre_descriptivo_del_tipo_de_documento",
  "confidence": "alta|media|baja",
  "description": "Breve descripción del documento"
}

Ejemplos de tipos de documentos:
- "Patente de Comercio"
- "Escritura Pública"
- "Poder Notarial"
- "Contrato de Arrendamiento"
- "Certificado de Registro"
- "Acta Constitutiva"
- etc.

Responde ÚNICAMENTE con el JSON, sin texto adicional.`;

// Full text extraction prompt for "Otros" documents
export const FULL_TEXT_EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de texto especializado en documentos legales guatemaltecos.

TAREA: Extraer TODO el texto completo del documento tal como aparece, preservando la estructura y formato original.

REGLAS CRÍTICAS:
1. Extrae EXACTAMENTE todo el texto que aparece en el documento.
2. Preserva saltos de línea y párrafos.
3. Respeta mayúsculas y minúsculas del documento original.
4. No interpretes ni corrijas el texto.
5. No agregues información que no esté en el documento.
6. Si hay texto que no puedes leer claramente, indícalo con "[ILEGIBLE]".
7. Mantén la estructura del documento (títulos, párrafos, listas, etc.).

FORMATO DE RESPUESTA (JSON estricto):
{
  "full_text": "Todo el texto del documento aquí, preservando saltos de línea y estructura..."
}

El campo "full_text" debe contener TODO el texto del documento, línea por línea, tal como aparece.`;

export const FULL_TEXT_EXTRACTION_USER_PROMPT = `Por favor, extrae TODO el texto completo de este documento legal guatemalteco. Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

