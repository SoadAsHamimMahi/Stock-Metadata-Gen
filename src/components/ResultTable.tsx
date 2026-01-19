'use client';

import { Row } from '@/lib/csv';
import { useState, useEffect } from 'react';

type UploadItem = { 
  name: string; 
  url: string; 
  size: number; 
  originalSize?: number; 
  type: string; 
  ext: string;
  file?: File; // File object for client-side storage
};

export default function ResultTable({ 
  rows, 
  files = [],
  onRegenerate
}: { 
  rows: Row[];
  files?: UploadItem[];
  onRegenerate?: (filename: string) => void;
}) {
  const hasRows = rows && rows.length > 0;
  if (!hasRows) {
    return <div className="p-4 text-sm text-ink/70">No results yet. Upload files and click Generate All.</div>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r, i) => {
        const file = files.find(f => f.name === r.filename);
        return (
          <ResultCard 
            key={i} 
            row={r} 
            file={file}
            onRegenerate={onRegenerate}
          />
        );
      })}
    </div>
  );
}

function ResultCard({ 
  row, 
  file,
  onRegenerate
}: { 
  row: Row;
  file?: UploadItem;
  onRegenerate?: (filename: string) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const ext = row.extension.toLowerCase();

  const getPreviewUrl = () => {
    if (file) return file.url; // This is now a blob URL from client-side storage
    // Fallback: try to construct URL from filename (for backward compatibility)
    return `/uploads/${row.filename}`;
  };

  return (
    <div className="card p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="aspect-square bg-deep/5 rounded overflow-hidden">
          {['png','jpg','jpeg','webp','svg'].includes(ext) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getPreviewUrl()} alt={row.filename} className="w-full h-full object-cover" />
          ) : ['mp4','mov','m4v','webm'].includes(ext) ? (
            <video className="w-full h-full object-cover" src={getPreviewUrl()} controls preload="metadata" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-warm/20 text-sm font-semibold uppercase text-ink/70">
              {ext} vector
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          {/* Show prompts if available, otherwise show title/keywords */}
          {row.generatedPrompt ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label">Generated Prompt</label>
                <span className="text-xs text-ink/60">{row.generatedPrompt.length} characters</span>
              </div>
              <textarea
                className="textarea min-h-[150px] bg-green-500/10 border-green-500/30"
                value={row.generatedPrompt}
                readOnly
              />
              <div className="flex gap-2 mt-2">
                <CopyBtn label="Copy Prompt" text={row.generatedPrompt} />
                {onRegenerate && (
                  <button
                    className="btn bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm"
                    onClick={() => onRegenerate(row.filename)}
                  >
                    Regenerate
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label">T Title</label>
                  <span className="text-xs text-ink/60">{title.length} characters</span>
                </div>
                <textarea
                  className="textarea min-h-[60px]"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <div className="flex gap-2 mt-2">
                  <CopyBtn label="Copy Title" text={title} />
                  {onRegenerate && (
                    <button
                      className="btn bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm"
                      onClick={() => onRegenerate(row.filename)}
                    >
                      Regenerate
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="label mb-2">Keywords ({row.keywords.length})</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {row.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-warm/20 text-sm rounded-md border border-warm/40 text-ink"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
                <CopyBtn label="Copy Keywords" text={row.keywords.join(',    ')} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ label, text }: { label: string; text: string }) {
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  return (
    <button
      className={`btn btn-ghost text-sm ${canCopy ? '' : 'btn-disabled'}`}
      onClick={() => navigator.clipboard.writeText(text)}
      disabled={!canCopy}
      title={`Copy ${label}`}
    >
      {label}
    </button>
  );
}


