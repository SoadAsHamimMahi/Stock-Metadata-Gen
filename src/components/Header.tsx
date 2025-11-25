'use client';

import { useEffect, useMemo, useState } from 'react';
import KeyModal from './KeyModal';
import { getDecryptedJSON } from '@/lib/util';

type HeaderProps = {
  onExportCSV?: () => void;
  hasRows?: boolean;
};

export default function Header({ onExportCSV, hasRows = false }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [bearer, setBearer] = useState('');
  
  useEffect(() => {
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
            <div className="text-4xl font-extrabold tracking-tight text-white font-space-grotesk leading-tight">StockCSV</div>
            <div className="text-sm text-text-secondary font-medium tracking-wide font-space-grotesk">AI-Powered Stock Metadata Generator</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
       
          <button 
            className="btn btn-ghost text-base font-semibold hover:shadow-green-glow transition-all duration-300" 
            onClick={() => setOpen(true)}
          >
            API Secrets
          </button>
          {onExportCSV && (
            <button 
              className={`btn text-base font-bold ${hasRows ? '' : 'btn-disabled'}`}
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
            <span className="text-base text-text-primary font-semibold">Soad As Hamim Mahi</span>
          </div>
        </div>
      </div>
      <KeyModal open={open} onOpenChange={setOpen} />
    </>
  );
}


