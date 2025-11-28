import { Scale } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className = '', size = 32, showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <Scale 
          size={size} 
          className="text-amber-400" 
          strokeWidth={2.5}
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

