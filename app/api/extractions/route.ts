import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServerClient();

    const { data: extractions, error } = await supabase
      .from('extractions')
      .select(`
        id,
        confidence,
        created_at,
        documents (
          id,
          filename,
          doc_type
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch extractions' }, { status: 500 });
    }

    return NextResponse.json(extractions || []);
  } catch (error) {
    console.error('Error fetching extractions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

