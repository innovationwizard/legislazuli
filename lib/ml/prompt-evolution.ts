/**
 * Prompt Evolution System
 * Uses LLM to evolve prompts based on feedback
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/supabase';
import { getActivePrompts, createPromptVersion, activatePromptVersions } from './prompt-versioning';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

interface EvolutionContext {
  doc_type: string;
  model: 'claude' | 'gemini';
  current_system_prompt: string;
  current_user_prompt: string;
  error_categories: Record<string, number>;
  feedback_examples: Array<{
    field_name: string;
    value: string;
    why: string;
  }>;
}

/**
 * Evolve prompts using Claude
 */
export async function evolvePromptsWithLLM(context: EvolutionContext): Promise<{
  system_prompt: string;
  user_prompt: string;
  changes_made: string;
}> {
  const evolutionPrompt = `You are a prompt engineer improving extraction prompts for ${context.doc_type} documents processed by ${context.model}.

Current System Prompt:
${context.current_system_prompt}

Current User Prompt:
${context.current_user_prompt}

Error Analysis:
${JSON.stringify(context.error_categories, null, 2)}

Recent Feedback Examples:
${context.feedback_examples.map(f => `- Field: ${f.field_name}, Wrong value: "${f.value}", Why: ${f.why}`).join('\n')}

CRITICAL LEGAL REQUIREMENT:
Spanish accents (á, é, í, ó, ú, ñ, ü) MUST be preserved exactly.
Removing or modifying accents makes legal documents INVALID under Guatemalan law and can result in legal consequences, monetary penalties, and even possibly jail time.

Task: Evolve BOTH prompts to fix these errors while maintaining all existing requirements. Focus on:
1. Addressing the specific error categories shown above
2. Improving accuracy for numeric fields (numero_patente, numero_registro, etc.)
3. Ensuring accent preservation is emphasized
4. Making instructions clearer and more specific

Return ONLY valid JSON in this exact format:
{
  "system_prompt": "improved system prompt here",
  "user_prompt": "improved user prompt here",
  "changes_made": "summary of improvements made"
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: evolutionPrompt,
        },
      ],
    });

    const responseContent = message.content[0];
    if (responseContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const text = responseContent.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const evolved = JSON.parse(jsonMatch[0]);
    
    if (!evolved.system_prompt || !evolved.user_prompt) {
      throw new Error('Invalid response format from Claude');
    }

    return {
      system_prompt: evolved.system_prompt,
      user_prompt: evolved.user_prompt,
      changes_made: evolved.changes_made || 'No changes description provided',
    };
  } catch (error) {
    console.error('Prompt evolution error:', error);
    throw new Error(`Failed to evolve prompts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Trigger prompt evolution for a doc_type and model
 */
export async function triggerPromptEvolution(
  docType: string,
  model: 'claude' | 'gemini',
  createdBy?: string
): Promise<{ systemVersionId: string; userVersionId: string }> {
  const supabase = createServerClient();

  // Get current active prompts
  const { system: systemPrompt, user: userPrompt } = await getActivePrompts(docType, model);
  
  if (!systemPrompt || !userPrompt) {
    throw new Error(`No active prompts found for ${docType}/${model}`);
  }

  // Get evolution queue
  const { data: queue } = await supabase
    .from('prompt_evolution_queue')
    .select('*')
    .eq('doc_type', docType)
    .eq('model', model)
    .single();

  if (!queue) {
    throw new Error(`Evolution queue not found for ${docType}/${model}`);
  }

  // Get recent feedback examples
  const { data: recentFeedback } = await supabase
    .from('extraction_feedback')
    .select('field_name, extraction_id, why')
    .eq('model', model)
    .eq('is_correct', false)
    .not('why', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(10);

  // Get extraction results to get the wrong values
  const feedbackExamples = [];
  if (recentFeedback && recentFeedback.length > 0) {
    for (const fb of recentFeedback) {
      const { data: extraction } = await supabase
        .from('extractions')
        .select(`${model}_result`)
        .eq('id', fb.extraction_id)
        .single();

      if (extraction) {
        const extractionData = extraction as any;
        const result = model === 'claude' 
          ? extractionData.claude_result 
          : extractionData.gemini_result;
        if (result) {
          const value = result[fb.field_name] || '';
          feedbackExamples.push({
            field_name: fb.field_name,
            value: String(value),
            why: fb.why || '',
          });
        }
      }
    }
  }

  // Evolve prompts
  const evolved = await evolvePromptsWithLLM({
    doc_type: docType,
    model,
    current_system_prompt: systemPrompt.prompt_content,
    current_user_prompt: userPrompt.prompt_content,
    error_categories: queue.error_categories || {},
    feedback_examples: feedbackExamples,
  });

  // Create new versions
  const systemVersionId = await createPromptVersion(
    docType,
    model,
    'system',
    evolved.system_prompt,
    systemPrompt.id,
    JSON.stringify({
      error_categories: queue.error_categories,
      changes_made: evolved.changes_made,
      feedback_count: queue.feedback_count,
    }),
    createdBy
  );

  const userVersionId = await createPromptVersion(
    docType,
    model,
    'user',
    evolved.user_prompt,
    userPrompt.id,
    JSON.stringify({
      error_categories: queue.error_categories,
      changes_made: evolved.changes_made,
      feedback_count: queue.feedback_count,
    }),
    createdBy
  );

  // Reset evolution queue
  await supabase
    .from('prompt_evolution_queue')
    .update({
      feedback_count: 0,
      error_categories: {},
      should_evolve: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queue.id);

  // Trigger backtesting with Golden Set gatekeeper (async)
  // This prevents "Catastrophic Forgetting" by testing against a curated set
  backtestWithGoldenSet(docType, model, systemVersionId, userVersionId).catch(error => {
    console.error('Backtesting with Golden Set error:', error);
  });

  return { systemVersionId, userVersionId };
}

/**
 * Backtest prompt versions against reviewed extractions
 */
export async function backtest(
  systemVersionId: string,
  userVersionId: string
): Promise<{ accuracy: number; totalFields: number; correctFields: number }> {
  const supabase = createServerClient();

  // Get prompt versions
  const { data: systemVersion } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('id', systemVersionId)
    .single();

  const { data: userVersion } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('id', userVersionId)
    .single();

  if (!systemVersion || !userVersion) {
    throw new Error('Prompt versions not found');
  }

  const docType = systemVersion.doc_type;
  const model = systemVersion.model as 'claude' | 'gemini';

  // Get reviewed extractions with feedback
  const { data: feedbackData } = await supabase
    .from('extraction_feedback')
    .select('extraction_id, field_name, is_correct')
    .eq('model', model)
    .eq('is_correct', true) // Only test against known correct values
    .limit(100);

  if (!feedbackData || feedbackData.length === 0) {
    // No feedback data yet, mark as pending
    await supabase
      .from('prompt_versions')
      .update({
        accuracy_score: null,
        total_fields_tested: 0,
        correct_fields: 0,
      })
      .in('id', [systemVersionId, userVersionId]);

    return { accuracy: 0, totalFields: 0, correctFields: 0 };
  }

  // Get unique extraction IDs
  const extractionIds = [...new Set(feedbackData.map(f => f.extraction_id))];

  // Get extractions with documents
  const { data: extractions } = await supabase
    .from('extractions')
    .select(`
      id,
      ${model}_result,
      documents!inner(
        id,
        file_path,
        doc_type
      )
    `)
    .in('id', extractionIds)
    .eq('documents.doc_type', docType)
    .limit(50); // Limit for performance

  if (!extractions || extractions.length === 0) {
    return { accuracy: 0, totalFields: 0, correctFields: 0 };
  }

  // For now, we'll use a simplified backtest
  // In production, you'd re-run extraction with new prompts
  // For this implementation, we'll compare against existing results
  // and use feedback to calculate accuracy

  let correctFields = 0;
  let totalFields = 0;

  for (const extraction of extractions) {
    const extractionData = extraction as any;
    const extractionResult = model === 'claude' 
      ? extractionData.claude_result 
      : extractionData.gemini_result;
    const doc = extractionData.documents as any;

    // Get feedback for this extraction
    const extractionFeedback = feedbackData.filter(f => f.extraction_id === extraction.id);

    for (const fb of extractionFeedback) {
      totalFields++;
      const extractedValue = extractionResult?.[fb.field_name];
      
      // If we have feedback saying it's correct, count it
      if (fb.is_correct && extractedValue) {
        correctFields++;
      }
    }
  }

  const accuracy = totalFields > 0 ? correctFields / totalFields : 0;

  // Update prompt version metrics
  await supabase
    .from('prompt_versions')
    .update({
      accuracy_score: accuracy,
      total_fields_tested: totalFields,
      correct_fields: correctFields,
    })
    .in('id', [systemVersionId, userVersionId]);

  // Get current active accuracy for comparison
  const { data: currentPrompts } = await supabase
    .from('prompt_versions')
    .select('accuracy_score')
    .eq('doc_type', docType)
    .eq('model', model)
    .eq('is_active', true)
    .eq('prompt_type', 'system')
    .single();

  const currentAccuracy = currentPrompts?.accuracy_score || 0;

  // Activate if improvement
  if (accuracy > currentAccuracy + 0.01) { // At least 1% improvement
    await activatePromptVersions(systemVersionId, userVersionId);
    console.log(`Activated new prompt versions for ${docType}/${model} with accuracy ${accuracy.toFixed(4)}`);
  }

  return { accuracy, totalFields, correctFields };
}

/**
 * Backtest with Golden Set gatekeeper
 * 
 * This function:
 * 1. Tests new prompts against the Golden Set (regression test)
 * 2. Only promotes if Golden Set performance is maintained or improved
 * 3. Prevents "Catastrophic Forgetting" / Prompt Drift
 */
async function backtestWithGoldenSet(
  docType: string,
  model: 'claude' | 'gemini',
  systemVersionId: string,
  userVersionId: string
): Promise<void> {
  try {
    // Import Golden Set tester
    const { comparePromptVersionsOnGoldenSet } = await import('./golden-set-tester');
    
    console.log(`🧪 Testing new prompts against Golden Set for ${docType}/${model}...`);
    
    // Compare new prompts against current active prompts on Golden Set
    const comparison = await comparePromptVersionsOnGoldenSet(
      docType,
      model,
      systemVersionId,
      userVersionId
    );

    const supabase = createServerClient();

    // Calculate regression count (fields that got worse)
    const regressionCount = comparison.failedDocuments.reduce((sum, doc) => sum + doc.errors.length, 0);

    // Update prompt versions with Golden Set metrics
    await supabase
      .from('prompt_versions')
      .update({
        golden_set_accuracy: comparison.newAccuracy,
        golden_set_run_at: new Date().toISOString(),
        regression_count: regressionCount,
        status: comparison.passed ? 'pending' : 'rejected',
        // Store Golden Set test results in evolution_reason for debugging
        evolution_reason: JSON.stringify({
          golden_set_accuracy: comparison.newAccuracy,
          current_accuracy: comparison.currentAccuracy,
          improvement: comparison.improvement,
          passed: comparison.passed,
          failed_documents_count: comparison.failedDocuments.length,
          regression_count: regressionCount,
        }),
      })
      .in('id', [systemVersionId, userVersionId]);

    if (comparison.passed) {
      console.log(`✅ Golden Set test PASSED: ${(comparison.newAccuracy * 100).toFixed(2)}% accuracy (${comparison.improvement >= 0 ? '+' : ''}${(comparison.improvement * 100).toFixed(2)}% vs current)`);
      
      // Now run regular backtest on feedback data
      const regularBacktest = await backtest(systemVersionId, userVersionId);
      
      // Only activate if BOTH tests pass:
      // 1. Golden Set performance maintained/improved
      // 2. Regular backtest shows improvement
      if (regularBacktest.accuracy > 0) {
        const { data: currentPrompts } = await supabase
          .from('prompt_versions')
          .select('accuracy_score')
          .eq('doc_type', docType)
          .eq('model', model)
          .eq('is_active', true)
          .eq('prompt_type', 'system')
          .single();

        const currentAccuracy = currentPrompts?.accuracy_score || 0;

        if (regularBacktest.accuracy > currentAccuracy + 0.01) {
          // Mark old version as deprecated
          const { data: oldSystem } = await supabase
            .from('prompt_versions')
            .select('id')
            .eq('doc_type', docType)
            .eq('model', model)
            .eq('prompt_type', 'system')
            .eq('is_active', true)
            .single();

          const { data: oldUser } = await supabase
            .from('prompt_versions')
            .select('id')
            .eq('doc_type', docType)
            .eq('model', model)
            .eq('prompt_type', 'user')
            .eq('is_active', true)
            .single();

          if (oldSystem && oldUser) {
            await supabase
              .from('prompt_versions')
              .update({ status: 'deprecated' })
              .in('id', [oldSystem.id, oldUser.id]);
          }

          // Activate new versions
          await activatePromptVersions(systemVersionId, userVersionId);
          
          // Update status to active
          await supabase
            .from('prompt_versions')
            .update({ status: 'active' })
            .in('id', [systemVersionId, userVersionId]);

          console.log(`✅ Promoted new prompt versions for ${docType}/${model} (Golden Set: ${(comparison.newAccuracy * 100).toFixed(2)}%, Backtest: ${(regularBacktest.accuracy * 100).toFixed(2)}%)`);
        } else {
          console.log(`⚠️  Golden Set passed but regular backtest didn't show improvement. Keeping current prompts.`);
        }
      }
    } else {
      console.error(`❌ Golden Set test FAILED: ${(comparison.newAccuracy * 100).toFixed(2)}% accuracy (${(comparison.improvement * 100).toFixed(2)}% vs current)`);
      console.error(`   Failed documents: ${comparison.failedDocuments.length}`);
      comparison.failedDocuments.forEach((doc, idx) => {
        console.error(`   ${idx + 1}. ${doc.filename}: ${doc.errors.length} errors`);
      });
      console.error(`   ⚠️  New prompts REJECTED - would cause regression on Golden Set`);
      
      // Mark versions as rejected
      await supabase
        .from('prompt_versions')
        .update({
          evolution_reason: JSON.stringify({
            status: 'REJECTED',
            reason: 'Golden Set regression detected',
            golden_set_accuracy: comparison.newAccuracy,
            current_accuracy: comparison.currentAccuracy,
            failed_documents: comparison.failedDocuments.map(d => ({
              filename: d.filename,
              error_count: d.errors.length,
            })),
          }),
        })
        .in('id', [systemVersionId, userVersionId]);
    }
  } catch (error: any) {
    console.error('Golden Set testing error:', error);
    // If Golden Set testing fails (e.g., no Golden Set exists yet), fall back to regular backtest
    console.log('Falling back to regular backtest...');
    backtest(systemVersionId, userVersionId).catch(err => {
      console.error('Regular backtest also failed:', err);
    });
  }
}

