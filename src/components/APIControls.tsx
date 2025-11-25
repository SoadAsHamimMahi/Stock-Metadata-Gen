'use client';

import { useState, useEffect } from 'react';
import KeyModal from '@/components/KeyModal';
import { getDecryptedJSON } from '@/lib/util';
import type { FormState } from '@/lib/types';

export default function APIControls({ value, onChange }: { value: FormState; onChange: (v: FormState | ((prev: FormState) => FormState)) => void }) {
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'gemini'|'mistral'>(value.model.provider);

  useEffect(() => {
    setActiveProvider(value.model.provider);
  }, [value.model.provider]);

  useEffect(() => {
    // Load active provider from stored keys
    (async () => {
      const enc = await getDecryptedJSON<{ active?: 'gemini'|'mistral' } | null>('smg_keys_enc', null);
      if (enc?.active) {
        setActiveProvider(enc.active);
      }
    })();
  }, [keyModalOpen]);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => {
    onChange({ ...value, [key]: v });
  };
  const setNested = <K extends keyof FormState, T extends keyof FormState[K]>(key: K, sub: T, v: any) => {
    onChange({ ...value, [key]: { ...(value[key] as any), [sub]: v } });
  };

  const handleProviderChange = (provider: 'gemini' | 'mistral') => {
    setActiveProvider(provider);
    setNested('model', 'provider', provider);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <h2 className="text-xl font-extrabold text-text-primary tracking-tight">Generation Controls</h2>
        </div>
        <button
          onClick={() => setKeyModalOpen(true)}
          className="px-3 py-1.5 text-sm bg-ink/5 hover:bg-ink/10 rounded border border-ink/20 flex items-center gap-2"
        >
          <span>🔑</span>
          API Secrets
          <span className="px-1.5 py-0.5 bg-green-accent/20 rounded text-xs text-green-bright border border-green-accent/30 font-semibold">
            {activeProvider === 'gemini' ? 'Gemini' : 'Mistral'}
          </span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="pb-4 border-b border-green-accent/20">
          <div className="label mb-2 text-text-primary">Model Provider</div>
          <div className="flex gap-2">
            <button 
              className={`tab ${value.model.provider==='gemini'?'tab-active':'tab-inactive'}`} 
              onClick={() => handleProviderChange('gemini')}
            >
              Gemini
            </button>
            <button 
              className={`tab ${value.model.provider==='mistral'?'tab-active':'tab-inactive'}`} 
              onClick={() => handleProviderChange('mistral')}
            >
              Mistral
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <label className="inline-flex items-start gap-3 cursor-pointer group p-3 bg-dark-surface/20 rounded-lg border border-green-accent/10 hover:border-green-accent/30 transition-colors">
            <input 
              type="checkbox" 
              checked={!!value.model.preview} 
              onChange={(e) => setNested('model', 'preview', e.target.checked)}
              className="w-5 h-5 mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">✨</span>
                <span className="text-base font-semibold text-text-primary">Use Gemini Preview Model</span>
              </div>
              <p className="text-sm text-text-secondary mt-1.5 flex items-start gap-1.5">
                <span className="text-green-bright">💡</span>
                <span>Use Gemini 1.5 Pro (slower, higher quality) instead of Gemini 2.0 Flash (faster, default). Enable for better results when quality is more important than speed.</span>
              </p>
            </div>
          </label>

          <label className="inline-flex items-start gap-3 cursor-pointer group p-3 bg-dark-surface/20 rounded-lg border border-green-accent/10 hover:border-green-accent/30 transition-colors">
            <input 
              type="checkbox" 
              checked={value.singleMode} 
              onChange={(e) => set('singleMode', e.target.checked)}
              className="w-5 h-5 mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">📦</span>
                <span className="text-base font-semibold text-text-primary">Single Generation Mode</span>
              </div>
              <p className="text-sm text-text-secondary mt-1.5 flex items-start gap-1.5">
                <span className="text-green-bright">💡</span>
                <span>Process files one at a time (slower but prevents API rate limits). Use when processing many files or getting rate limit errors.</span>
              </p>
            </div>
          </label>
        </div>
      </div>

      <KeyModal open={keyModalOpen} onOpenChange={setKeyModalOpen} />
    </div>
  );
}

