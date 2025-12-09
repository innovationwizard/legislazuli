import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

/**
 * POST /api/feedback
 * Submit field-level feedback for extraction accuracy
 * Only accessible to user "condor"
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can submit feedback
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can submit feedback' }, { status: 403 });
    }

    const body = await request.json();
    const { extraction_id, field_name, model, is_correct, why } = body;

    if (!extraction_id || !field_name || !model || typeof is_correct !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: extraction_id, field_name, model, is_correct' },
        { status: 400 }
      );
    }

    if (!is_correct && (!why || why.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Why explanation is required when is_correct is false' },
        { status: 400 }
      );
    }

    if (why && why.length > 100) {
      return NextResponse.json(
        { error: 'Why explanation must be 100 characters or less' },
        { status: 400 }
      );
    }

    if (model !== 'claude' && model !== 'openai') {
      return NextResponse.json(
        { error: 'Model must be either "claude" or "openai"' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Verify extraction exists and user has access
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .select('document_id, documents!inner(user_id)')
      .eq('id', extraction_id)
      .single();

    if (extractionError || !extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    const document = extraction.documents as any;
    if (document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Insert feedback
    const { data: feedback, error: feedbackError } = await supabase
      .from('extraction_feedback')
      .insert({
        extraction_id,
        field_name,
        model,
        is_correct,
        why: why?.trim() || null,
        reviewed_by: session.user.id,
      })
      .select()
      .single();

    if (feedbackError) {
      console.error('Feedback insert error:', feedbackError);
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 });
    }

    // Get document type for evolution queue
    const { data: documentData } = await supabase
      .from('documents')
      .select('doc_type')
      .eq('id', extraction.document_id)
      .single();

    if (documentData && documentData.doc_type !== 'otros') {
      // Update evolution queue
      await updateEvolutionQueue(
        supabase,
        documentData.doc_type,
        model,
        is_correct,
        why
      );
    }

    return NextResponse.json({ success: true, feedback });
  } catch (error) {
    console.error('Feedback submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback?extraction_id=xxx
 * Get feedback for an extraction
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const extractionId = request.nextUrl.searchParams.get('extraction_id');
    if (!extractionId) {
      return NextResponse.json({ error: 'Missing extraction_id parameter' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify access
    const { data: extraction } = await supabase
      .from('extractions')
      .select('document_id, documents!inner(user_id)')
      .eq('id', extractionId)
      .single();

    if (!extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    const document = extraction.documents as any;
    if (document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get feedback
    const { data: feedback, error } = await supabase
      .from('extraction_feedback')
      .select('*')
      .eq('extraction_id', extractionId)
      .order('reviewed_at', { ascending: false });

    if (error) {
      console.error('Feedback fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });
    }

    return NextResponse.json({ feedback: feedback || [] });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Update evolution queue after feedback
 */
async function updateEvolutionQueue(
  supabase: any,
  doc_type: string,
  model: string,
  is_correct: boolean,
  why?: string
) {
  try {
    // Get or create queue entry
    let { data: queue, error: queueError } = await supabase
      .from('prompt_evolution_queue')
      .select('*')
      .eq('doc_type', doc_type)
      .eq('model', model)
      .single();

    if (queueError && queueError.code === 'PGRST116') {
      // Queue doesn't exist, create it
      const { data: newQueue, error: createError } = await supabase
        .from('prompt_evolution_queue')
        .insert({
          doc_type,
          model,
          feedback_count: 0,
          error_categories: {},
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create evolution queue:', createError);
        return;
      }
      queue = newQueue;
    } else if (queueError) {
      console.error('Failed to get evolution queue:', queueError);
      return;
    }

    const feedbackCount = (queue.feedback_count || 0) + 1;
    const errorCategories = queue.error_categories || {};

    // Categorize error if incorrect
    if (!is_correct && why) {
      const category = categorizeError(why);
      errorCategories[category] = (errorCategories[category] || 0) + 1;
    }

    // For first 50 feedbacks, evolve on any error with "why"
    // After 50, evolve only on significant error patterns
    const shouldEvolve = (!is_correct && why) || feedbackCount >= 50;

    // Update queue
    await supabase
      .from('prompt_evolution_queue')
      .update({
        feedback_count: feedbackCount,
        error_categories: errorCategories,
        should_evolve: shouldEvolve,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queue.id);

    // Trigger evolution if needed
    if (shouldEvolve) {
      // This will be handled by a background job or cron
      // For now, we'll trigger it synchronously (can be moved to queue later)
      console.log(`Triggering prompt evolution for ${doc_type}/${model}`);
      // Evolution will be triggered asynchronously
    }
  } catch (error) {
    console.error('Evolution queue update error:', error);
  }
}

/**
 * Categorize error based on why explanation
 */
function categorizeError(why: string): string {
  const lowerWhy = why.toLowerCase();
  
  if (lowerWhy.includes('accent') || lowerWhy.includes('acento') || lowerWhy.includes('á') || lowerWhy.includes('é') || lowerWhy.includes('í') || lowerWhy.includes('ó') || lowerWhy.includes('ú') || lowerWhy.includes('ñ')) {
    return 'accent_error';
  }
  if (lowerWhy.includes('digit') || lowerWhy.includes('número') || lowerWhy.includes('number') || lowerWhy.includes('dígito')) {
    return 'numeric_error';
  }
  if (lowerWhy.includes('ocr') || lowerWhy.includes('read') || lowerWhy.includes('legible') || lowerWhy.includes('ilegible')) {
    return 'ocr_error';
  }
  if (lowerWhy.includes('format') || lowerWhy.includes('formato') || lowerWhy.includes('structure')) {
    return 'formatting_error';
  }
  if (lowerWhy.includes('missing') || lowerWhy.includes('faltante') || lowerWhy.includes('vacío')) {
    return 'missing_field';
  }
  if (lowerWhy.includes('extra') || lowerWhy.includes('additional') || lowerWhy.includes('adicional')) {
    return 'extra_content';
  }
  
  return 'other_error';
}

