'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDecryptedJSON, setEncryptedJSON } from '@/lib/util';
import type { GeminiModel, MistralModel } from '@/lib/types';

// Feature flag: Mistral is temporarily disabled (paid service)
const MISTRAL_ENABLED = false;

type StoredKey = { 
  id: string; 
  key: string; 
  visible: boolean; 
  testStatus?: 'idle' | 'testing' | 'success' | 'error'; 
  testError?: string;
  enabledForParallel?: boolean; // Selected for parallel generation (default: true for new keys)
};

// Model display names and API mappings
const GEMINI_MODELS: Array<{ value: GeminiModel; label: string; quota: string }> = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', quota: '20 images/day (free tier)' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', quota: '20 images/day (free tier)' }
];

const MISTRAL_MODELS: Array<{ value: MistralModel; label: string; quota: string }> = [
  { value: 'mistral-small-latest', label: 'Mistral Small', quota: 'Unlimited (paid tier)' },
  { value: 'mistral-medium-latest', label: 'Mistral Medium', quota: 'Unlimited (paid tier)' },
  { value: 'mistral-large-latest', label: 'Mistral Large', quota: 'Unlimited (paid tier)' }
];

export default function KeyModal({
  open,
  onOpenChange,
  onKeysChanged,
  onModelChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onKeysChanged?: (provider: 'gemini' | 'mistral', usableCount: number) => void;
  onModelChanged?: (provider: 'gemini' | 'mistral', model: GeminiModel | MistralModel) => void;
}) {
  const [activeProvider, setActiveProvider] = useState<'gemini'|'mistral'>('gemini');
  
  // Force provider to Gemini if Mistral is disabled
  useEffect(() => {
    if (!MISTRAL_ENABLED && activeProvider === 'mistral') {
      setActiveProvider('gemini');
    }
  }, [activeProvider]);
  const [newKey, setNewKey] = useState('');
  const [geminiKeys, setGeminiKeys] = useState<StoredKey[]>([]);
  const [mistralKeys, setMistralKeys] = useState<StoredKey[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string>('');
  const [testingNewKey, setTestingNewKey] = useState(false);
  const [newKeyTestResult, setNewKeyTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [geminiModel, setGeminiModel] = useState<GeminiModel>('gemini-2.5-flash');
  const [mistralModel, setMistralModel] = useState<MistralModel>('mistral-small-latest');
  const [savingModel, setSavingModel] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);

  const getUsableCount = (keys: StoredKey[]) =>
    keys.filter(k => k.enabledForParallel !== false && k.key && k.key.trim().length > 0).length;

  const notifyKeysChanged = (provider: 'gemini' | 'mistral', keys: StoredKey[]) => {
    onKeysChanged?.(provider, getUsableCount(keys));
  };

  useEffect(() => {
    if (!open) return;
    (async () => {
      const v = await getDecryptedJSON<{ 
        geminiKeys?: StoredKey[];
        mistralKeys?: StoredKey[];
        active?: 'gemini'|'mistral';
        activeKeyId?: string;
        geminiModel?: GeminiModel;
        mistralModel?: MistralModel;
      }>('smg_keys_enc', null as any);
      if (v) {
        // Ensure backward compatibility: default enabledForParallel to true if not set
        const normalizeKeys = (keys: StoredKey[] | undefined): StoredKey[] => {
          return (keys || []).map(k => ({
            ...k,
            enabledForParallel: k.enabledForParallel !== false // Default to true
          }));
        };
        
        const normGemini = normalizeKeys(v.geminiKeys);
        const normMistral = normalizeKeys(v.mistralKeys);
        setGeminiKeys(normGemini);
        setMistralKeys(normMistral);

        const provider = v.active || 'gemini';
        setActiveProvider(provider);
        setActiveKeyId(v.activeKeyId || '');

        // Load model selections (with defaults)
        if (v.geminiModel) {
          setGeminiModel(v.geminiModel);
        }
        if (v.mistralModel) {
          setMistralModel(v.mistralModel);
        }

        const initialKeys = provider === 'gemini' ? normGemini : normMistral;
        notifyKeysChanged(provider, initialKeys);
      }
    })();
  }, [open]);

  const saveModelPreference = async (provider: 'gemini' | 'mistral', model: GeminiModel | MistralModel) => {
    try {
      console.log(`💾 saveModelPreference: Starting save for ${provider} -> ${model}`);
      const current = await getDecryptedJSON<any>('smg_keys_enc', null as any);
      console.log(`💾 saveModelPreference: Current storage data:`, current ? 'exists' : 'null');
      
      const updatedData = {
        ...current,
        geminiKeys: geminiKeys,
        mistralKeys: mistralKeys,
        active: activeProvider,
        activeKeyId: activeKeyId,
        bearer: current?.bearer || '',
        geminiModel: provider === 'gemini' ? model : (current?.geminiModel || geminiModel),
        mistralModel: provider === 'mistral' ? model : (current?.mistralModel || mistralModel)
      };
      
      console.log(`💾 saveModelPreference: Saving data with geminiModel: ${updatedData.geminiModel}, mistralModel: ${updatedData.mistralModel}`);
      await setEncryptedJSON('smg_keys_enc', updatedData);
      console.log(`✅ saveModelPreference: Successfully saved to storage`);
      
      // Dispatch custom event to notify other components of the change
      window.dispatchEvent(new CustomEvent('modelPreferenceChanged', {
        detail: { provider, model }
      }));
      console.log(`📢 Dispatched modelPreferenceChanged event`);
      
      // Verify the save by reading it back
      const verify = await getDecryptedJSON<any>('smg_keys_enc', null as any);
      if (verify) {
        console.log(`✅ saveModelPreference: Verification - geminiModel: ${verify.geminiModel}, mistralModel: ${verify.mistralModel}`);
      }
    } catch (error) {
      console.error('❌ saveModelPreference: Error saving:', error);
      throw error; // Re-throw to be caught by the button handler
    }
  };

  const addKey = async () => {
    if (!newKey.trim()) return;
    const keyObj: StoredKey = { 
      id: Date.now().toString(), 
      key: newKey.trim(), 
      visible: false,
      enabledForParallel: true // New keys are selected for parallel by default
    };
    if (activeProvider === 'gemini') {
      const updated = [...geminiKeys, keyObj];
      setGeminiKeys(updated);
      const current = await getDecryptedJSON<any>('smg_keys_enc', null as any);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys: updated,
        mistralKeys,
        active: activeProvider,
        activeKeyId: keyObj.id,
        bearer: newKey.trim(),
        geminiModel: geminiModel,
        mistralModel: current?.mistralModel || mistralModel
      });
      notifyKeysChanged('gemini', updated);
    } else {
      const updated = [...mistralKeys, keyObj];
      setMistralKeys(updated);
      const current = await getDecryptedJSON<any>('smg_keys_enc', null as any);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys: updated,
        active: activeProvider,
        activeKeyId: keyObj.id,
        bearer: newKey.trim(),
        geminiModel: current?.geminiModel || geminiModel,
        mistralModel: mistralModel
      });
      notifyKeysChanged('mistral', updated);
    }
    setNewKey('');
  };

  const deleteKey = async (id: string) => {
    const current = await getDecryptedJSON<any>('smg_keys_enc', null as any);
    if (activeProvider === 'gemini') {
      const updated = geminiKeys.filter(k => k.id !== id);
      setGeminiKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys: updated,
        mistralKeys,
        active: activeProvider,
        activeKeyId: updated.length > 0 ? updated[0].id : '',
        bearer: updated.length > 0 ? updated[0].key : '',
        geminiModel: geminiModel,
        mistralModel: current?.mistralModel || mistralModel
      });
      notifyKeysChanged('gemini', updated);
    } else {
      const updated = mistralKeys.filter(k => k.id !== id);
      setMistralKeys(updated);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys: updated,
        active: activeProvider,
        activeKeyId: updated.length > 0 ? updated[0].id : '',
        bearer: updated.length > 0 ? updated[0].key : '',
        geminiModel: current?.geminiModel || geminiModel,
        mistralModel: mistralModel
      });
      notifyKeysChanged('mistral', updated);
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
      const current = await getDecryptedJSON<any>('smg_keys_enc', null as any);
      await setEncryptedJSON('smg_keys_enc', {
        geminiKeys,
        mistralKeys,
        active: activeProvider,
        activeKeyId: id,
        bearer: key.key,
        geminiModel: geminiModel,
        mistralModel: current?.mistralModel || mistralModel
      });
      notifyKeysChanged(activeProvider, activeProvider === 'gemini' ? geminiKeys : mistralKeys);
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

  // Separate keys into selected (for parallel) and available
  const selectedKeys = currentKeys.filter(k => k.enabledForParallel !== false);
  const availableKeys = currentKeys.filter(k => k.enabledForParallel === false);

  // Move key to selected (enable for parallel)
  const moveToSelected = async (id: string) => {
    if (activeProvider === 'gemini') {
      setGeminiKeys(keys => {
        const updated = keys.map(k => k.id === id ? { ...k, enabledForParallel: true } : k);
        getDecryptedJSON<{
          geminiKeys?: StoredKey[];
          mistralKeys?: StoredKey[];
          active?: 'gemini'|'mistral';
          activeKeyId?: string;
          geminiModel?: GeminiModel;
          mistralModel?: MistralModel;
        }>('smg_keys_enc', null as any).then(enc => {
          setEncryptedJSON('smg_keys_enc', {
            ...enc,
            geminiKeys: updated,
            geminiModel: geminiModel,
            mistralModel: enc?.mistralModel || mistralModel
          }).then(() => {
            notifyKeysChanged('gemini', updated);
          });
        });
        return updated;
      });
    } else {
      setMistralKeys(keys => {
        const updated = keys.map(k => k.id === id ? { ...k, enabledForParallel: true } : k);
        getDecryptedJSON<{
          geminiKeys?: StoredKey[];
          mistralKeys?: StoredKey[];
          active?: 'gemini'|'mistral';
          activeKeyId?: string;
          geminiModel?: GeminiModel;
          mistralModel?: MistralModel;
        }>('smg_keys_enc', null as any).then(enc => {
          setEncryptedJSON('smg_keys_enc', {
            ...enc,
            mistralKeys: updated,
            geminiModel: enc?.geminiModel || geminiModel,
            mistralModel: mistralModel
          }).then(() => {
            notifyKeysChanged('mistral', updated);
          });
        });
        return updated;
      });
    }
  };

  // Move key to available (disable for parallel)
  const moveToAvailable = async (id: string) => {
    if (activeProvider === 'gemini') {
      setGeminiKeys(keys => {
        const updated = keys.map(k => k.id === id ? { ...k, enabledForParallel: false } : k);
        getDecryptedJSON<{
          geminiKeys?: StoredKey[];
          mistralKeys?: StoredKey[];
          active?: 'gemini'|'mistral';
          activeKeyId?: string;
          geminiModel?: GeminiModel;
          mistralModel?: MistralModel;
        }>('smg_keys_enc', null as any).then(enc => {
          setEncryptedJSON('smg_keys_enc', {
            ...enc,
            geminiKeys: updated,
            geminiModel: geminiModel,
            mistralModel: enc?.mistralModel || mistralModel
          }).then(() => {
            notifyKeysChanged('gemini', updated);
          });
        });
        return updated;
      });
    } else {
      setMistralKeys(keys => {
        const updated = keys.map(k => k.id === id ? { ...k, enabledForParallel: false } : k);
        getDecryptedJSON<{
          geminiKeys?: StoredKey[];
          mistralKeys?: StoredKey[];
          active?: 'gemini'|'mistral';
          activeKeyId?: string;
          geminiModel?: GeminiModel;
          mistralModel?: MistralModel;
        }>('smg_keys_enc', null as any).then(enc => {
          setEncryptedJSON('smg_keys_enc', {
            ...enc,
            mistralKeys: updated,
            geminiModel: enc?.geminiModel || geminiModel,
            mistralModel: mistralModel
          }).then(() => {
            notifyKeysChanged('mistral', updated);
          });
        });
        return updated;
      });
    }
  };

  // Test all selected keys
  const testAllSelectedKeys = async () => {
    if (selectedKeys.length === 0) return;
    
    // Update all selected keys to testing status
    if (activeProvider === 'gemini') {
      setGeminiKeys(keys => keys.map(k => 
        selectedKeys.some(sk => sk.id === k.id) 
          ? { ...k, testStatus: 'testing' as const } 
          : k
      ));
    } else {
      setMistralKeys(keys => keys.map(k => 
        selectedKeys.some(sk => sk.id === k.id) 
          ? { ...k, testStatus: 'testing' as const } 
          : k
      ));
    }
    
    // Test all selected keys in parallel
    const testPromises = selectedKeys.map(async (keyObj) => {
      try {
        const res = await fetch('/api/test-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, apiKey: keyObj.key })
        });
        const data = await res.json();
        
        const updateKeyStatus = (status: StoredKey['testStatus'], error?: string) => {
          if (activeProvider === 'gemini') {
            setGeminiKeys(keys => keys.map(k => 
              k.id === keyObj.id ? { ...k, testStatus: status, testError: error } : k
            ));
          } else {
            setMistralKeys(keys => keys.map(k => 
              k.id === keyObj.id ? { ...k, testStatus: status, testError: error } : k
            ));
          }
        };
        
        if (data.success) {
          updateKeyStatus('success');
        } else {
          updateKeyStatus('error', data.error || 'Test failed');
        }
      } catch (error: any) {
        const updateKeyStatus = (status: StoredKey['testStatus'], error?: string) => {
          if (activeProvider === 'gemini') {
            setGeminiKeys(keys => keys.map(k => 
              k.id === keyObj.id ? { ...k, testStatus: status, testError: error } : k
            ));
          } else {
            setMistralKeys(keys => keys.map(k => 
              k.id === keyObj.id ? { ...k, testStatus: status, testError: error } : k
            ));
          }
        };
        updateKeyStatus('error', error.message || 'Failed to test key');
      }
    });
    
    await Promise.all(testPromises);
  };

  // Helper function to render status badge
  const renderStatusBadge = (keyObj: StoredKey, isPrimary: boolean = false) => {
    if (keyObj.testStatus === 'testing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
          Testing...
        </span>
      );
    }
    if (isPrimary || activeKeyId === keyObj.id) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
          ✓ Primary
        </span>
      );
    }
    if (keyObj.testStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30">
          ✗ Error
        </span>
      );
    }
    if (keyObj.testStatus === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30">
          ✓ Working
        </span>
      );
    }
    return null;
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-4 overflow-y-auto animate-fade-in" onClick={() => onOpenChange(false)}>
      <div className="bg-dark-elevated rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 text-white shadow-green-glow-lg animate-scale-in border border-green-accent/20 mt-4" onClick={(e) => e.stopPropagation()}>
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
          <div className={`grid ${MISTRAL_ENABLED ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
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

            {MISTRAL_ENABLED && (
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
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">Select Model</label>
          <div className="mb-3">
            <div className="flex gap-2 items-start">
              <select
                value={activeProvider === 'gemini' ? geminiModel : mistralModel}
                onChange={(e) => {
                  const newModel = e.target.value as GeminiModel | MistralModel;
                  if (activeProvider === 'gemini') {
                    setGeminiModel(newModel as GeminiModel);
                    setModelSaved(false); // Reset saved state when selection changes
                  } else if (MISTRAL_ENABLED) {
                    setMistralModel(newModel as MistralModel);
                    setModelSaved(false); // Reset saved state when selection changes
                  }
                }}
                className="flex-1 bg-white/10 border-2 border-[#14B8A6] rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#14B8A6] cursor-pointer appearance-none hover:bg-white/15 transition-colors"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2314B8A6' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  paddingRight: '2.5rem'
                }}
              >
                {(activeProvider === 'gemini' ? GEMINI_MODELS : (MISTRAL_ENABLED ? MISTRAL_MODELS : GEMINI_MODELS)).map((model) => (
                  <option key={model.value} value={model.value} className="bg-dark-elevated">
                    {model.label}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  setSavingModel(true);
                  setModelSaved(false);
                  try {
                    const currentModel = activeProvider === 'gemini' ? geminiModel : mistralModel;
                    console.log(`💾 Saving model preference: ${activeProvider} -> ${currentModel}`);
                    
                    if (activeProvider === 'gemini') {
                      // Save to storage first
                      await saveModelPreference('gemini', geminiModel);
                      console.log(`✅ Model saved to storage: ${geminiModel}`);
                      
                      // Call the callback to update parent form state IMMEDIATELY
                      if (onModelChanged) {
                        console.log(`📞 Calling onModelChanged callback with: ${geminiModel}`);
                        // Call synchronously to ensure immediate update
                        onModelChanged('gemini', geminiModel);
                        console.log(`✅ Callback executed`);
                        
                        // Give React a moment to process the state update
                        await new Promise(resolve => setTimeout(resolve, 50));
                        console.log(`⏳ Waited for state update to propagate`);
                      } else {
                        console.warn('⚠️ onModelChanged callback is not defined');
                      }
                    } else if (MISTRAL_ENABLED) {
                      // Save to storage first
                      await saveModelPreference('mistral', mistralModel);
                      console.log(`✅ Model saved to storage: ${mistralModel}`);
                      
                      if (onModelChanged) {
                        console.log(`📞 Calling onModelChanged callback with: ${mistralModel}`);
                        // Call synchronously to ensure immediate update
                        onModelChanged('mistral', mistralModel);
                        console.log(`✅ Callback executed`);
                        
                        // Give React a moment to process the state update
                        await new Promise(resolve => setTimeout(resolve, 50));
                        console.log(`⏳ Waited for state update to propagate`);
                      } else {
                        console.warn('⚠️ onModelChanged callback is not defined');
                      }
                    }
                    
                    setModelSaved(true);
                    console.log(`✅ Save operation completed successfully`);
                    
                    // Reset saved state after 3 seconds (increased from 2)
                    setTimeout(() => {
                      setModelSaved(false);
                      console.log(`🔄 Saved state reset`);
                    }, 3000);
                  } catch (error) {
                    console.error('❌ Failed to save model preference:', error);
                    alert(`Failed to save model preference: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    setModelSaved(false);
                  } finally {
                    setSavingModel(false);
                  }
                }}
                disabled={savingModel}
                className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${
                  modelSaved
                    ? 'bg-green-600 text-white'
                    : savingModel
                    ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    : 'bg-[#14B8A6] hover:bg-[#0FA896] text-white'
                }`}
              >
                {modelSaved ? (
                  <span className="flex items-center gap-1">
                    <span>✓</span>
                    <span>Saved</span>
                  </span>
                ) : savingModel ? (
                  <span className="flex items-center gap-1">
                    <span className="animate-spin">⏳</span>
                    <span>Saving...</span>
                  </span>
                ) : (
                  'Save'
                )}
              </button>
            </div>
            {!modelSaved && (
              <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                <span>💡</span>
                <span>Click &quot;Save&quot; to apply the model selection</span>
              </div>
            )}
            <div className="mt-2 space-y-1">
              <div className="text-xs text-white/70 flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span>ℹ️</span>
                  <span>
                    {activeProvider === 'gemini' 
                      ? GEMINI_MODELS.find(m => m.value === geminiModel)?.quota 
                      : (MISTRAL_ENABLED ? MISTRAL_MODELS.find(m => m.value === mistralModel)?.quota : GEMINI_MODELS.find(m => m.value === geminiModel)?.quota)}
                  </span>
                </span>
                {activeProvider === 'gemini' && (
                  <span className="text-white/50">(Quota shared across all Gemini models)</span>
                )}
              </div>
              {activeProvider === 'gemini' && (
                <div className="text-xs text-white/60 italic">
                  💡 Free tier: Choose Flash-Lite for speed; choose 2.5 Flash if you need slightly better quality
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">
            Google Gemini API Keys
          </label>
          <p className="text-xs text-white/70 mb-2">Gemini API keys should start with &#34;AIza&#34;</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/10 border-2 border-[#14B8A6] rounded-md px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-[#14B8A6]"
              type="password"
              placeholder="Enter Gemini API key"
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
            <div className={`mt-2 text-xs px-2 py-1.5 rounded break-words overflow-wrap-anywhere max-w-full ${newKeyTestResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
              <div className="flex items-start gap-1">
                <span className="flex-shrink-0">{newKeyTestResult.success ? '✓ ' : '✗ '}</span>
                <span className="break-words overflow-wrap-anywhere whitespace-pre-wrap">{newKeyTestResult.message}</span>
              </div>
            </div>
          )}
          <a
            href={activeProvider === 'gemini' ? 'https://makersuite.google.com/app/apikey' : 'https://console.mistral.ai/api-keys/'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#14B8A6] text-xs mt-2 inline-flex items-center gap-1 hover:underline"
          >
            Get Google Gemini API Key
            <span>↗</span>
          </a>
        </div>

        {currentKeys.length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <label className="text-base font-semibold block text-text-primary">Stored Keys</label>
                <p className="text-xs text-text-tertiary mt-1">
                  {currentKeys.length} total • {selectedKeys.length} selected for parallel • {activeKeyId ? '1 primary' : 'No primary'}
                </p>
              </div>
            </div>

            {/* Two-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column: Selected Keys (Parallel Generation) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">Selected Keys</h3>
                  <span className="text-xs text-text-tertiary bg-green-accent/10 px-2 py-0.5 rounded border border-green-accent/20">
                    {selectedKeys.length} selected
                  </span>
                </div>
                <p className="text-xs text-text-tertiary mb-3">Keys enabled for parallel generation mode</p>
                {selectedKeys.length > 0 && (
                  <button
                    onClick={testAllSelectedKeys}
                    disabled={selectedKeys.some(k => k.testStatus === 'testing')}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1.5 rounded text-white font-medium transition-colors mb-3"
                    title="Test all selected keys"
                  >
                    {selectedKeys.some(k => k.testStatus === 'testing') ? 'Testing...' : 'Test All'}
                  </button>
                )}
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {selectedKeys.length > 0 ? (
                    selectedKeys.map((keyObj) => {
                      const isPrimary = activeKeyId === keyObj.id;
                      return (
                        <div
                          key={keyObj.id}
                          className={`bg-dark-elevated/80 border rounded-lg p-4 flex flex-col gap-3 ${
                            isPrimary
                              ? 'border-green-accent/40 bg-green-accent/5'
                              : 'border-green-accent/20'
                          }`}
                        >
                          {/* Header Row: Key + Status */}
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-sm text-text-primary truncate flex-1">
                              {keyObj.visible ? keyObj.key : maskKey(keyObj.key)}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {renderStatusBadge(keyObj, isPrimary)}
                            </div>
                          </div>

                          {/* Status Messages */}
                          {(keyObj.testStatus === 'error' && keyObj.testError) && (
                            <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20 break-words overflow-wrap-anywhere max-w-full">
                              <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-32 overflow-y-auto">
                                {keyObj.testError}
                              </div>
                            </div>
                          )}

                          {/* Divider */}
                          <div className="border-t border-green-accent/10"></div>

                          {/* Actions Row */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => testKey(keyObj.key, keyObj.id)}
                                disabled={keyObj.testStatus === 'testing'}
                                className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1.5 rounded text-white font-medium transition-colors"
                                title="Test Connection"
                              >
                                Test
                              </button>
                              {!isPrimary && (
                                <button
                                  onClick={() => setActiveKey(keyObj.id)}
                                  className="text-xs bg-green-accent hover:bg-green-bright px-3 py-1.5 rounded text-white font-medium transition-colors"
                                  title="Set as primary key for single mode"
                                >
                                  Set as Primary
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => moveToAvailable(keyObj.id)}
                                className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-white font-medium transition-colors"
                                title="Move to Available (remove from parallel)"
                              >
                                →
                              </button>
                              <button
                                onClick={() => toggleVisibility(keyObj.id)}
                                className="text-text-tertiary hover:text-text-primary transition-colors p-1.5"
                                title={keyObj.visible ? 'Hide' : 'Show'}
                              >
                                👁
                              </button>
                              <button
                                onClick={() => deleteKey(keyObj.id)}
                                className="text-red-400 hover:text-red-300 transition-colors p-1.5"
                                title="Delete"
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-text-tertiary text-sm border border-green-accent/10 rounded-lg bg-dark-surface/30">
                      No keys selected for parallel generation
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Available Keys */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">Available Keys</h3>
                  <span className="text-xs text-text-tertiary bg-white/10 px-2 py-0.5 rounded border border-white/20">
                    {availableKeys.length} available
                  </span>
                </div>
                <p className="text-xs text-text-tertiary mb-3">Keys not selected for parallel generation</p>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                  {availableKeys.length > 0 ? (
                    availableKeys.map((keyObj) => (
                      <div
                        key={keyObj.id}
                        className="bg-dark-elevated/80 border border-white/20 rounded-lg p-4 flex flex-col gap-3"
                      >
                        {/* Header Row: Key + Status */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-mono text-sm text-text-primary truncate flex-1">
                            {keyObj.visible ? keyObj.key : maskKey(keyObj.key)}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {renderStatusBadge(keyObj)}
                          </div>
                        </div>

                        {/* Status Messages */}
                        {(keyObj.testStatus === 'error' && keyObj.testError) && (
                          <div className="text-xs text-red-400 bg-red-500/10 px-2 py-1.5 rounded border border-red-500/20 break-words overflow-wrap-anywhere max-w-full">
                            <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere max-h-32 overflow-y-auto">
                              {keyObj.testError}
                            </div>
                          </div>
                        )}

                        {/* Divider */}
                        <div className="border-t border-white/10"></div>

                        {/* Actions Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => testKey(keyObj.key, keyObj.id)}
                              disabled={keyObj.testStatus === 'testing'}
                              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1.5 rounded text-white font-medium transition-colors"
                              title="Test Connection"
                            >
                              Test
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => moveToSelected(keyObj.id)}
                              className="text-xs bg-green-accent hover:bg-green-bright px-2 py-1 rounded text-white font-medium transition-colors"
                              title="Move to Selected (enable for parallel)"
                            >
                              ←
                            </button>
                            <button
                              onClick={() => toggleVisibility(keyObj.id)}
                              className="text-text-tertiary hover:text-text-primary transition-colors p-1.5"
                              title={keyObj.visible ? 'Hide' : 'Show'}
                            >
                              👁
                            </button>
                            <button
                              onClick={() => deleteKey(keyObj.id)}
                              className="text-red-400 hover:text-red-300 transition-colors p-1.5"
                              title="Delete"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-text-tertiary text-sm border border-green-accent/10 rounded-lg bg-dark-surface/30">
                      No available keys
                    </div>
                  )}
                </div>
              </div>
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
