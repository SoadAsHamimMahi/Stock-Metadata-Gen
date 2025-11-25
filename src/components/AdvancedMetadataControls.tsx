'use client';

import { useMemo, useState } from 'react';
import { clamp, sanitizeWords } from '@/lib/util';
import type { FormState } from '@/lib/types';

export default function AdvancedMetadataControls({ value, onChange }: { value: FormState; onChange: (v: FormState | ((prev: FormState) => FormState)) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'metadata'|'prompt'>('metadata');
  const [showPrefix, setShowPrefix] = useState(false);
  const [showSuffix, setShowSuffix] = useState(false);
  const [showNegativeTitle, setShowNegativeTitle] = useState(false);
  const [showNegativeKeywords, setShowNegativeKeywords] = useState(false);
  const [fileAttributesCollapsed, setFileAttributesCollapsed] = useState(true);

  const set = <K extends keyof FormState>(key: K, v: FormState[K]) => {
    // Use functional update to ensure we work with latest state
    onChange((prev) => ({ ...prev, [key]: v }));
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
    { id: 'adobe', label: 'Adobe', icon: '✨' },
    { id: 'shutterstock', label: 'St', icon: '📸' },
    { id: 'vectorstock', label: 'VS', icon: '⬜' },
    { id: 'freepik', label: 'F', icon: '🎨' },
    { id: 'pond5', label: 'PONDS', icon: '🎬' },
    { id: 'other', label: 'Other', icon: '⚙️' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔍</span>
          <h2 className="text-xl font-extrabold text-text-primary tracking-tight">Advanced Metadata Controls</h2>
        </div>
        <button 
          className="text-sm text-text-tertiary hover:text-green-bright transition-colors px-3 py-1.5 bg-ink/5 hover:bg-ink/10 rounded border border-ink/20 font-semibold"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="flex gap-2">
            <button className={`tab ${tab==='metadata' ? 'tab-active' : 'tab-inactive'}`} onClick={()=>setTab('metadata')}>
              <span className="mr-1">🔒</span>
              Metadata
            </button>
            <button className={`tab ${tab==='prompt' ? 'tab-active' : 'tab-inactive'}`} onClick={()=>setTab('prompt')}>
              <span className="mr-1">T</span>
              Prompt
            </button>
          </div>

          {tab === 'metadata' ? (
            <div className="grid grid-cols-1 gap-6">
              <div className="pb-4 border-b border-green-accent/20">
                <div className="label mb-3 text-text-primary">EXPORT PLATFORM</div>
                <div className="grid grid-cols-3 gap-2">
                  {platforms.map(p => {
                    const isSelected = (p.id === 'adobe' && value.platform === 'adobe') ||
                                      (p.id === 'shutterstock' && value.platform === 'shutterstock') ||
                                      (p.id === 'freepik' && value.platform === 'freepik');
                    return (
                      <button
                        key={p.id}
                        className={`p-3 rounded-lg border-2 text-sm font-bold transition-all duration-300 relative ${
                          isSelected 
                            ? 'border-green-accent bg-green-accent/20 text-green-bright shadow-green-glow' 
                            : 'border-green-accent/20 hover:border-green-accent/40 bg-dark-elevated/30 text-text-secondary hover:text-text-primary hover:shadow-green-glow'
                        }`}
                        onClick={() => {
                          if (p.id === 'adobe') set('platform', 'adobe');
                          else if (p.id === 'shutterstock') set('platform', 'shutterstock');
                          else if (p.id === 'freepik') set('platform', 'freepik');
                        }}
                      >
                        {p.id === 'vectorstock' && isSelected && (
                          <span className="absolute top-1 right-1 text-xs">🔒</span>
                        )}
                        <div className="text-lg mb-1">{p.icon}</div>
                        <div>{p.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 bg-dark-surface/20 rounded-lg border border-green-accent/10 pb-4 border-b border-green-accent/20">
                <div className="label text-text-primary mb-4">METADATA LENGTH SETTINGS</div>
                <div className="space-y-4">
                  <div>
                    <label className="label text-text-primary">
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
                    <label className="label text-text-primary">
                      Description Character Length: <span className="text-green-bright font-bold">150</span> Characters (Fixed)
                    </label>
                    <input type="range" min={150} max={150} value={150} disabled className="w-full opacity-50 accent-green-accent" />
                  </div>
                  <div>
                    <label className="label text-text-primary">
                      Keywords Count: <span className="text-green-bright font-bold">{value.keywordCount}</span> Keywords
                    </label>
                    <input 
                      type="range" 
                      min={5} 
                      max={49} 
                      value={value.keywordCount} 
                      className="w-full accent-green-accent"
                      onChange={(e)=>set('keywordCount', clamp(parseInt(e.target.value||'0',10),5,49))} 
                    />
                  </div>
                </div>
              </div>

              <div className="pb-4 border-b border-green-accent/20">
                <label className="label text-text-primary">Image Type</label>
                <select className="select" value={value.assetType} onChange={(e)=>set('assetType', e.target.value as any)}>
                  <option value="auto">auto</option>
                  <option value="photo">photo</option>
                  <option value="illustration">illustration</option>
                  <option value="vector">vector</option>
                  <option value="3d">3d</option>
                  <option value="icon">icon</option>
                  <option value="video">video</option>
                </select>
                <p className="text-sm text-text-secondary mt-2 flex items-start gap-1.5">
                  <span className="text-green-bright">💡</span>
                  <span>If you upload preview file then choose image type vector then it will generate CSV in (EPS, SVG, AI).</span>
                </p>
              </div>

              {value.assetType === 'video' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Style tags (comma-separated)</label>
                    <input 
                      className="input" 
                      placeholder="e.g., cinematic, slow motion"
                      value={(value.videoHints?.style||[]).join(', ')}
                      onChange={(e)=>set('videoHints', { ...(value.videoHints||{}), style: sanitizeWords(e.target.value.split(',')) })} 
                    />
                  </div>
                  <div>
                    <label className="label">Tech tags (comma-separated)</label>
                    <input 
                      className="input" 
                      placeholder="e.g., 4k, 60fps"
                      value={(value.videoHints?.tech||[]).join(', ')}
                      onChange={(e)=>set('videoHints', { ...(value.videoHints||{}), tech: sanitizeWords(e.target.value.split(',')) })} 
                    />
                  </div>
                </div>
              )}

              <div className="p-4 bg-dark-surface/20 rounded-lg border border-green-accent/10 pb-4 border-b border-green-accent/20">
                <div className="label text-text-primary mb-4">TITLE & KEYWORD MODIFIERS</div>
                <div className="space-y-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={showPrefix} 
                      onChange={(e) => setShowPrefix(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-base font-semibold text-text-primary">Prefix</span>
                  </label>
                  {showPrefix && (
                    <input 
                      className="input" 
                      value={value.prefix||''} 
                      onChange={(e)=>set('prefix', e.target.value)} 
                      placeholder="Prefix for title" 
                    />
                  )}

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={showSuffix} 
                      onChange={(e) => setShowSuffix(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-base font-semibold text-text-primary">Suffix</span>
                  </label>
                  {showSuffix && (
                    <input 
                      className="input" 
                      value={value.suffix||''} 
                      onChange={(e)=>set('suffix', e.target.value)} 
                      placeholder="Suffix for title" 
                    />
                  )}

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={showNegativeTitle} 
                      onChange={(e) => setShowNegativeTitle(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-base font-semibold text-text-primary">Negative Words for Title</span>
                  </label>
                  {showNegativeTitle && (
                    <input 
                      className="input" 
                      value={(value.negativeTitle||[]).join(', ')} 
                      onChange={(e)=>set('negativeTitle', sanitizeWords(e.target.value.split(',')))} 
                      placeholder="Comma-separated negative words" 
                    />
                  )}

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={showNegativeKeywords} 
                      onChange={(e) => setShowNegativeKeywords(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-base font-semibold text-text-primary">Negative Keywords</span>
                  </label>
                  {showNegativeKeywords && (
                    <input 
                      className="input" 
                      value={(value.negativeKeywords||[]).join(', ')} 
                      onChange={(e)=>set('negativeKeywords', sanitizeWords(e.target.value.split(',')))} 
                      placeholder="Comma-separated negative keywords" 
                    />
                  )}
                </div>
              </div>

              {/* File Type Attributes Toggles - Separate Collapsible Section */}
              <div className="p-4 bg-dark-surface/20 rounded-lg border border-green-accent/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="label text-text-primary mb-0">FILE TYPE ATTRIBUTES</div>
                  <button 
                    className="text-sm text-text-tertiary hover:text-green-bright transition-colors px-3 py-1.5 bg-ink/5 hover:bg-ink/10 rounded border border-ink/20 font-semibold"
                    onClick={() => setFileAttributesCollapsed(!fileAttributesCollapsed)}
                  >
                    {fileAttributesCollapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                
                {!fileAttributesCollapsed && (
                  <>
                    <p className="text-sm text-text-secondary mb-4 flex items-start gap-1.5">
                      <span className="text-green-bright">ℹ️</span>
                      <span>Specify file attributes to ensure accurate title generation. These will be automatically appended to titles.</span>
                    </p>
                    
                    <div className="space-y-2">
                  <label className="flex items-center justify-between cursor-pointer group" htmlFor="toggle-transparent">
                    <span className="text-base font-medium text-text-primary group-hover:text-green-bright transition-colors">
                      isolated on transparent background
                    </span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={value.isolatedOnTransparentBackground || false}
                        readOnly
                        className="sr-only"
                        id="toggle-transparent"
                      />
                      <div 
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                          value.isolatedOnTransparentBackground 
                            ? 'bg-green-accent' 
                            : 'bg-ink/20'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = !(value.isolatedOnTransparentBackground || false);
                          console.log(`🔄 Toggle "isolated on transparent background": ${value.isolatedOnTransparentBackground} → ${newValue}`);
                          onChange((prev) => {
                            const updated = { ...prev, isolatedOnTransparentBackground: newValue };
                            // Mutually exclusive with white background
                            if (newValue) {
                              updated.isolatedOnWhiteBackground = false;
                            }
                            console.log(`✅ Updated form state:`, {
                              isolatedOnTransparentBackground: updated.isolatedOnTransparentBackground,
                              isolatedOnWhiteBackground: updated.isolatedOnWhiteBackground
                            });
                            return updated;
                          });
                        }}
                      >
                        <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                          value.isolatedOnTransparentBackground 
                            ? 'transform translate-x-6' 
                            : 'transform translate-x-0'
                        }`}></div>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group" htmlFor="toggle-white">
                    <span className="text-base font-medium text-text-primary group-hover:text-green-bright transition-colors">
                      isolated on white background
                    </span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={value.isolatedOnWhiteBackground || false}
                        readOnly
                        className="sr-only"
                        id="toggle-white"
                      />
                      <div 
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                          value.isolatedOnWhiteBackground 
                            ? 'bg-green-accent' 
                            : 'bg-ink/20'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = !(value.isolatedOnWhiteBackground || false);
                          console.log(`🔄 Toggle "isolated on white background": ${value.isolatedOnWhiteBackground} → ${newValue}`);
                          onChange((prev) => {
                            const updated = { ...prev, isolatedOnWhiteBackground: newValue };
                            // Mutually exclusive with transparent background
                            if (newValue) {
                              updated.isolatedOnTransparentBackground = false;
                            }
                            console.log(`✅ Updated form state:`, {
                              isolatedOnTransparentBackground: updated.isolatedOnTransparentBackground,
                              isolatedOnWhiteBackground: updated.isolatedOnWhiteBackground
                            });
                            return updated;
                          });
                        }}
                      >
                        <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                          value.isolatedOnWhiteBackground 
                            ? 'transform translate-x-6' 
                            : 'transform translate-x-0'
                        }`}></div>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group" htmlFor="toggle-vector">
                    <span className="text-base font-medium text-text-primary group-hover:text-green-bright transition-colors">
                      Vector
                    </span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={value.isVector || false}
                        readOnly
                        className="sr-only"
                        id="toggle-vector"
                      />
                      <div 
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                          value.isVector 
                            ? 'bg-green-accent' 
                            : 'bg-ink/20'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = !(value.isVector || false);
                          console.log(`🔄 Toggle "Vector": ${value.isVector} → ${newValue}`);
                          onChange((prev) => {
                            const updated = { ...prev, isVector: newValue };
                            console.log(`✅ Updated form state - isVector: ${updated.isVector}`);
                            return updated;
                          });
                        }}
                      >
                        <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                          value.isVector 
                            ? 'transform translate-x-6' 
                            : 'transform translate-x-0'
                        }`}></div>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center justify-between cursor-pointer group" htmlFor="toggle-illustration">
                    <span className="text-base font-medium text-text-primary group-hover:text-green-bright transition-colors">
                      illustration
                    </span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={value.isIllustration || false}
                        readOnly
                        className="sr-only"
                        id="toggle-illustration"
                      />
                      <div 
                        className={`block w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer ${
                          value.isIllustration 
                            ? 'bg-green-accent' 
                            : 'bg-ink/20'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = !(value.isIllustration || false);
                          console.log(`🔄 Toggle "illustration": ${value.isIllustration} → ${newValue}`);
                          onChange((prev) => {
                            const updated = { ...prev, isIllustration: newValue };
                            console.log(`✅ Updated form state - isIllustration: ${updated.isIllustration}`);
                            return updated;
                          });
                        }}
                      >
                        <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                          value.isIllustration 
                            ? 'transform translate-x-6' 
                            : 'transform translate-x-0'
                        }`}></div>
                      </div>
                    </div>
                  </label>
                    </div>
                  </>
                )}
              </div>

              {/* Adobe Stock Guidelines - Only show when Adobe platform is selected */}
              {value.platform === 'adobe' && (
                <div className="mt-4 p-4 bg-dark-surface/30 rounded-lg border border-green-accent/20">
                  <div className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                    <span>📋</span>
                    <span>Adobe Stock Guidelines</span>
                  </div>
                  <div className="text-sm text-text-secondary leading-relaxed space-y-2">
                    <div>
                      <strong className="text-text-primary font-semibold">Title Guidelines:</strong>
                      <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                        <li>≤70 characters recommended (up to 200 allowed)</li>
                        <li>Use descriptive phrases, NOT keyword lists (avoid commas/semicolons)</li>
                        <li>NO third-party IP (brands, products), artist names, style references</li>
                      </ul>
                    </div>
                    <div>
                      <strong className="text-text-primary font-semibold">Keyword Guidelines:</strong>
                      <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                        <li>First 10 keywords are MOST IMPORTANT for search visibility</li>
                        <li>Split combined phrases into individual words</li>
                        <li>Use specific, descriptive terms (avoid generic terms in first 10)</li>
                        <li>One language only, no person names, no third-party IP</li>
                      </ul>
                    </div>
                    <div className="mt-2 text-sm italic text-green-bright font-semibold">
                      Note: Style references and combined phrases are auto-fixed. AI model names (gemini, mistral) are filtered.
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="label text-text-primary">Prompt Preview</div>
              <div className="p-4 rounded border border-green-accent/20 text-sm bg-green-accent/10 font-medium text-text-primary">{promptPreview}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

