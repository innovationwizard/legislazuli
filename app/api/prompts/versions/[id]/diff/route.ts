import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { diffLines } from 'diff';

/**
 * GET /api/prompts/versions/[id]/diff?compare_with=[other_id]
 * Get visual diff between two prompt versions
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

    // Only user "condor" can view diffs
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can view diffs' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const compareWithId = searchParams.get('compare_with');

    if (!compareWithId) {
      return NextResponse.json({ error: 'Missing compare_with parameter' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Get both versions
    const { data: version1, error: error1 } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('id', params.id)
      .single();

    const { data: version2, error: error2 } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('id', compareWithId)
      .single();

    if (error1 || !version1 || error2 || !version2) {
      return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 });
    }

    // Ensure they're the same type (can't diff system vs user)
    if (version1.prompt_type !== version2.prompt_type || 
        version1.doc_type !== version2.doc_type ||
        version1.model !== version2.model) {
      return NextResponse.json({ 
        error: 'Cannot compare: versions must be same type, doc_type, and model' 
      }, { status: 400 });
    }

    // Generate diff
    const diff = diffLines(version2.prompt_content, version1.prompt_content);

    // Format diff for display
    const formattedDiff = diff.map((part, index) => {
      const lines = part.value.split('\n').filter((line, i) => 
        i < part.value.split('\n').length - 1 || part.value.endsWith('\n')
      );
      
      return {
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
        lines: lines.map((line, lineIndex) => ({
          number: part.added ? version1.version_number : version2.version_number,
          content: line,
          lineIndex: index * 1000 + lineIndex, // Unique line index for React keys
        })),
      };
    });

    return NextResponse.json({
      version1: {
        id: version1.id,
        version_number: version1.version_number,
        prompt_content: version1.prompt_content,
        created_at: version1.created_at,
      },
      version2: {
        id: version2.id,
        version_number: version2.version_number,
        prompt_content: version2.prompt_content,
        created_at: version2.created_at,
      },
      diff: formattedDiff,
    });
  } catch (error) {
    console.error('Diff GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

