import Image from 'next/image';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className = '', size = 32, showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <Image
          src="/logo.png"
          alt="Legislazuli Logo"
          width={size}
          height={size}
          className="object-contain"
        />
      </div>
      {showText && (
        <span className="text-xl font-bold text-white tracking-tight">
          LEGISLAZULI
        </span>
      )}
    </div>
  );
}

