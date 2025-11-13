'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export type ErrorToast = {
  id: string;
  message: string;
  severity: ErrorSeverity;
  duration?: number; // Auto-dismiss after this many ms (0 = no auto-dismiss)
};

export default function ErrorToastComponent({ 
  error, 
  onDismiss 
}: { 
  error: ErrorToast | null; 
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (error && error.duration !== undefined && error.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss();
      }, error.duration);
      return () => clearTimeout(timer);
    }
  }, [error, onDismiss]);

  if (!error || !mounted) return null;

  const bgColor = {
    error: 'bg-error/90 border border-error/50',
    warning: 'bg-warning/90 border border-warning/50',
    info: 'bg-info/90 border border-info/50'
  }[error.severity];

  const textColor = {
    error: 'text-white',
    warning: 'text-dark-surface',
    info: 'text-white'
  }[error.severity];

  const toastContent = (
    <div className="fixed top-4 right-4 z-[9999] animate-bounce-in">
      <div className={`${bgColor} ${textColor} rounded-lg shadow-2xl px-4 py-3 min-w-[300px] max-w-[500px] flex items-start gap-3 backdrop-blur-sm ${error.severity === 'error' ? 'animate-shake' : ''}`}>
        <div className="flex-1">
          <div className="font-bold">{error.message}</div>
        </div>
        <button
          onClick={onDismiss}
          className={`${textColor} hover:opacity-70 text-xl leading-none transition-opacity hover:scale-110`}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );

  return createPortal(toastContent, document.body);
}

