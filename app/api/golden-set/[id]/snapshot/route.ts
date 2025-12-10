import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

/**
 * GET /api/golden-set/[id]/snapshot
 * Get the truth snapshot for a Golden Set document
 * Only accessible to user "condor"
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can view snapshots
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can view snapshots' }, { status: 403 });
    }

    const documentId = params.id;
    const supabase = createServerClient();

    // Get truth snapshot
    const { data: truth, error } = await supabase
      .from('golden_set_truths')
      .select('*')
      .eq('document_id', documentId)
      .single();

    if (error || !truth) {
      return NextResponse.json({ error: 'Truth snapshot not found' }, { status: 404 });
    }

    // Verify document ownership
    const { data: document } = await supabase
      .from('documents')
      .select('user_id')
      .eq('id', documentId)
      .single();

    if (!document || document.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ truth });
  } catch (error) {
    console.error('Snapshot GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

