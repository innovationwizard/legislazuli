/**
 * Prompt Versioning System
 * Manages versioned prompts stored as JSON and tracks their performance
 */

import { createServerClient } from '@/lib/db/supabase';

export interface PromptVersion {
  id: string;
  doc_type: string;
  model: 'claude' | 'openai';
  prompt_type: 'system' | 'user';
  version_number: number;
  prompt_content: string;
  parent_version_id?: string;
  accuracy_score?: number;
  total_fields_tested?: number;
  correct_fields?: number;
  evolution_reason?: string;
  created_by?: string;
  created_at: string;
  is_active: boolean;
}

/**
 * Get active prompts for a document type and model
 */
export async function getActivePrompts(
  docType: string,
  model: 'claude' | 'openai'
): Promise<{ system: PromptVersion | null; user: PromptVersion | null }> {
  const supabase = createServerClient();

  const { data: prompts, error } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('doc_type', docType)
    .eq('model', model)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching active prompts:', error);
    return { system: null, user: null };
  }

  const system = prompts.find((p) => p.prompt_type === 'system') || null;
  const user = prompts.find((p) => p.prompt_type === 'user') || null;

  return { system, user };
}

/**
 * Get prompt version by ID
 */
export async function getPromptVersion(id: string): Promise<PromptVersion | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as PromptVersion;
}

/**
 * Save prompt versions used for an extraction
 */
export async function saveExtractionPromptVersions(
  extractionId: string,
  model: 'claude' | 'openai',
  systemPromptVersionId: string,
  userPromptVersionId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('extraction_prompt_versions')
    .upsert({
      extraction_id: extractionId,
      model,
      system_prompt_version_id: systemPromptVersionId,
      user_prompt_version_id: userPromptVersionId,
    }, {
      onConflict: 'extraction_id,model',
    });

  if (error) {
    console.error('Error saving extraction prompt versions:', error);
  }
}

/**
 * Create initial prompt versions from current prompts
 * This should be run once to initialize the system
 */
export async function initializePromptVersions(
  docType: string,
  model: 'claude' | 'openai',
  systemPrompt: string,
  userPrompt: string,
  createdBy?: string
): Promise<{ systemVersionId: string; userVersionId: string }> {
  const supabase = createServerClient();

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
      created_by: createdBy,
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
      created_by: createdBy,
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

/**
 * Create new prompt version (evolved from previous)
 */
export async function createPromptVersion(
  docType: string,
  model: 'claude' | 'openai',
  promptType: 'system' | 'user',
  promptContent: string,
  parentVersionId: string,
  evolutionReason: string,
  createdBy?: string
): Promise<string> {
  const supabase = createServerClient();

  // Get parent version to determine next version number
  const { data: parentVersion } = await supabase
    .from('prompt_versions')
    .select('version_number')
    .eq('id', parentVersionId)
    .single();

  const versionNumber = (parentVersion?.version_number || 0) + 1;

  // Create new version (inactive by default)
  const { data: newVersion, error } = await supabase
    .from('prompt_versions')
    .insert({
      doc_type: docType,
      model,
      prompt_type: promptType,
      version_number: versionNumber,
      prompt_content: promptContent,
      parent_version_id: parentVersionId,
      evolution_reason: evolutionReason,
      is_active: false,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error || !newVersion) {
    throw new Error(`Failed to create prompt version: ${error?.message}`);
  }

  return newVersion.id;
}

/**
 * Activate prompt versions (after successful backtesting)
 */
export async function activatePromptVersions(
  systemVersionId: string,
  userVersionId: string
): Promise<void> {
  const supabase = createServerClient();

  // Get versions to get doc_type and model
  const { data: systemVersion } = await supabase
    .from('prompt_versions')
    .select('doc_type, model')
    .eq('id', systemVersionId)
    .single();

  if (!systemVersion) {
    throw new Error('System prompt version not found');
  }

  // Deactivate all other versions for this doc_type and model
  await supabase
    .from('prompt_versions')
    .update({ is_active: false })
    .eq('doc_type', systemVersion.doc_type)
    .eq('model', systemVersion.model);

  // Activate new versions
  await supabase
    .from('prompt_versions')
    .update({ is_active: true })
    .in('id', [systemVersionId, userVersionId]);
}

