'use client';

import { useState } from 'react';
import type { Row } from '@/lib/csv';
import type { FormState } from '@/lib/types';

export default function ModelComparison({
  files,
  form,
  onCompare
}: {
  files: Array<{ name: string; url: string; type: string }>;
  form: FormState;
  onCompare: (model: 'gemini' | 'mistral', file: { name: string; url: string; type: string }) => Promise<Row | null>;
}) {
  const [comparing, setComparing] = useState(false);
  const [results, setResults] = useState<{
    gemini: Row | null;
    mistral: Row | null;
  }>({ gemini: null, mistral: null });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!selectedFile) return;
    const file = files.find(f => f.name === selectedFile);
    if (!file) return;

    setComparing(true);
    setResults({ gemini: null, mistral: null });

    try {
      const [geminiResult, mistralResult] = await Promise.all([
        onCompare('gemini', file),
        onCompare('mistral', file)
      ]);

      setResults({
        gemini: geminiResult,
        mistral: mistralResult
      });
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setComparing(false);
    }
  };

  return (
    <div className="p-4 bg-ink/5 rounded border border-ink/20">
      <h3 className="font-semibold mb-4">Model Comparison</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select File</label>
          <select
            value={selectedFile || ''}
            onChange={(e) => setSelectedFile(e.target.value)}
            className="w-full px-3 py-2 border border-ink/20 rounded bg-paper"
            disabled={comparing}
          >
            <option value="">Choose a file...</option>
            {files.map(f => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCompare}
          disabled={!selectedFile || comparing}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {comparing ? 'Comparing...' : 'Compare Models'}
        </button>

        {(results.gemini || results.mistral) && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* Gemini Results */}
            <div className="p-3 bg-paper rounded border border-ink/20">
              <div className="font-medium mb-2 text-blue-600">Gemini</div>
              {results.gemini ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="font-medium">Title:</div>
                    <div className="text-ink/80">{results.gemini.title}</div>
                    <div className="text-xs text-ink/60">{results.gemini.title?.length} chars</div>
                  </div>
                  <div>
                    <div className="font-medium">Keywords ({results.gemini.keywords?.length || 0}):</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {results.gemini.keywords?.slice(0, 10).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-ink/60">Failed to generate</div>
              )}
            </div>

            {/* Mistral Results */}
            <div className="p-3 bg-paper rounded border border-ink/20">
              <div className="font-bold mb-2 text-teal-bright">Mistral</div>
              {results.mistral ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="font-medium">Title:</div>
                    <div className="text-ink/80">{results.mistral.title}</div>
                    <div className="text-xs text-ink/60">{results.mistral.title?.length} chars</div>
                  </div>
                  <div>
                    <div className="font-medium">Keywords ({results.mistral.keywords?.length || 0}):</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {results.mistral.keywords?.slice(0, 10).map((kw, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-teal-accent/20 text-teal-bright text-xs rounded border border-teal-accent/30 font-medium">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-ink/60">Failed to generate</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

