'use client';

type SkeletonLoaderProps = {
  variant?: 'card' | 'text' | 'image' | 'button' | 'progress';
  className?: string;
  width?: string;
  height?: string;
  lines?: number;
};

export default function SkeletonLoader({ 
  variant = 'card', 
  className = '',
  width,
  height,
  lines = 1
}: SkeletonLoaderProps) {
  const baseClasses = 'animate-shimmer bg-gradient-to-r from-dark-surface via-green-accent/10 to-dark-surface bg-[length:200%_100%] rounded';

  if (variant === 'card') {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
          {/* Image skeleton */}
          <div className="space-y-2">
            <div className={`aspect-square ${baseClasses} rounded-lg`} style={{ width: width || '100%', height: height || 'auto' }} />
            <div className={`h-4 ${baseClasses}`} style={{ width: '60%' }} />
            <div className={`h-3 ${baseClasses}`} style={{ width: '40%' }} />
          </div>
          {/* Content skeleton */}
          <div className="space-y-3">
            <div className={`h-4 ${baseClasses}`} style={{ width: '30%' }} />
            <div className={`h-20 ${baseClasses}`} />
            <div className={`h-4 ${baseClasses}`} style={{ width: '40%' }} />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`h-6 ${baseClasses}`} style={{ width: `${60 + Math.random() * 40}px` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i} 
            className={`h-4 ${baseClasses}`} 
            style={{ width: width || (i === lines - 1 ? '60%' : '100%') }} 
          />
        ))}
      </div>
    );
  }

  if (variant === 'image') {
    return (
      <div 
        className={`${baseClasses} rounded-lg`} 
        style={{ width: width || '100%', height: height || '200px' }} 
      />
    );
  }

  if (variant === 'button') {
    return (
      <div 
        className={`h-10 ${baseClasses} rounded-lg`} 
        style={{ width: width || '120px' }} 
      />
    );
  }

  if (variant === 'progress') {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className={`h-2 ${baseClasses} rounded-full`} style={{ width: width || '100%' }} />
        <div className={`h-3 ${baseClasses} rounded`} style={{ width: '40%' }} />
      </div>
    );
  }

  return (
    <div 
      className={`${baseClasses} ${className}`} 
      style={{ width: width || '100%', height: height || '20px' }} 
    />
  );
}

