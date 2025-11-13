'use client';

import { useEffect, useState } from 'react';

interface RetryIndicatorProps {
  attempt: number;
  maxAttempts: number;
  delay?: number;
  errorType?: 'overloaded' | 'rate-limit' | 'server-error';
  className?: string;
}

export default function RetryIndicator({
  attempt,
  maxAttempts,
  delay,
  errorType = 'server-error',
  className = ''
}: RetryIndicatorProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '') return '.';
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const getErrorTypeLabel = () => {
    switch (errorType) {
      case 'overloaded':
        return 'Server overloaded';
      case 'rate-limit':
        return 'Rate limit';
      case 'server-error':
        return 'Server error';
      default:
        return 'Error';
    }
  };

  const getDelayText = () => {
    if (delay) {
      const seconds = Math.round(delay / 1000);
      return `Retrying in ${seconds}s${dots}`;
    }
    return `Retrying${dots}`;
  };

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      <div className="flex items-center gap-2">
        {/* Retry icon with pulsing animation */}
        <div className="relative">
          <svg
            className="w-4 h-4 text-yellow-400 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {/* Pulsing ring effect */}
          <div className="absolute inset-0 rounded-full border-2 border-yellow-400/50 animate-ping"></div>
        </div>
        <span className="text-yellow-400 font-medium animate-pulse">
          {getErrorTypeLabel()}
        </span>
      </div>
      <span className="text-text-tertiary text-xs">
        (Attempt {attempt}/{maxAttempts})
      </span>
      {delay && (
        <span className="text-text-tertiary text-xs">
          {getDelayText()}
        </span>
      )}
    </div>
  );
}

