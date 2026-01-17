import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const alt = 'Legislazuli';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  // Load the logo image from public directory
  const logoPath = join(process.cwd(), 'public', 'logo.png');
  const logoBuffer = readFileSync(logoPath);
  const logoBase64 = logoBuffer.toString('base64');
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #03236f 0%, #021a4a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '40px',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoDataUrl}
            alt="Legislazuli Logo"
            width={120}
            height={120}
            style={{
              objectFit: 'contain',
            }}
          />
          <h1
            style={{
              fontSize: '96px',
              fontWeight: 'bold',
              color: '#ffffff',
              margin: 0,
            }}
          >
            LEGISLAZULI
          </h1>
        </div>
        <p
          style={{
            fontSize: '32px',
            color: '#fbbf24',
            margin: 0,
            textAlign: 'center',
            maxWidth: '900px',
          }}
        >
          Extracción de Datos Legales con 100% de Precisión
        </p>
      </div>
    ),
    {
      ...size,
    }
  );
}

