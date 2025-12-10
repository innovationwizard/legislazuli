import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { triggerPromptEvolution } from '@/lib/ml/prompt-evolution';

/**
 * POST /api/evolution/trigger
 * Manually trigger prompt evolution (for user "condor" only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only user "condor" can trigger evolution
    if (session.user.email !== 'condor') {
      return NextResponse.json({ error: 'Forbidden: Only condor user can trigger evolution' }, { status: 403 });
    }

    const body = await request.json();
    const { doc_type, model } = body;

    if (!doc_type || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: doc_type, model' },
        { status: 400 }
      );
    }

    if (doc_type === 'otros') {
      return NextResponse.json(
        { error: 'Evolution is only supported for patente_empresa and patente_sociedad' },
        { status: 400 }
      );
    }

    if (model !== 'claude' && model !== 'gemini') {
      return NextResponse.json(
        { error: 'Model must be either "claude" or "gemini"' },
        { status: 400 }
      );
    }

    const result = await triggerPromptEvolution(
      doc_type,
      model,
      session.user.id
    );

    return NextResponse.json({
      success: true,
      message: 'Prompt evolution triggered',
      system_version_id: result.systemVersionId,
      user_version_id: result.userVersionId,
    });
  } catch (error) {
    console.error('Evolution trigger error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

