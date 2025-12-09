/**
 * Initialize prompt versions from current prompts
 * Run this once to set up version 1 for all document types and models
 */

// Load environment variables FIRST before any other imports
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local file manually
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf8');
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

// Now import modules that depend on env vars
import { createServerClient } from '../lib/db/supabase';
import { initializePromptVersions } from '../lib/ml/prompt-versioning';
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_USER_PROMPT,
  EXTRACTION_SYSTEM_PROMPT_OPENAI,
  EXTRACTION_USER_PROMPT_OPENAI,
} from '../lib/ai/prompts';

async function initialize() {
  const supabase = createServerClient();
  const docTypes = ['patente_empresa', 'patente_sociedad'];
  const models = ['claude', 'gemini'] as const;

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
        console.error(`✗ Failed to initialize ${docType}/${model}:`, error);
      }
    }
  }

  console.log('Initialization complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  initialize()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

export { initialize };

