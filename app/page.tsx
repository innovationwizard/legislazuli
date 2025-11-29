import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-lapis flex flex-col items-center justify-center p-8">
      <Logo size={64} />
      <h1 className="text-4xl font-bold text-white mt-6 mb-4">Legislazuli</h1>
      <p className="text-xl text-white/80 mb-8 text-center max-w-md">
        Extracción de datos legales con 100% de precisión
      </p>
      <Link
        href="/login"
        className="px-8 py-3 bg-gold text-lapis font-semibold rounded-lg hover:bg-gold/90 transition-colors"
      >
        Ingresar
      </Link>
    </div>
  );
}

