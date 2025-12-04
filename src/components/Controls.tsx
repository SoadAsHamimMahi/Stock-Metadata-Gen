'use client';

import { useMemo, useState } from 'react';
import { clamp, sanitizeWords } from '@/lib/util';
import type { FormState } from '@/lib/types';

export default function Controls({ value, onChange }: { value: FormState; onChange: (v: FormState) => void }) {
  const [tab, setTab] = useState<'metadata'|'prompt'>('metadata');
  const [collapsed, setCollapsed] = useState(false);
  const [showPrefix, setShowPrefix] = useState(false);
  const [showSuffix, setShowSuffix] = useState(false);
  const [showNegativeTitle, setShowNegativeTitle] = useState(false);
  const [showNegativeKeywords, setShowNegativeKeywords] = useState(false);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => {
    onChange({ ...value, [key]: v });
  };
  const setNested = <K extends keyof FormState, T extends keyof FormState[K]>(key: K, sub: T, v: any) => {
    onChange({ ...value, [key]: { ...(value[key] as any), [sub]: v } });
  };

  const promptPreview = useMemo(() => {
    const negT = value.negativeTitle.join(', ');
    const negK = value.negativeKeywords.join(', ');
    const tips = value.assetType === 'video'
      ? `Video hints: style=[${value.videoHints?.style?.join(', ')||''}], tech=[${value.videoHints?.tech?.join(', ')||''}]`
      : '';
    return [
      `Platform:${value.platform}; Asset:${value.assetType};`,
      `title<=${value.titleLen}; desc<=${value.descLen}; keywords=${value.keywordCount};`,
      `Avoid title:[${negT}]; exclude keywords:[${negK}];`,
      tips
    ].join(' ');
  }, [value]);

  const platforms = [
    { id: 'general', label: 'General', icon: '✨' },
    { id: 'adobe', label: 'Adobe Stock', icon: '🎨' },
    { id: 'shutterstock', label: 'Shutterstock', icon: '📸' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Advanced Metadata Controls</h2>
        <button 
          className="text-sm text-text-tertiary hover:text-green-bright transition-colors font-semibold"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flex gap-2">
            <button className={`tab ${tab==='metadata' ? 'tab-active' : 'tab-inactive'}`} onClick={()=>setTab('metadata')}>Metadata</button>
            <button className={`tab ${tab==='prompt' ? 'tab-active' : 'tab-inactive'}`} onClick={()=>setTab('prompt')}>Prompt</button>
          </div>

          {tab === 'metadata' ? (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="label mb-3 text-text-secondary">EXPORT PLATFORM</div>
                <div className="grid grid-cols-3 gap-2">
                  {platforms.map(p => {
                    const isSelected = (p.id === 'general' && value.platform === 'general') ||
                                      (p.id === 'adobe' && value.platform === 'adobe') ||
                                      (p.id === 'shutterstock' && value.platform === 'shutterstock');
                    return (
                      <button
                        key={p.id}
                        className={`p-3 rounded-lg border-2 text-sm font-bold transition-all duration-300 ${
                          isSelected 
                            ? 'border-green-accent bg-green-accent/20 text-green-bright shadow-green-glow' 
                            : 'border-green-accent/20 hover:border-green-accent/40 bg-dark-elevated/30 text-text-secondary hover:text-text-primary hover:shadow-green-glow'
                        }`}
                        onClick={() => {
                          if (p.id === 'general') set('platform', 'general');
                          else if (p.id === 'adobe') set('platform', 'adobe');
                          else if (p.id === 'shutterstock') set('platform', 'shutterstock');
                        }}
                      >
                        <div className="text-lg mb-1">{p.icon}</div>
                        <div>{p.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="label">Model Provider</div>
                <div className="flex gap-2">
                  <button className={`tab ${value.model.provider==='gemini'?'tab-active':'tab-inactive'}`} onClick={()=>setNested('model','provider','gemini')}>Gemini</button>
                  <button className={`tab ${value.model.provider==='mistral'?'tab-active':'tab-inactive'}`} onClick={()=>setNested('model','provider','mistral')}>Mistral</button>
                </div>
                <label 
                  className="inline-flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input 
                    type="checkbox" 
                    checked={!!value.parallelMode} 
                    onChange={(e) => set('parallelMode', e.target.checked)}
                  />
                  Parallel Generation Mode (faster, may hit API limits)
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label text-text-secondary">
                    Title Length: <span className="text-green-bright font-bold">{value.titleLen}</span> Characters
                  </label>
                  <input 
                    type="range" 
                    min={20} 
                    max={200} 
                    value={value.titleLen} 
                    className="w-full accent-green-accent"
                    onChange={(e)=>set('titleLen', clamp(parseInt(e.target.value||'0',10),20,200))} 
                  />
                </div>
                <div>
                  <label className="label text-text-secondary">Description Character Length: <span className="text-green-bright font-bold">150</span> Characters (Fixed)</label>
                  <input type="range" min={150} max={150} value={150} disabled className="w-full opacity-50 accent-green-accent" />
                </div>
                <div>
                  <label className="label text-text-secondary">Keywords Count: <span className="text-green-bright font-bold">{value.keywordCount}</span> Keywords</label>
                  <input type="range" min={5} max={49} value={value.keywordCount} className="w-full accent-green-accent"
                         onChange={(e)=>set('keywordCount', clamp(parseInt(e.target.value||'0',10),5,49))} />
                </div>
              </div>

              <div>
                <label className="label">Asset Type</label>
                <select className="select" value={value.assetType} onChange={(e)=>set('assetType', e.target.value as any)}>
                  <option value="auto">auto</option>
                  <option value="photo">photo</option>
                  <option value="illustration">illustration</option>
                  <option value="vector">vector</option>
                  <option value="3d">3d</option>
                  <option value="icon">icon</option>
                  <option value="video">video</option>
                </select>
                <p className="text-xs text-ink/60 mt-1">
                  If you upload preview file then choose image type vector then it will generate CSV in (EPS, SVG, AI).
                </p>
              </div>

              {value.assetType === 'video' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Style tags (comma-separated)</label>
                    <input className="input" placeholder="e.g., cinematic, slow motion"
                           value={(value.videoHints?.style||[]).join(', ')}
                           onChange={(e)=>set('videoHints', { ...(value.videoHints||{}), style: sanitizeWords(e.target.value.split(',')) })} />
                  </div>
                  <div>
                    <label className="label">Tech tags (comma-separated)</label>
                    <input className="input" placeholder="e.g., 4k, 60fps"
                           value={(value.videoHints?.tech||[]).join(', ')}
                           onChange={(e)=>set('videoHints', { ...(value.videoHints||{}), tech: sanitizeWords(e.target.value.split(',')) })} />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showPrefix} 
                    onChange={(e) => setShowPrefix(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Prefix</span>
                </label>
                {showPrefix && (
                  <input className="input" value={value.prefix||''} onChange={(e)=>set('prefix', e.target.value)} placeholder="Prefix for title" />
                )}

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showSuffix} 
                    onChange={(e) => setShowSuffix(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Suffix</span>
                </label>
                {showSuffix && (
                  <input className="input" value={value.suffix||''} onChange={(e)=>set('suffix', e.target.value)} placeholder="Suffix for title" />
                )}

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showNegativeTitle} 
                    onChange={(e) => setShowNegativeTitle(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Negative Words for Title</span>
                </label>
                {showNegativeTitle && (
                  <input className="input" value={(value.negativeTitle||[]).join(', ')} onChange={(e)=>set('negativeTitle', sanitizeWords(e.target.value.split(',')))} placeholder="Comma-separated negative words" />
                )}

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showNegativeKeywords} 
                    onChange={(e) => setShowNegativeKeywords(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">Negative Keywords</span>
                </label>
                {showNegativeKeywords && (
                  <input className="input" value={(value.negativeKeywords||[]).join(', ')} onChange={(e)=>set('negativeKeywords', sanitizeWords(e.target.value.split(',')))} placeholder="Comma-separated negative keywords" />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="label">Prompt Preview</div>
              <div className="p-3 rounded border border-deep/20 text-sm bg-warm/10">{promptPreview}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


