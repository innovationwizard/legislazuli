/**
 * Get extraction job status
 * Used for polling by frontend
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = params.id;
    const supabase = createServerClient();

    // Get extraction job with related data
    const { data: extractionJob, error: jobError } = await supabase
      .from('extraction_jobs')
      .select(`
        *,
        document:documents(*),
        textract_job:textract_jobs(*),
        extraction:extractions(id)
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !extractionJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify ownership
    if (extractionJob.document?.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get extracted fields if extraction is complete
    let fields = null;
    if (extractionJob.extraction?.id) {
      const { data: extractedFields } = await supabase
        .from('extracted_fields')
        .select('*')
        .eq('extraction_id', extractionJob.extraction.id)
        .order('field_order');

      fields = extractedFields;
    }

    return NextResponse.json({
      id: extractionJob.id,
      status: extractionJob.status,
      statusMessage: extractionJob.status_message,
      textractStatus: extractionJob.textract_job?.status,
      extractionId: extractionJob.extraction?.id,
      fields,
      createdAt: extractionJob.created_at,
      updatedAt: extractionJob.updated_at,
      completedAt: extractionJob.completed_at,
      error: extractionJob.error_details,
    });
  } catch (error) {
    console.error('Job status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

