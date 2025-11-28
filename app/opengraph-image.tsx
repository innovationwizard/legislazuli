import { ImageResponse } from 'next/og';

export const alt = 'Legislazuli';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #0f4c81 100%)',
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
          <svg
            width="120"
            height="120"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="32" height="32" rx="6" fill="#fbbf24"/>
            <path
              d="M8 16L12 12L16 16L20 12L24 16M8 20L12 16L16 20L20 16L24 20"
              stroke="#1e3a8a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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

