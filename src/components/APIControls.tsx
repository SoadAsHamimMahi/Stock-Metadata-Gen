'use client';

import { useState, useEffect } from 'react';
import KeyModal from '@/components/KeyModal';
import { getDecryptedJSON } from '@/lib/util';
import type { FormState } from '@/lib/types';

export default function APIControls({ value, onChange }: { value: FormState; onChange: (v: FormState) => void }) {
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'gemini'|'mistral'>(value.model.provider);

  useEffect(() => {
    setActiveProvider(value.model.provider);
  }, [value.model.provider]);

  useEffect(() => {
    // Load active provider from stored keys
    (async () => {
      const enc = await getDecryptedJSON<{ active?: 'gemini'|'mistral' }>('smg_keys_enc', null);
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
          <span className="text-lg">⚙️</span>
          <h2 className="text-lg font-bold text-text-primary">Generation Controls</h2>
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
        <div>
          <div className="label mb-2">Model Provider</div>
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

        <div className="space-y-3">
          <label className="inline-flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={!!value.model.preview} 
              onChange={(e) => setNested('model', 'preview', e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <span className="text-sm font-medium">Use Gemini Preview Model</span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">
                Enable for potentially higher success rate. Default is Gemini 2.0 Flash.
              </p>
            </div>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox" 
              checked={value.singleMode} 
              onChange={(e) => set('singleMode', e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">📦</span>
                <span className="text-sm font-medium">Single Generation Mode</span>
              </div>
              <p className="text-xs text-text-tertiary mt-1">
                Process one item at a time. Slower but helps avoid API overload.
              </p>
            </div>
          </label>
        </div>
      </div>

      <KeyModal open={keyModalOpen} onOpenChange={setKeyModalOpen} />
    </div>
  );
}

