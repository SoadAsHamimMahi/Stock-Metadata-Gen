'use client';

import { useState, useEffect } from 'react';
import KeyModal from '@/components/KeyModal';
import { getDecryptedJSON } from '@/lib/util';
import type { FormState } from '@/lib/types';
import { useGuardedAction } from '@/hooks/useGuardedAction';
import LoginModal from '@/components/LoginModal';

export default function APIControls({ value, onChange }: { value: FormState; onChange: (v: FormState | ((prev: FormState) => FormState)) => void }) {
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<'gemini'|'mistral'>(value.model.provider);
  const [canUseParallel, setCanUseParallel] = useState(false);
  const { executeGuarded, loginModalOpen, setLoginModalOpen, reason, handleLoginSuccess } = useGuardedAction();

  useEffect(() => {
    setActiveProvider(value.model.provider);
  }, [value.model.provider]);

  // On first load, determine if Parallel Mode can be used based on stored keys
  useEffect(() => {
    (async () => {
      try {
        const enc = await getDecryptedJSON<any>('smg_keys_enc', null as any);
        if (!enc) {
          setCanUseParallel(false);
          return;
        }

        const countUsable = (keys: any[] = []) =>
          keys.filter(
            (k) => k && k.key && k.key.trim().length > 0 && k.enabledForParallel !== false
          ).length;

        const geminiCount = countUsable(enc.geminiKeys);
        const mistralCount = countUsable(enc.mistralKeys);

        // Enable Parallel Mode if ANY provider already has 2+ usable keys
        setCanUseParallel(geminiCount >= 2 || mistralCount >= 2);
      } catch (err) {
        console.error('Failed to initialize Parallel Mode availability:', err);
        setCanUseParallel(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Load active provider from stored keys
    (async () => {
      const enc = await getDecryptedJSON<{ active?: 'gemini'|'mistral' } | null>('smg_keys_enc', null);
      if (enc?.active) {
        setActiveProvider(enc.active);
      }
    })();
  }, [keyModalOpen]);

  // If parallel mode becomes unavailable, force it off in the form
  useEffect(() => {
    if (!canUseParallel && value.parallelMode) {
      set('parallelMode', false);
    }
  }, [canUseParallel, value.parallelMode]);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => {
    if (key === 'singleMode' && v === true) {
      onChange({ ...value, [key]: v, parallelMode: false });
    } else if (key === 'parallelMode' && v === true) {
      onChange({ ...value, [key]: v, singleMode: false });
    } else {
      onChange({ ...value, [key]: v });
    }
  };
  const setNested = <K extends keyof FormState, T extends keyof FormState[K]>(key: K, sub: T, v: any) => {
    onChange({ ...value, [key]: { ...(value[key] as any), [sub]: v } });
  };

  const handleProviderChange = (provider: 'gemini' | 'mistral') => {
    setActiveProvider(provider);
    setNested('model', 'provider', provider);
    // Reset until KeyModal reports fresh counts
    setCanUseParallel(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <h2 className="text-xl font-extrabold text-text-primary tracking-tight">Generation Controls</h2>
        </div>
        <button
          onClick={() => executeGuarded(() => setKeyModalOpen(true), 'Please sign in to manage your API secrets.')}
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
          <label 
            className="inline-flex items-start gap-3 group p-3 bg-dark-surface/20 rounded-lg border border-green-accent/10 hover:border-green-accent/30 transition-colors cursor-pointer"
          >
            <input 
              type="checkbox" 
              checked={!!value.parallelMode} 
              onChange={(e) => set('parallelMode', e.target.checked)}
              disabled={!canUseParallel}
              className="w-5 h-5 mt-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">⚡</span>
                <span className="text-base font-semibold text-text-primary">Parallel Generation Mode</span>
              </div>
              <div className="text-sm text-text-secondary mt-1.5 flex flex-col gap-1">
                <div className="flex items-start gap-1.5">
                  <span className="text-green-bright">💡</span>
                  <span>
                    Faster mode (runs several files at once). Recommended when you have multiple API keys.
                  </span>
                </div>
                {!canUseParallel && (
                  <button
                    type="button"
                    onClick={() =>
                      executeGuarded(
                        () => setKeyModalOpen(true),
                        'Please sign in to manage your API secrets.'
                      )
                    }
                    className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-400/40 px-2 py-1 text-xs text-amber-100 hover:bg-amber-500/20 transition-colors"
                  >
                    <span>⚠️</span>
                    <span>
                      Add at least <strong>2 API keys</strong> for {activeProvider === 'gemini' ? 'Gemini' : 'Mistral'} in <strong>API Secrets</strong> to enable Parallel Mode.
                    </span>
                  </button>
                )}
              </div>
            </div>
          </label>
        </div>
      </div>

      <KeyModal
        open={keyModalOpen}
        onOpenChange={setKeyModalOpen}
        onKeysChanged={(provider, usableCount) => {
          // Enable Parallel Mode whenever ANY provider has 2+ usable keys.
          // This keeps the UX simple and avoids mismatch between modal provider and form provider.
          setCanUseParallel(usableCount >= 2);
        }}
      />
      <LoginModal 
        open={loginModalOpen} 
        onOpenChange={setLoginModalOpen}
        reason={reason}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}

