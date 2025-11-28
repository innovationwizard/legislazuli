import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';

const inter = Inter({ subsets: ['latin'] });

const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: 'Legislazuli - Extracción de Datos Legales',
  description: 'Sistema de extracción de datos para documentos legales guatemaltecos con 100% de precisión mediante consenso multi-API',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.svg',
  },
  openGraph: {
    title: 'Legislazuli - Extracción de Datos Legales',
    description: 'Sistema de extracción de datos para documentos legales guatemaltecos con 100% de precisión',
    url: baseUrl,
    siteName: 'Legislazuli',
    images: [
      {
        url: `${baseUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Legislazuli - Extracción de Datos Legales',
        type: 'image/png',
      },
    ],
    type: 'website',
    locale: 'es_GT',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Legislazuli - Extracción de Datos Legales',
    description: 'Sistema de extracción de datos para documentos legales guatemaltecos con 100% de precisión',
    images: [`${baseUrl}/opengraph-image`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

