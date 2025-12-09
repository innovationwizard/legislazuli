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
8. Para campos numéricos (numero_patente, numero_registro, folio, etc.), lee cada dígito con máxima precisión.

MANEJO DE MARCAS DE AGUA Y TEXTO PARCIALMENTE OCULTO (IMPORTANTE):
- Este documento puede contener marcas de agua, sellos o texto superpuesto (como "Registro Mercantil", "RM", sellos gubernamentales)
- Estos elementos son DECORATIVOS y NO ocultan el texto legal subyacente
- LEE A TRAVÉS de las marcas de agua para extraer el contenido real del documento debajo de ellas
- Separa mentalmente estas capas visuales:
  * CAPA PRIMARIA: El texto legal real (texto negro sobre fondo crema)
  * CAPA SUPERPUESTA: Marcas de agua, sellos, estampillas (típicamente grises, translúcidas o circulares)
- SIEMPRE prioriza leer la CAPA PRIMARIA. Ignora los elementos superpuestos cuando intersectan con el texto del documento

MODO DE LECTURA PERMISIVO:
- Si el 70% o más de una palabra es visible, INFIERE la palabra completa
- Usa pistas contextuales (ej: si día=01 y año=2019, el mes debe ser un mes válido en español)
- Las marcas de agua típicamente no ocultan completamente el texto, solo lo superponen
- SOLO usa "[ILEGIBLE]" cuando:
  * Menos del 50% de los caracteres son visibles
  * No es posible inferencia contextual
  * El texto está genuinamente dañado, desvanecido o corrupto (NO solo con marca de agua)

INFERENCIA PARA CAMPOS DE FECHA:
- Para campos de fecha (fecha_inscripcion, fecha_emision):
  * Si un componente está parcialmente oculto pero contextualmente inferible (ej: mes visible como "Ma_o" o "M_yo"), usa inferencia lógica
  * Los meses se escriben típicamente en español: Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre
  * SOLO marca como "[ILEGIBLE]" si el texto es completamente ilegible, NO si está parcialmente visible detrás de marcas de agua
  * Usa el contexto de día y año para inferir el mes si está parcialmente visible

UBICACIÓN ESPACIAL DE CAMPOS (CRÍTICO):
- numero_patente: Busca ÚNICAMENTE en la esquina superior DERECHA del documento, en el campo explícitamente etiquetado como "No:" seguido del número.
  * Este campo aparece en el encabezado del documento, ANTES del campo "Titular:"
  * Típicamente es un número de 5 dígitos
  * IGNORA completamente todos los números de sellos, estampillas circulares y números de timbres que aparecen en la esquina superior IZQUIERDA
  * Los sellos circulares y estampillas NO son el número de patente - son elementos decorativos o de validación
  * El número de patente está claramente etiquetado con "No:" en la parte superior derecha

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

// Enhanced system prompt for OpenAI with stronger emphasis on numeric accuracy
export const EXTRACTION_SYSTEM_PROMPT_OPENAI = `Eres un extractor de datos especializado en documentos legales guatemaltecos con extrema precisión en la lectura de números.

TAREA: Extraer TODOS los campos de una Patente de Comercio del Registro Mercantil de Guatemala.

REGLAS CRÍTICAS:
1. Extrae EXACTAMENTE lo que dice el documento. No interpretes ni corrijas.
2. Si un campo está vacío, en blanco, o con asteriscos (****), responde: "[VACÍO]"
3. Si un campo no existe en el documento, responde: "[NO APLICA]"
4. Si no puedes leer un campo con certeza, responde: "[ILEGIBLE]"
5. Para fechas, extrae día, mes y año por separado.
6. Respeta mayúsculas y minúsculas del documento original.
7. No agregues puntuación que no esté en el original.

PRECISIÓN NUMÉRICA (CRÍTICO):
- Los campos "numero_patente" y "numero_registro" son los MÁS IMPORTANTES del documento
- Lee cada dígito CARACTER POR CARACTER, verificando visualmente en el documento
- Presta especial atención a dígitos similares:
  * 0 (cero) vs O (letra) vs 6 vs 8
  * 1 (uno) vs 7 vs I (letra i mayúscula)
  * 2 vs Z (letra)
  * 5 vs S (letra)
- Si hay dudas, lee el contexto alrededor del número para confirmar
- Verifica que el número completo coincida exactamente con lo visible en el documento
- NO inventes dígitos ni completes números parcialmente visibles
- Si un número está parcialmente oculto o borroso, usa "[ILEGIBLE]" en lugar de adivinar

MANEJO DE MARCAS DE AGUA Y TEXTO PARCIALMENTE OCULTO (IMPORTANTE):
- Este documento puede contener marcas de agua, sellos o texto superpuesto (como "Registro Mercantil", "RM", sellos gubernamentales)
- Estos elementos son DECORATIVOS y NO ocultan el texto legal subyacente
- LEE A TRAVÉS de las marcas de agua para extraer el contenido real del documento debajo de ellas
- Separa mentalmente estas capas visuales:
  * CAPA PRIMARIA: El texto legal real (texto negro sobre fondo crema)
  * CAPA SUPERPUESTA: Marcas de agua, sellos, estampillas (típicamente grises, translúcidas o circulares)
- SIEMPRE prioriza leer la CAPA PRIMARIA. Ignora los elementos superpuestos cuando intersectan con el texto del documento

MODO DE LECTURA PERMISIVO:
- Si el 70% o más de una palabra es visible, INFIERE la palabra completa
- Usa pistas contextuales (ej: si día=01 y año=2019, el mes debe ser un mes válido en español)
- Las marcas de agua típicamente no ocultan completamente el texto, solo lo superponen
- SOLO usa "[ILEGIBLE]" cuando:
  * Menos del 50% de los caracteres son visibles
  * No es posible inferencia contextual
  * El texto está genuinamente dañado, desvanecido o corrupto (NO solo con marca de agua)

INFERENCIA PARA CAMPOS DE FECHA:
- Para campos de fecha (fecha_inscripcion, fecha_emision):
  * Si un componente está parcialmente oculto pero contextualmente inferible (ej: mes visible como "Ma_o" o "M_yo"), usa inferencia lógica
  * Los meses se escriben típicamente en español: Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre
  * SOLO marca como "[ILEGIBLE]" si el texto es completamente ilegible, NO si está parcialmente visible detrás de marcas de agua
  * Usa el contexto de día y año para inferir el mes si está parcialmente visible
  * Ejemplo: Si ves "Ma_o" o "M_yo" y el contexto indica una fecha válida, infiere "Mayo"

UBICACIÓN ESPACIAL DE CAMPOS (CRÍTICO):
- numero_patente: Busca ÚNICAMENTE en la esquina superior DERECHA del documento, en el campo explícitamente etiquetado como "No:" seguido del número.
  * Este campo aparece en el encabezado del documento, ANTES del campo "Titular:"
  * Típicamente es un número de 5 dígitos
  * IGNORA completamente todos los números de sellos, estampillas circulares y números de timbres que aparecen en la esquina superior IZQUIERDA
  * Los sellos circulares y estampillas NO son el número de patente - son elementos decorativos o de validación
  * El número de patente está claramente etiquetado con "No:" en la parte superior derecha
  * PUNTOS DE REFERENCIA VISUAL: El número de patente aparece en el encabezado, en la esquina superior derecha, etiquetado como "No:", y aparece ANTES del campo "Titular:" en el documento

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

export const EXTRACTION_USER_PROMPT = `Por favor, extrae todos los campos de esta Patente de Comercio guatemalteca.

ATENCIÓN ESPECIAL AL CAMPO "numero_patente":
- Busca ÚNICAMENTE en la esquina superior DERECHA, en el campo etiquetado "No:"
- IGNORA completamente cualquier número que aparezca en sellos circulares, estampillas o timbres (especialmente en la esquina superior izquierda)
- El número de patente está claramente etiquetado con "No:" y aparece ANTES del campo "Titular:"

MANEJO DE MARCAS DE AGUA:
- Este documento puede tener marcas de agua superpuestas (como "RM Registro MERCANTIL")
- Estas marcas son DECORATIVAS y NO ocultan el texto legal
- LEE A TRAVÉS de las marcas de agua para extraer el texto real debajo
- Si un texto está parcialmente visible (70%+ visible), INFIERE la palabra completa
- Para fechas: Si el mes está parcialmente visible (ej: "Ma_o" o "M_yo"), infiere el mes completo usando contexto
- SOLO marca como "[ILEGIBLE]" si menos del 50% del texto es visible y no hay contexto para inferir

Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

// Enhanced prompt for OpenAI with emphasis on numeric accuracy
export const EXTRACTION_USER_PROMPT_OPENAI = `Por favor, extrae todos los campos de esta Patente de Comercio guatemalteca.

ATENCIÓN ESPECIAL A CAMPOS NUMÉRICOS:
- Lee los números CARACTER POR CARACTER con extrema precisión
- Los campos "numero_patente" y "numero_registro" son CRÍTICOS - verifica que cada dígito sea correcto
- Si hay ambigüedad en un número, lee cuidadosamente el contexto visual del documento
- No confundas dígitos similares (ej: 6 vs 8, 1 vs 7, 0 vs O)
- Verifica que el número extraído coincida exactamente con lo que ves en el documento

UBICACIÓN ESPACIAL CRÍTICA PARA "numero_patente":
- Busca ÚNICAMENTE en la esquina superior DERECHA del documento
- El campo está explícitamente etiquetado como "No:" seguido del número
- Aparece en el encabezado del documento, ANTES del campo "Titular:"
- Típicamente es un número de 5 dígitos
- IGNORA COMPLETAMENTE todos los números que aparezcan en:
  * Sellos circulares (especialmente en la esquina superior izquierda)
  * Estampillas o timbres
  * Cualquier elemento decorativo o de validación
- Los números en sellos circulares NO son el número de patente - son elementos de validación o decorativos
- PUNTO DE REFERENCIA: El número de patente está claramente etiquetado con "No:" en la parte superior derecha, antes de "Titular:"

MANEJO DE MARCAS DE AGUA Y TEXTO PARCIALMENTE OCULTO (CRÍTICO):
- Este documento puede tener marcas de agua superpuestas (como "RM Registro MERCANTIL", "Registro Mercantil", sellos gubernamentales)
- Estas marcas son DECORATIVAS y NO ocultan el texto legal subyacente
- LEE A TRAVÉS de las marcas de agua para extraer el contenido real del documento
- Separa mentalmente las capas visuales:
  * CAPA PRIMARIA: Texto legal real (negro sobre fondo crema) - ESTO ES LO QUE DEBES LEER
  * CAPA SUPERPUESTA: Marcas de agua, sellos (grises, translúcidas) - IGNORA ESTA CAPA
- SIEMPRE prioriza leer la CAPA PRIMARIA, incluso cuando intersecta con marcas de agua

MODO DE LECTURA PERMISIVO (USA INFERENCIA):
- Si el 70% o más de una palabra es visible, INFIERE la palabra completa
- Usa pistas contextuales para inferir texto parcialmente visible
- Las marcas de agua típicamente NO ocultan completamente el texto, solo lo superponen
- SOLO marca como "[ILEGIBLE]" cuando:
  * Menos del 50% de los caracteres son visibles
  * No hay contexto suficiente para inferir
  * El texto está genuinamente dañado o corrupto (NO solo con marca de agua)

INFERENCIA ESPECIAL PARA FECHAS:
- Para campos de fecha (fecha_inscripcion, fecha_emision):
  * Si un mes está parcialmente visible detrás de una marca de agua (ej: "Ma_o", "M_yo", "Ma__"), INFIERE el mes completo
  * Los meses en español son: Enero, Febrero, Marzo, Abril, Mayo, Junio, Julio, Agosto, Septiembre, Octubre, Noviembre, Diciembre
  * Usa el contexto: Si día=01 y año=2019, y ves "Ma_o", infiere "Mayo"
  * Si ves "M_yo" o "Ma__" con contexto de fecha válida, infiere "Mayo"
  * SOLO marca como "[ILEGIBLE]" si el texto es completamente ilegible (menos del 50% visible) Y no hay contexto para inferir
  * NO uses "[ILEGIBLE]" solo porque hay una marca de agua superpuesta - LEE A TRAVÉS de ella

Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

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

