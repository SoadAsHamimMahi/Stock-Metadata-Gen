'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDecryptedJSON, setEncryptedJSON } from '@/lib/util';

type StoredKey = { id: string; key: string; visible: boolean; testStatus?: 'idle' | 'testing' | 'success' | 'error'; testError?: string };

export default function KeyModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [activeProvider, setActiveProvider] = useState<'gemini'|'mistral'>('gemini');
  const [newKey, setNewKey] = useState('');
  const [geminiKeys, setGeminiKeys] = useState<StoredKey[]>([]);
  const [mistralKeys, setMistralKeys] = useState<StoredKey[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string>('');
  const [testingNewKey, setTestingNewKey] = useState(false);
  const [newKeyTestResult, setNewKeyTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const v = await getDecryptedJSON<{ 
        geminiKeys?: StoredKey[];
        mistralKeys?: StoredKey[];
        active?: 'gemini'|'mistral';
        activeKeyId?: string;
      }>('smg_keys_enc', null as any);
      if (v) {
        setGeminiKeys(v.geminiKeys || []);
        setMistralKeys(v.mistralKeys || []);
        setActiveProvider(v.active || 'gemini');
        setActiveKeyId(v.activeKeyId || '');
      }
    })();
  }, [open]);

  const addKey = async () => {
    if (!newKey.trim()) return;
    const keyObj: StoredKey = { id: Date.now().toString(), key: newKey.trim(), visible: false };
    if (activeProvider === 'gemini') {
      const updated = [...geminiKeys, keyObj];
      setGeminiKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys: updated,
        mistralKeys,
        active: activeProvider,
        activeKeyId: keyObj.id,
        bearer: newKey.trim()
      });
    } else {
      const updated = [...mistralKeys, keyObj];
      setMistralKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys: updated,
        active: activeProvider,
        activeKeyId: keyObj.id,
        bearer: newKey.trim()
      });
    }
    setNewKey('');
  };

  const deleteKey = async (id: string) => {
    if (activeProvider === 'gemini') {
      const updated = geminiKeys.filter(k => k.id !== id);
      setGeminiKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys: updated,
        mistralKeys,
        active: activeProvider,
        activeKeyId: updated.length > 0 ? updated[0].id : '',
        bearer: updated.length > 0 ? updated[0].key : ''
      });
    } else {
      const updated = mistralKeys.filter(k => k.id !== id);
      setMistralKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys: updated,
        active: activeProvider,
        activeKeyId: updated.length > 0 ? updated[0].id : '',
        bearer: updated.length > 0 ? updated[0].key : ''
      });
    }
  };

  const toggleVisibility = (id: string) => {
    if (activeProvider === 'gemini') {
      setGeminiKeys(keys => keys.map(k => k.id === id ? { ...k, visible: !k.visible } : k));
    } else {
      setMistralKeys(keys => keys.map(k => k.id === id ? { ...k, visible: !k.visible } : k));
    }
  };

  const setActiveKey = async (id: string) => {
    const keys = activeProvider === 'gemini' ? geminiKeys : mistralKeys;
    const key = keys.find(k => k.id === id);
    if (key) {
      setActiveKeyId(id);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys,
        active: activeProvider,
        activeKeyId: id,
        bearer: key.key
      });
    }
  };

  const testKey = async (key: string, id?: string) => {
    if (id) {
      // Test existing key
      const updateKeyStatus = (status: StoredKey['testStatus'], error?: string) => {
        if (activeProvider === 'gemini') {
          setGeminiKeys(keys => keys.map(k => k.id === id ? { ...k, testStatus: status, testError: error } : k));
        } else {
          setMistralKeys(keys => keys.map(k => k.id === id ? { ...k, testStatus: status, testError: error } : k));
        }
      };
      
      updateKeyStatus('testing');
      try {
        const res = await fetch('/api/test-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, apiKey: key })
        });
        const data = await res.json();
        if (data.success) {
          updateKeyStatus('success');
        } else {
          updateKeyStatus('error', data.error || 'Test failed');
        }
      } catch (error: any) {
        updateKeyStatus('error', error.message || 'Failed to test key');
      }
    } else {
      // Test new key
      setTestingNewKey(true);
      setNewKeyTestResult(null);
      try {
        const res = await fetch('/api/test-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, apiKey: key })
        });
        const data = await res.json();
        setNewKeyTestResult({
          success: data.success,
          message: data.success ? data.message : data.error
        });
      } catch (error: any) {
        setNewKeyTestResult({
          success: false,
          message: error.message || 'Failed to test key'
        });
      } finally {
        setTestingNewKey(false);
      }
    }
  };

  const currentKeys = activeProvider === 'gemini' ? geminiKeys : mistralKeys;
  const maskKey = (key: string) => {
    if (key.length <= 8) return key;
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-4 overflow-y-auto animate-fade-in" onClick={() => onOpenChange(false)}>
      <div className="bg-dark-elevated rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 text-white shadow-green-glow-lg animate-scale-in border border-green-accent/20 mt-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold mb-1">API Secrets Management</h2>
            <p className="text-sm text-white/70">Manage your AI provider API keys. Keys are stored locally and securely.</p>
          </div>
          <button 
            className="text-white/70 hover:text-white text-2xl leading-none"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">Select AI Provider</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setActiveProvider('gemini')}
              className={`p-4 rounded-lg border-2 transition ${
                activeProvider === 'gemini'
                  ? 'border-[#14B8A6] bg-[#14B8A6]/10'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">✨</span>
                <div className="flex-1 text-left">
                  <div className="font-bold mb-1">Google Gemini</div>
                  <div className="text-xs text-white/70">Google&#39;s advanced AI model for text and image analysis</div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span>{geminiKeys.length} key{geminiKeys.length !== 1 ? 's' : ''} stored</span>
                    {geminiKeys.length > 0 && <span className="text-green-400">Active</span>}
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setActiveProvider('mistral')}
              className={`p-4 rounded-lg border-2 transition ${
                activeProvider === 'mistral'
                  ? 'border-[#14B8A6] bg-[#14B8A6]/10'
                  : 'border-white/20 hover:border-white/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <div className="flex-1 text-left">
                  <div className="font-bold mb-1">Mistral AI</div>
                  <div className="text-xs text-white/70">High-performance AI models with strong reasoning capabilities</div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span>{mistralKeys.length} key{mistralKeys.length !== 1 ? 's' : ''} stored</span>
                    {mistralKeys.length > 0 && <span className="text-green-400">Active</span>}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">
            {activeProvider === 'gemini' ? 'Google Gemini' : 'Mistral AI'} API Keys
          </label>
          {activeProvider === 'gemini' && (
            <p className="text-xs text-white/70 mb-2">Gemini API keys should start with &#34;AIza&#34;</p>
          )}
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/10 border-2 border-[#14B8A6] rounded-md px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[#14B8A6]"
              type="password"
              placeholder={`Enter ${activeProvider === 'gemini' ? 'Gemini' : 'Mistral'} API key`}
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setNewKeyTestResult(null);
              }}
              onKeyPress={(e) => e.key === 'Enter' && addKey()}
            />
            <button
              onClick={() => testKey(newKey)}
              disabled={!newKey.trim() || testingNewKey}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 text-sm font-medium"
              title="Test Connection"
            >
              {testingNewKey ? 'Testing...' : 'Test'}
            </button>
            <button
              onClick={addKey}
              className="bg-[#14B8A6] hover:bg-[#0D9488] text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-lg"
            >
              +
            </button>
          </div>
          {newKeyTestResult && (
            <div className={`mt-2 text-xs px-2 py-1 rounded ${newKeyTestResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              {newKeyTestResult.success ? '✓ ' : '✗ '}
              {newKeyTestResult.message}
            </div>
          )}
          <a
            href={activeProvider === 'gemini' ? 'https://makersuite.google.com/app/apikey' : 'https://console.mistral.ai/api-keys/'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#14B8A6] text-xs mt-2 inline-flex items-center gap-1 hover:underline"
          >
            Get {activeProvider === 'gemini' ? 'Google Gemini' : 'Mistral AI'} API Key
            <span>↗</span>
          </a>
        </div>

        {currentKeys.length > 0 && (
          <div className="mb-6">
            <label className="text-sm font-medium mb-2 block">Stored Keys ({currentKeys.length})</label>
            <div className="space-y-2">
              {currentKeys.map((keyObj) => (
                <div
                  key={keyObj.id}
                  className="bg-white/5 border border-white/10 rounded-md p-3 flex items-center justify-between"
                >
                  <div className="flex-1 font-mono text-sm">
                    {keyObj.visible ? keyObj.key : maskKey(keyObj.key)}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeKeyId === keyObj.id && (
                      <span className="text-green-400 text-sm">✓</span>
                    )}
                    {keyObj.testStatus === 'testing' && (
                      <span className="text-blue-400 text-sm animate-pulse">Testing...</span>
                    )}
                    {keyObj.testStatus === 'success' && (
                      <span className="text-green-400 text-sm">✓</span>
                    )}
                    {keyObj.testStatus === 'error' && (
                      <span className="text-red-400 text-sm" title={keyObj.testError}>✗</span>
                    )}
                    <button
                      onClick={() => testKey(keyObj.key, keyObj.id)}
                      disabled={keyObj.testStatus === 'testing'}
                      className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-2 py-1 rounded text-white"
                      title="Test Connection"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => toggleVisibility(keyObj.id)}
                      className="text-white/70 hover:text-white"
                      title={keyObj.visible ? 'Hide' : 'Show'}
                    >
                      👁
                    </button>
                    <button
                      onClick={() => deleteKey(keyObj.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Delete"
                    >
                      🗑
                    </button>
                    {activeKeyId !== keyObj.id && (
                      <button
                        onClick={() => setActiveKey(keyObj.id)}
                        className="text-xs bg-[#14B8A6] hover:bg-[#0D9488] px-2 py-1 rounded"
                      >
                        Set Active
                      </button>
                    )}
                  </div>
                  {keyObj.testStatus === 'error' && keyObj.testError && (
                    <div className="mt-1 text-xs text-red-400">{keyObj.testError}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={() => onOpenChange(false)}
            className="btn bg-white/10 hover:bg-white/20 text-white border border-white/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
