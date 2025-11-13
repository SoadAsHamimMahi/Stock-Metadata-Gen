'use client';

import { useState, useEffect } from 'react';
import { getJSON, setJSON } from '@/lib/util';
import type { Row } from '@/lib/csv';

interface HistoryEntry {
  id: string;
  timestamp: number;
  rows: Row[];
  formState: any;
}

const HISTORY_STORAGE_KEY = 'smg_generation_history';
const MAX_HISTORY = 50;

// Export function to save history (defined before component to avoid forward reference issues)
export function saveToHistory(rows: Row[], formState: any): void {
  if (typeof window === 'undefined') return;
  const stored = getJSON<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);
  const newEntry: HistoryEntry = {
    id: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    rows: rows.map(r => ({ ...r })),
    formState
  };
  
  const updated = [newEntry, ...stored].slice(0, MAX_HISTORY);
  setJSON(HISTORY_STORAGE_KEY, updated);
}

export default function HistoryViewer({
  onRestore
}: {
  onRestore: (rows: Row[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (showModal) {
      const stored = getJSON<HistoryEntry[]>(HISTORY_STORAGE_KEY, []);
      setHistory(stored);
    }
  }, [showModal]);

  const handleRestore = (entry: HistoryEntry) => {
    onRestore(entry.rows);
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this history entry?')) {
      const updated = history.filter(h => h.id !== id);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      setHistory(updated);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm bg-ink/5 hover:bg-ink/10 rounded border border-ink/20"
      >
        History
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-paper rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Generation History</h2>
                <button onClick={() => setShowModal(false)} className="text-ink/60 hover:text-ink">✕</button>
              </div>

              {history.length === 0 ? (
                <p className="text-ink/60 text-center py-8">No history entries yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 border rounded cursor-pointer hover:bg-ink/5 ${
                        selectedEntry?.id === entry.id ? 'border-blue-500 bg-blue-50' : 'border-ink/20'
                      }`}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium">{formatDate(entry.timestamp)}</div>
                          <div className="text-sm text-ink/60 mt-1">
                            {entry.rows.length} file(s) | Platform: {entry.formState?.platform || 'unknown'} | 
                            Model: {entry.formState?.model?.provider || 'unknown'}
                          </div>
                          {selectedEntry?.id === entry.id && (
                            <div className="mt-3 text-sm">
                              <div className="font-medium mb-2">Preview:</div>
                              {entry.rows.slice(0, 3).map((row, i) => (
                                <div key={i} className="mb-2 p-2 bg-paper rounded border border-ink/20">
                                  <div className="font-medium text-xs">{row.filename}</div>
                                  <div className="text-xs text-ink/80 mt-1">{row.title}</div>
                                </div>
                              ))}
                              {entry.rows.length > 3 && (
                                <div className="text-xs text-ink/60">+{entry.rows.length - 3} more...</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(entry);
                            }}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Restore
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(entry.id);
                            }}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

