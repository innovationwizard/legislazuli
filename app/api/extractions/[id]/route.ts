import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { compareResults, compareGenericResults } from '@/lib/ai/consensus';
import { RawExtractionFields } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .select(`
        *,
        documents (
          id,
          filename,
          doc_type,
          detected_document_type
        )
      `)
      .eq('id', params.id)
      .is('deleted_at', null) // Only get non-deleted extractions
      .single();

    if (extractionError || !extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    // Verify ownership
    const { data: document } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', extraction.document_id)
      .single();

    if (!document || document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get extracted fields
    const { data: fields, error: fieldsError } = await supabase
      .from('extracted_fields')
      .select('*')
      .eq('extraction_id', params.id)
      .order('field_order', { ascending: true });

    if (fieldsError) {
      console.error('Fields fetch error:', fieldsError);
    }

    // For user "condor", compute consensus results to show model outputs
    let consensusResults: any = null;
    const isCondor = session.user.email === 'condor';
    
    if (isCondor && extraction.claude_result && extraction.openai_result) {
      try {
        const claudeRaw = extraction.claude_result as RawExtractionFields;
        const openaiRaw = extraction.openai_result as RawExtractionFields;
        
        // Check if this is a generic "otros" document or structured document
        const docType = (extraction.documents as any)?.doc_type;
        
        if (docType === 'otros') {
          const genericResult = compareGenericResults(claudeRaw, openaiRaw);
          consensusResults = genericResult.results;
        } else {
          const specificResult = compareResults(claudeRaw, openaiRaw);
          consensusResults = specificResult.results;
        }
      } catch (error) {
        console.error('Error computing consensus results for condor:', error);
        // Continue without consensus results if there's an error
      }
    }

    return NextResponse.json({
      ...extraction,
      fields: fields || [],
      consensus_results: consensusResults, // Only included for user "condor"
    });
  } catch (error) {
    console.error('Error fetching extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    // Get extraction to verify ownership
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .select('document_id, documents!inner(user_id)')
      .eq('id', params.id)
      .is('deleted_at', null) // Only allow deleting non-deleted extractions
      .single();

    if (extractionError || !extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    // Verify ownership
    const document = extraction.documents as any;
    if (!document || document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Soft delete: set deleted_at timestamp instead of actually deleting
    const { error: deleteError } = await supabase
      .from('extractions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete extraction' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

