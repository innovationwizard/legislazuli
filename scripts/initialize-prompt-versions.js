/**
 * Initialize prompt versions from current prompts
 * Run this once to set up version 1 for all document types and models
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local file manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import prompts (we'll need to read them from the file or define them here)
// For now, let's read from the prompts file
const promptsPath = path.join(__dirname, '..', 'lib', 'ai', 'prompts.ts');
let EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_PROMPT, EXTRACTION_SYSTEM_PROMPT_OPENAI, EXTRACTION_USER_PROMPT_OPENAI;

// Since we can't easily import TypeScript, let's define the prompts inline
// These should match lib/ai/prompts.ts
EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de datos especializado en documentos legales guatemaltecos.

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

EXTRACTION_USER_PROMPT = `Por favor, extrae todos los campos de esta Patente de Comercio guatemalteca. Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

EXTRACTION_SYSTEM_PROMPT_OPENAI = `Eres un extractor de datos especializado en documentos legales guatemaltecos con extrema precisión en la lectura de números.

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

EXTRACTION_USER_PROMPT_OPENAI = `Por favor, extrae todos los campos de esta Patente de Comercio guatemalteca.

ATENCIÓN ESPECIAL A CAMPOS NUMÉRICOS:
- Lee los números CARACTER POR CARACTER con extrema precisión
- Los campos "numero_patente" y "numero_registro" son CRÍTICOS - verifica que cada dígito sea correcto
- Si hay ambigüedad en un número, lee cuidadosamente el contexto visual del documento
- No confundas dígitos similares (ej: 6 vs 8, 1 vs 7, 0 vs O)
- Verifica que el número extraído coincida exactamente con lo que ves en el documento

Responde ÚNICAMENTE con el JSON solicitado, sin texto adicional.`;

async function initializePromptVersions(docType, model, systemPrompt, userPrompt) {
  // Deactivate any existing active prompts
  await supabase
    .from('prompt_versions')
    .update({ is_active: false })
    .eq('doc_type', docType)
    .eq('model', model);

  // Create system prompt version
  const { data: systemVersion, error: systemError } = await supabase
    .from('prompt_versions')
    .insert({
      doc_type: docType,
      model,
      prompt_type: 'system',
      version_number: 1,
      prompt_content: systemPrompt,
      is_active: true,
    })
    .select()
    .single();

  if (systemError || !systemVersion) {
    throw new Error(`Failed to create system prompt version: ${systemError?.message}`);
  }

  // Create user prompt version
  const { data: userVersion, error: userError } = await supabase
    .from('prompt_versions')
    .insert({
      doc_type: docType,
      model,
      prompt_type: 'user',
      version_number: 1,
      prompt_content: userPrompt,
      is_active: true,
    })
    .select()
    .single();

  if (userError || !userVersion) {
    throw new Error(`Failed to create user prompt version: ${userError?.message}`);
  }

  return {
    systemVersionId: systemVersion.id,
    userVersionId: userVersion.id,
  };
}

async function initialize() {
  const docTypes = ['patente_empresa', 'patente_sociedad'];
  const models = ['claude', 'gemini'];

  for (const docType of docTypes) {
    for (const model of models) {
      try {
        // Check if versions already exist
        const { data: existing } = await supabase
          .from('prompt_versions')
          .select('id')
          .eq('doc_type', docType)
          .eq('model', model)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`Skipping ${docType}/${model} - versions already exist`);
          continue;
        }

        // Get appropriate prompts
        const systemPrompt = model === 'claude' 
          ? EXTRACTION_SYSTEM_PROMPT 
          : EXTRACTION_SYSTEM_PROMPT_OPENAI;
        const userPrompt = model === 'claude'
          ? EXTRACTION_USER_PROMPT
          : EXTRACTION_USER_PROMPT_OPENAI;

        const { systemVersionId, userVersionId } = await initializePromptVersions(
          docType,
          model,
          systemPrompt,
          userPrompt
        );

        console.log(`✓ Initialized ${docType}/${model}: system=${systemVersionId}, user=${userVersionId}`);
      } catch (error) {
        console.error(`✗ Failed to initialize ${docType}/${model}:`, error.message);
      }
    }
  }

  console.log('\nInitialization complete!');
}

initialize()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Initialization failed:', error);
    process.exit(1);
  });

