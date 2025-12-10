import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

/**
 * GET /api/prompts/leaderboard
 * Get prompt version leaderboard with performance metrics
 * Only accessible to user "condor"
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can view leaderboard
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can view leaderboard' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const docType = searchParams.get('doc_type') || null;
    const model = searchParams.get('model') || null;

    const supabase = createServerClient();

    // Build query
    let query = supabase
      .from('prompt_versions')
      .select('*')
      .order('version_number', { ascending: false });

    if (docType) {
      query = query.eq('doc_type', docType);
    }
    if (model) {
      query = query.eq('model', model);
    }

    const { data: versions, error } = await query;

    if (error) {
      console.error('Error fetching prompt versions:', error);
      return NextResponse.json({ error: 'Failed to fetch versions' }, { status: 500 });
    }

    // Group by doc_type, model, and prompt_type
    const grouped: Record<string, {
      doc_type: string;
      model: string;
      prompt_type: string;
      versions: any[];
    }> = {};

    (versions || []).forEach((version: any) => {
      const key = `${version.doc_type}_${version.model}_${version.prompt_type}`;
      if (!grouped[key]) {
        grouped[key] = {
          doc_type: version.doc_type,
          model: version.model,
          prompt_type: version.prompt_type,
          versions: [],
        };
      }
      grouped[key].versions.push(version);
    });

    // For each group, find active version and candidates
    const leaderboards = Object.values(grouped).map((group) => {
      const active = group.versions.find((v: any) => v.is_active && v.status === 'active');
      const candidates = group.versions.filter((v: any) => 
        !v.is_active && (v.status === 'pending' || v.status === 'rejected')
      );
      const deprecated = group.versions.filter((v: any) => 
        v.status === 'deprecated' || (!v.is_active && v.status !== 'pending' && v.status !== 'rejected')
      );

      return {
        ...group,
        active,
        candidates: candidates.sort((a: any, b: any) => b.version_number - a.version_number),
        deprecated: deprecated.sort((a: any, b: any) => b.version_number - a.version_number),
      };
    });

    return NextResponse.json({ leaderboards });
  } catch (error) {
    console.error('Leaderboard GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

