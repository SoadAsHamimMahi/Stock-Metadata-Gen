'use client';

type ProgressIndicatorProps = {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  label?: string;
  className?: string;
};

export default function ProgressIndicator({ 
  progress, 
  size = 'md',
  showPercentage = true,
  label,
  className = ''
}: ProgressIndicatorProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24'
  };

  const strokeWidth = {
    sm: 3,
    md: 4,
    lg: 6
  };

  const radius = {
    sm: 18,
    md: 24,
    lg: 36
  };

  const circumference = 2 * Math.PI * radius[size];
  const offset = circumference - (progress / 100) * circumference;

  const sizeValues = {
    sm: 48,
    md: 64,
    lg: 96
  };

  const svgSize = sizeValues[size];

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {label && <div className="text-xs font-semibold text-text-secondary">{label}</div>}
      <div className={`relative ${sizeClasses[size]}`}>
        <svg className="transform -rotate-90 w-full h-full" width={svgSize} height={svgSize}>
          {/* Background circle */}
          <circle
            cx={radius[size] + strokeWidth[size]}
            cy={radius[size] + strokeWidth[size]}
            r={radius[size]}
            stroke="rgba(16, 185, 129, 0.1)"
            strokeWidth={strokeWidth[size]}
            fill="none"
          />
          {/* Progress circle */}
          <circle
            cx={radius[size] + strokeWidth[size]}
            cy={radius[size] + strokeWidth[size]}
            r={radius[size]}
            stroke="url(#gradient)"
            strokeWidth={strokeWidth[size]}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
        </svg>
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-bold text-green-bright ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg'}`}>
              {Math.round(progress)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

