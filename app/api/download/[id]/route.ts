import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/db/supabase';
import { translateConfidence, getFieldDisplayName } from '@/lib/utils/field-names';

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
    const format = request.nextUrl.searchParams.get('format') || 'txt';

    // Get extraction with fields (only non-deleted)
    const { data: extraction, error: extractionError } = await supabase
      .from('extractions')
      .select(`
        *,
        documents!inner(user_id, filename)
      `)
      .eq('id', params.id)
      .is('deleted_at', null) // Only get non-deleted extractions
      .single();

    if (extractionError || !extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    // Verify ownership
    if (extraction.documents.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get extracted fields
    const { data: fields } = await supabase
      .from('extracted_fields')
      .select('*')
      .eq('extraction_id', params.id)
      .order('field_order', { ascending: true });

    if (format === 'html') {
      const html = generateHTML(extraction, fields || []);
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="extraction_${params.id}.html"`,
        },
      });
    }

    // Default: TXT format
    const text = generateTXT(extraction, fields || []);
    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="extraction_${params.id}.txt"`,
      },
    });
  } catch (error) {
    console.error('Error downloading extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateTXT(extraction: any, fields: any[]): string {
  let text = 'EXTRACCIÓN DE DATOS - PATENTE DE COMERCIO\n';
  text += '='.repeat(50) + '\n\n';
  
  fields.forEach(field => {
    text += `${field.field_name}\n${field.field_value}\n`;
    if (field.field_value_words) {
      text += `  (${field.field_value_words})\n`;
    }
    if (field.needs_review) {
      text += '  ⚠ REQUIERE REVISIÓN\n';
    }
    text += '\n';
  });

  text += `\nConfianza: ${translateConfidence(extraction.confidence)}\n`;
  if (extraction.discrepancies && extraction.discrepancies.length > 0) {
    const displayNames = extraction.discrepancies.map((key: string) => getFieldDisplayName(key));
    text += `Discrepancias: ${displayNames.join(', ')}\n`;
  }

  return text;
}

function generateHTML(extraction: any, fields: any[]): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Extracción - ${extraction.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .field { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
    .field-name { font-weight: bold; color: #555; margin-bottom: 5px; }
    .field-value { font-size: 16px; margin: 5px 0; }
    .field-words { color: #666; font-style: italic; margin-left: 20px; }
    .review-flag { color: #d97706; font-weight: bold; }
    .copy-btn { margin-left: 10px; padding: 5px 10px; cursor: pointer; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 3px; }
    .copy-btn:hover { background: #e5e7eb; }
  </style>
</head>
<body>
  <h1>Extracción de Datos - Patente de Comercio</h1>
  <p><strong>Confianza:</strong> ${extraction.confidence}</p>
`;

  fields.forEach(field => {
    html += `  <div class="field">
    <div class="field-name">${field.field_name}${field.needs_review ? ' <span class="review-flag">⚠ REQUIERE REVISIÓN</span>' : ''}</div>
    <div class="field-value">
      ${field.field_value}
      <button class="copy-btn" onclick="navigator.clipboard.writeText('${field.field_value.replace(/'/g, "\\'")}')">📋 Copiar</button>
    </div>`;
    if (field.field_value_words) {
      html += `    <div class="field-words">${field.field_value_words}
      <button class="copy-btn" onclick="navigator.clipboard.writeText('${field.field_value_words.replace(/'/g, "\\'")}')">📋 Copiar</button>
    </div>`;
    }
    html += `  </div>\n`;
  });

  html += `</body>
</html>`;

  return html;
}

