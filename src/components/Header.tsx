'use client';

import { useEffect, useMemo, useState } from 'react';
import KeyModal from './KeyModal';
import { getJSON, getDecryptedJSON } from '@/lib/util';

type HeaderProps = {
  onExportCSV?: () => void;
  hasRows?: boolean;
};

export default function Header({ onExportCSV, hasRows = false }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{ at: number; count: number }>>([]);
  const [bearer, setBearer] = useState('');
  
  useEffect(() => {
    setHistory(getJSON<Array<{ at: number; count: number }>>('smg_history', []));
    (async () => {
      const enc = await getDecryptedJSON<{ bearer?: string } | null>('smg_keys_enc', null);
      setBearer(enc?.bearer || '');
    })();
  }, []);

  return (
    <>
      <div className="flex items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-xl shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300 animate-pulse-glow">
            🐦
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-gradient">CSVMest</div>
            <div className="text-xs text-text-tertiary font-medium">CSVMest</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
       
          <button 
            className="btn btn-ghost text-sm font-semibold hover:shadow-green-glow transition-all duration-300" 
            onClick={() => setOpen(true)}
          >
            API Secrets
          </button>
          <button 
            className="btn btn-ghost text-sm flex items-center gap-1 font-semibold hover:shadow-green-glow transition-all duration-300" 
            onClick={() => setShowHistory(s => !s)}
          >
            <span>History</span>
            <span className="text-xs">🔄</span>
          </button>
          {onExportCSV && (
            <button 
              className={`btn text-sm font-bold ${hasRows ? '' : 'btn-disabled'}`}
              onClick={onExportCSV}
              disabled={!hasRows}
            >
              Export CSV
            </button>
          )}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-green-accent/30">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-sm font-bold text-white shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300">
              SA
            </div>
            <span className="text-sm text-text-primary font-semibold">Soad As Hamim Mahi</span>
          </div>
        </div>
      </div>
      <KeyModal open={open} onOpenChange={setOpen} />
      {showHistory && (
        <div className="absolute right-4 top-20 z-50 card p-4 w-80 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="font-bold text-text-primary">History</div>
            <button 
              className="text-sm text-green-bright hover:text-green-accent transition-colors font-semibold" 
              onClick={() => setShowHistory(false)}
            >
              Close
            </button>
          </div>
          <div className="max-h-64 overflow-auto space-y-2">
            {history.length === 0 && <div className="text-sm text-text-tertiary font-medium">No history yet.</div>}
            {history.map((h, i) => (
              <div 
                key={i} 
                className="text-sm text-text-primary p-2 rounded-lg hover:bg-dark-elevated/50 transition-colors cursor-pointer"
              >
                <span className="font-bold text-green-bright">{h.count} rows</span>
                <span className="text-text-tertiary"> — {new Date(h.at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


