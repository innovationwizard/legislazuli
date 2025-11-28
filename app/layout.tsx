import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
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
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Legislazuli',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Legislazuli - Extracción de Datos Legales',
    description: 'Sistema de extracción de datos para documentos legales guatemaltecos con 100% de precisión',
    images: ['/opengraph-image'],
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

