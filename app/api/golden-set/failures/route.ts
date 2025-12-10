import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

/**
 * GET /api/golden-set/failures
 * Get Golden Set documents that failed in previous tests (for simulation)
 * Only accessible to user "condor"
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can access
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can access' }, { status: 403 });
    }

    const supabase = createServerClient();

    // Get Golden Set documents that had errors in previous tests
    // These are good candidates for simulation testing
    const { data: goldenSetDocs, error } = await supabase
      .from('documents')
      .select(`
        id,
        filename,
        doc_type,
        uploaded_at,
        extractions!inner(
          id,
          confidence,
          consensus_result
        )
      `)
      .eq('is_golden_set', true)
      .in('extractions.confidence', ['partial', 'review_required'])
      .order('uploaded_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching Golden Set failures:', error);
      return NextResponse.json({ error: 'Failed to fetch failures' }, { status: 500 });
    }

    return NextResponse.json({ documents: goldenSetDocs || [] });
  } catch (error) {
    console.error('Golden Set failures GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

