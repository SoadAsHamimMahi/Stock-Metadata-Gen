'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Leaderboard from './Leaderboard';

interface LeaderboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LeaderboardModal({ open, onOpenChange }: LeaderboardModalProps) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-dark-elevated rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-green-glow-lg animate-scale-in border border-green-accent/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-green-accent/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-extrabold text-text-primary tracking-tight mb-1">
                🏆 Leaderboard
              </h2>
              <p className="text-sm text-text-secondary">
                Top image generators {activeTab === 'weekly' ? 'this week' : 'this month'}
              </p>
            </div>
            <button 
              className="text-text-tertiary hover:text-text-primary text-2xl leading-none transition-colors"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('weekly')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'weekly'
                  ? 'bg-green-gradient text-white shadow-green-glow'
                  : 'bg-dark-surface/50 text-text-secondary hover:bg-dark-surface/70 hover:text-text-primary'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                activeTab === 'monthly'
                  ? 'bg-green-gradient text-white shadow-green-glow'
                  : 'bg-dark-surface/50 text-text-secondary hover:bg-dark-surface/70 hover:text-text-primary'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          <Leaderboard period={activeTab} />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

