'use client';

import { useEffect, useState } from 'react';

export type CompletionStats = {
  totalFiles: number;
  successCount: number;
  errorCount: number;
  timeTaken: number; // in milliseconds
  platform: string;
  model: string;
  avgQualityScore?: number;
};

type CompletionModalProps = {
  open: boolean;
  onClose: () => void;
  stats: CompletionStats | null;
  onExportCSV?: () => void;
  onExportZIP?: () => void;
};

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

export default function CompletionModal({ 
  open, 
  onClose, 
  stats,
  onExportCSV,
  onExportZIP
}: CompletionModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !stats) return null;

  const successRate = stats.totalFiles > 0 
    ? Math.round((stats.successCount / stats.totalFiles) * 100) 
    : 0;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 animate-fade-in" 
      onClick={onClose}
    >
      <div 
        className="bg-dark-elevated rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-white shadow-green-glow-lg animate-scale-in border border-green-accent/20" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-3xl animate-pulse-glow">
              ✓
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-white">Generation Complete!</h2>
              <p className="text-sm text-white/70 mt-1">All files have been processed successfully</p>
            </div>
          </div>
          <button 
            className="text-white/70 hover:text-white text-2xl leading-none transition-colors"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Files Completed */}
          <div className="p-4 bg-dark-surface/30 rounded-lg border border-green-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📁</span>
              <div>
                <div className="text-xs text-white/60 font-medium">Files Completed</div>
                <div className="text-2xl font-extrabold text-green-bright">
                  {stats.successCount} / {stats.totalFiles}
                </div>
              </div>
            </div>
          </div>

          {/* Time Taken */}
          <div className="p-4 bg-dark-surface/30 rounded-lg border border-green-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⏱️</span>
              <div>
                <div className="text-xs text-white/60 font-medium">Time Taken</div>
                <div className="text-2xl font-extrabold text-green-bright">
                  {formatTime(stats.timeTaken)}
                </div>
              </div>
            </div>
          </div>

          {/* Success Rate */}
          <div className="p-4 bg-dark-surface/30 rounded-lg border border-green-accent/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">📊</span>
              <div>
                <div className="text-xs text-white/60 font-medium">Success Rate</div>
                <div className="text-2xl font-extrabold text-green-bright">
                  {successRate}%
                </div>
              </div>
            </div>
          </div>

          {/* Errors (if any) */}
          {stats.errorCount > 0 ? (
            <div className="p-4 bg-dark-surface/30 rounded-lg border border-yellow-500/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">⚠️</span>
                <div>
                  <div className="text-xs text-white/60 font-medium">Errors</div>
                  <div className="text-2xl font-extrabold text-yellow-400">
                    {stats.errorCount}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-dark-surface/30 rounded-lg border border-green-accent/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">✨</span>
                <div>
                  <div className="text-xs text-white/60 font-medium">Status</div>
                  <div className="text-2xl font-extrabold text-green-bright">
                    Perfect!
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Additional Info */}
        <div className="mb-6 p-4 bg-dark-surface/20 rounded-lg border border-green-accent/10">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-white/60">Platform:</span>
              <span className="ml-2 font-semibold text-white">{stats.platform}</span>
            </div>
            <div>
              <span className="text-white/60">Model:</span>
              <span className="ml-2 font-semibold text-white">{stats.model}</span>
            </div>
            {stats.avgQualityScore !== undefined && (
              <div className="col-span-2">
                <span className="text-white/60">Average Quality Score:</span>
                <span className="ml-2 font-semibold text-white">
                  {stats.avgQualityScore.toFixed(1)} / 100
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-dark-surface/50 hover:bg-dark-surface/70 text-white rounded-lg border border-green-accent/20 font-semibold transition-colors"
          >
            Close
          </button>
          {onExportZIP && stats.successCount > 0 && (
            <button
              onClick={() => {
                onExportZIP();
                onClose();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-green-accent to-teal-accent hover:from-green-bright hover:to-teal-bright text-white rounded-lg font-bold transition-all duration-300 flex items-center gap-2"
            >
              <span>📦</span>
              Export ZIP (Multi-CSV)
            </button>
          )}
          {onExportCSV && stats.successCount > 0 && (
            <button
              onClick={() => {
                onExportCSV();
                onClose();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-green-accent to-teal-accent hover:from-green-bright hover:to-teal-bright text-white rounded-lg font-bold transition-all duration-300 flex items-center gap-2"
            >
              <span>📥</span>
              Export CSV
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
