// Key Pool Manager for distributing API keys across parallel workers
// Ensures each worker gets a unique API key to avoid quota limits

import { getDecryptedJSON } from './util';
import type { GeminiModel, MistralModel, GroqModel } from './types';

type StoredKey = { id: string; key: string; visible: boolean; enabledForParallel?: boolean };

interface KeyPool {
  keys: string[];
  currentIndex: number;
  model?: GeminiModel | MistralModel | GroqModel; // Track the model for this pool
}

class KeyPoolManager {
  private pools: Map<'gemini' | 'mistral' | 'groq', KeyPool> = new Map();
  private initialized: boolean = false;
  private exhaustedKeys: Set<string> = new Set(); // Track exhausted keys (format: "provider:key")

  /**
   * Initialize the key pool for a provider
   * Validates that all selected keys use the same model (model is provider-level, so this is always true)
   */
  async initialize(provider: 'gemini' | 'mistral' | 'groq'): Promise<{ success: boolean; error?: string; model?: GeminiModel | MistralModel | GroqModel }> {
    try {
      const enc = await getDecryptedJSON<{
        geminiKeys?: StoredKey[];
        mistralKeys?: StoredKey[];
        groqKeys?: StoredKey[];
        geminiModel?: GeminiModel;
        mistralModel?: MistralModel;
        groqModel?: GroqModel;
      }>('smg_keys_enc', null as any);

      const keys = provider === 'gemini' 
        ? (enc?.geminiKeys || [])
        : provider === 'groq'
        ? (enc?.groqKeys || [])
        : (enc?.mistralKeys || []);

      // Extract valid keys (non-empty, trimmed, enabled for parallel)
      const validKeys = keys
        .filter(k => 
          k.key && 
          k.key.trim().length > 0 && 
          k.enabledForParallel !== false // Only keys selected for parallel
        )
        .map(k => k.key.trim());

      // For Groq parallel mode, cap to a maximum of 5 keys to avoid
      // spawning too many workers and hitting rate limits too aggressively.
      const effectiveKeys =
        provider === 'groq'
          ? validKeys.slice(0, 5)
          : validKeys;

      if (effectiveKeys.length === 0) {
        console.warn(`⚠ No valid ${provider} keys found in storage`);
        this.pools.set(provider, { keys: [], currentIndex: 0 });
        return { success: false, error: `No keys selected for parallel generation` };
      }

      // Get the model for this provider (model selection is provider-level)
      const model = provider === 'gemini' 
        ? (enc?.geminiModel || 'gemini-2.5-flash')
        : provider === 'groq'
        ? (enc?.groqModel === 'meta-llama/llama-4-maverick-17b-128e-instruct'
            ? enc.groqModel
            : 'meta-llama/llama-4-maverick-17b-128e-instruct')
        : (enc?.mistralModel || 'mistral-small-latest');

      // Shuffle keys to distribute load evenly (not always same order)
      const shuffled = this.shuffleArray([...effectiveKeys]);
      
      this.pools.set(provider, {
        keys: shuffled,
        currentIndex: 0,
        model: model as GeminiModel | MistralModel | GroqModel
      });

      console.log(`✅ Initialized ${provider} key pool with ${shuffled.length} key(s), model: ${model}`);
      return { success: true, model: model as GeminiModel | MistralModel | GroqModel };
    } catch (error) {
      console.error(`❌ Error initializing ${provider} key pool:`, error);
      this.pools.set(provider, { keys: [], currentIndex: 0 });
      return { success: false, error: `Failed to initialize key pool: ${error}` };
    }
  }

  /**
   * Get the model for a provider's key pool
   */
  getModel(provider: 'gemini' | 'mistral' | 'groq'): GeminiModel | MistralModel | GroqModel | undefined {
    const pool = this.pools.get(provider);
    return pool?.model;
  }

  /**
   * Get the next available key from the pool (round-robin)
   * Returns undefined if no keys available
   */
  getNextKey(provider: 'gemini' | 'mistral' | 'groq'): string | undefined {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) {
      return undefined;
    }

    const key = pool.keys[pool.currentIndex];
    pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
    
    return key;
  }

  /**
   * Get a specific key by index (for assigning to workers)
   * Returns undefined if index is out of bounds
   */
  getKeyByIndex(provider: 'gemini' | 'mistral' | 'groq', index: number): string | undefined {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) {
      return undefined;
    }

    const actualIndex = index % pool.keys.length;
    return pool.keys[actualIndex];
  }

  /**
   * Get all available keys (for debugging/info)
   */
  getAllKeys(provider: 'gemini' | 'mistral' | 'groq'): string[] {
    const pool = this.pools.get(provider);
    return pool ? [...pool.keys] : [];
  }

  /**
   * Get the number of available keys
   */
  getKeyCount(provider: 'gemini' | 'mistral' | 'groq'): number {
    const pool = this.pools.get(provider);
    return pool ? pool.keys.length : 0;
  }

  /**
   * Mark a key as exhausted (quota exceeded)
   */
  markKeyExhausted(provider: 'gemini' | 'mistral' | 'groq', key: string): void {
    const keyId = `${provider}:${key}`;
    this.exhaustedKeys.add(keyId);
    console.warn(`⚠️ Marked ${provider} key ${key.substring(0, 8)}... as exhausted`);
  }

  /**
   * Check if a key is exhausted
   */
  isKeyExhausted(provider: 'gemini' | 'mistral' | 'groq', key: string): boolean {
    const keyId = `${provider}:${key}`;
    return this.exhaustedKeys.has(keyId);
  }

  /**
   * Get the number of available (non-exhausted) keys
   */
  getAvailableKeyCount(provider: 'gemini' | 'mistral' | 'groq'): number {
    const pool = this.pools.get(provider);
    if (!pool || pool.keys.length === 0) return 0;
    
    return pool.keys.filter(key => !this.isKeyExhausted(provider, key)).length;
  }

  /**
   * Reset exhausted keys (call when starting new generation)
   */
  resetExhaustedKeys(): void {
    this.exhaustedKeys.clear();
    console.log('🔄 Reset exhausted keys - fresh start for new generation');
  }

  /**
   * Shuffle array to randomize key order
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Reset the pool (reload from storage)
   */
  async reset(provider: 'gemini' | 'mistral' | 'groq'): Promise<void> {
    await this.initialize(provider);
  }
}

// Singleton instance
export const keyPoolManager = new KeyPoolManager();

