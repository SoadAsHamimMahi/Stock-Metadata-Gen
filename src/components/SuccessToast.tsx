'use client';

import { useEffect } from 'react';

export type SuccessToast = {
  id: string;
  message: string;
  duration?: number;
};

export default function SuccessToastComponent({ 
  toast, 
  onDismiss 
}: { 
  toast: SuccessToast | null; 
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast && toast.duration !== undefined && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss();
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] animate-bounce-in">
      <div className="bg-success/90 border border-success/50 text-white rounded-lg shadow-2xl px-4 py-3 min-w-[300px] max-w-[500px] flex items-start gap-3 backdrop-blur-sm">
        <div className="flex-1 flex items-center gap-2">
          <svg 
            className="w-5 h-5 text-white flex-shrink-0" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={3} 
              d="M5 13l4 4L19 7" 
              className="checkmark-animated"
            />
          </svg>
          <div className="font-bold">{toast.message}</div>
        </div>
        <button
          onClick={onDismiss}
          className="text-white hover:opacity-70 text-xl leading-none transition-opacity hover:scale-110"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

