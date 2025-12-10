import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

/**
 * GET /api/golden-set
 * Get candidate documents for Golden Set (100% accuracy, not already in Golden Set)
 * Only accessible to user "condor"
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can access Golden Set management
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can access Golden Set' }, { status: 403 });
    }

    const supabase = createServerClient();

    // PRIORITY 1: Documents that were flagged (SUSPICIOUS/NOT_FOUND) but have human feedback
    // These are the "hard cases" - most valuable for Golden Set
    const { data: flaggedExtractions, error: flaggedError } = await supabase
      .from('extractions')
      .select(`
        id,
        confidence,
        created_at,
        document_id,
        consensus_result,
        documents!inner(
          id,
          filename,
          doc_type,
          is_golden_set,
          uploaded_at,
          user_id
        )
      `)
      .eq('documents.is_golden_set', false)
      .eq('documents.user_id', session.user.id)
      .in('confidence', ['partial', 'review_required'])
      .order('created_at', { ascending: false })
      .limit(50);

    // PRIORITY 2: Documents with 100% accuracy (confidence = 'full')
    // These are "easy wins" but still valuable for regression testing
    const { data: perfectExtractions, error: perfectError } = await supabase
      .from('extractions')
      .select(`
        id,
        confidence,
        created_at,
        document_id,
        consensus_result,
        documents!inner(
          id,
          filename,
          doc_type,
          is_golden_set,
          uploaded_at,
          user_id
        )
      `)
      .eq('confidence', 'full')
      .eq('documents.is_golden_set', false)
      .eq('documents.user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Combine and prioritize flagged documents first
    const allExtractions = [
      ...(flaggedExtractions || []).map((e: any) => ({ ...e, priority: 'hard' })),
      ...(perfectExtractions || []).map((e: any) => ({ ...e, priority: 'easy' })),
    ];

    const extractionsError = flaggedError || perfectError;
    if (extractionsError) {
      console.error('Error fetching Golden Set candidates:', extractionsError);
      return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
    }

    if (allExtractions.length === 0) {
      return NextResponse.json({ documents: [] });
    }

    // Get extraction details for each document
    const documentsWithExtractions = await Promise.all(
      allExtractions.map(async (extraction: any) => {
        const doc = extraction.documents;
        
        // Get extracted fields
        const { data: fields } = await supabase
          .from('extracted_fields')
          .select('*')
          .eq('extraction_id', extraction.id)
          .order('field_order', { ascending: true });

        return {
          id: doc.id,
          filename: doc.filename,
          doc_type: doc.doc_type,
          is_golden_set: doc.is_golden_set,
          uploaded_at: doc.uploaded_at,
          priority: extraction.priority || 'easy', // 'hard' for flagged, 'easy' for perfect
          extraction: {
            id: extraction.id,
            confidence: extraction.confidence,
            created_at: extraction.created_at,
            fields: fields || [],
          },
        };
      })
    );

    // Remove duplicates (same document might have multiple extractions)
    const uniqueDocuments = documentsWithExtractions.reduce((acc: any[], doc: any) => {
      if (!acc.find(d => d.id === doc.id)) {
        acc.push(doc);
      }
      return acc;
    }, []);

    return NextResponse.json({ documents: uniqueDocuments });
  } catch (error) {
    console.error('Golden Set GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/golden-set
 * Mark a document as Golden Set
 * Only accessible to user "condor"
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can mark documents as Golden Set
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can mark Golden Set' }, { status: 403 });
    }

    const body = await request.json();
    const { document_id, notes } = body;

    if (!document_id) {
      return NextResponse.json({ error: 'Missing document_id' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify document exists and user has access
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch the "Perfect" Data - the current consensus_result (post-review)
    // This is what we'll snapshot as the immutable truth
    const { data: currentExtraction, error: extractionError } = await supabase
      .from('extractions')
      .select('id, consensus_result')
      .eq('document_id', document_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (extractionError || !currentExtraction || !currentExtraction.consensus_result) {
      return NextResponse.json({ 
        error: 'No extraction found to snapshot. Please ensure the document has been extracted.' 
      }, { status: 404 });
    }

    // ATOMIC TRANSACTION: Mark as Golden AND Freeze Truth using SQL function
    const { error: rpcError } = await supabase.rpc('promote_to_golden_set', {
      doc_id: document_id,
      truth_json: currentExtraction.consensus_result,
      verified_by_uuid: session.user.id,
      notes_text: notes || null,
    });

    if (rpcError) {
      console.error('Error promoting to Golden Set:', rpcError);
      return NextResponse.json({ 
        error: `Failed to add to Golden Set: ${rpcError.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Document added to Golden Set with truth snapshot' 
    });
  } catch (error) {
    console.error('Golden Set POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/golden-set
 * Remove a document from Golden Set
 * Only accessible to user "condor"
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can remove documents from Golden Set
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can manage Golden Set' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const document_id = searchParams.get('document_id');

    if (!document_id) {
      return NextResponse.json({ error: 'Missing document_id' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Verify document exists and user has access
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Remove from Golden Set
    const { error: updateError } = await supabase
      .from('documents')
      .update({ is_golden_set: false })
      .eq('id', document_id);

    if (updateError) {
      console.error('Error removing document from Golden Set:', updateError);
      return NextResponse.json({ error: 'Failed to remove from Golden Set' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Document removed from Golden Set' });
  } catch (error) {
    console.error('Golden Set DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

