'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import APIControls from '@/components/APIControls';
import AdvancedMetadataControls from '@/components/AdvancedMetadataControls';
import FileDrop from '@/components/FileDrop';
import ResultTable from '@/components/ResultTable';
import ErrorToastComponent, { type ErrorToast } from '@/components/ErrorToast';
import Analytics from '@/components/Analytics';
import CompletionModal, { type CompletionStats } from '@/components/CompletionModal';
import { toCSV, toPromptCSV } from '@/lib/csv';
import { getJSON, setJSON, getDecryptedJSON } from '@/lib/util';
import { trackEvent } from '@/lib/analytics';
import { scoreTitleQuality } from '@/lib/util';
import { getSmartDefaults } from '@/lib/smart-defaults';
import type { Row } from '@/lib/csv';
import type { FormState } from '@/lib/types';
import { fileToBase64WithCompression, isImageFile, isVideoFile } from '@/lib/client-file-util';
import { retrySSEClient } from '@/lib/retry-sse';
import { useAuth } from '@/contexts/AuthContext';
import { keyPoolManager } from '@/lib/key-pool';

type UploadItem = { 
  name: string; 
  url: string; 
  size: number; 
  originalSize?: number; 
  type: string; 
  ext: string;
  file?: File; // File object for client-side storage
  base64?: string; // Optional base64 data (lazy loaded)
};

// Estimate the byte size of a base64 data URL (compressed image/frame sent to the AI)
function estimateDataUrlByteSize(dataUrl: string): number {
  if (!dataUrl) return 0;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export default function Page() {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const shouldStopRef = useRef(false); // Use ref instead of state for synchronous access
  const [generatingFiles, setGeneratingFiles] = useState<Set<string>>(new Set());
  const [retryingFiles, setRetryingFiles] = useState<Map<string, { attempt: number; maxAttempts: number; errorType?: string }>>(new Map());
  const [fileToWorkerId, setFileToWorkerId] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<ErrorToast | null>(null);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [completionStats, setCompletionStats] = useState<CompletionStats | null>(null);

  // Feature flag: Mistral is temporarily disabled (paid service)
  // Keep this constant outside hooks so dependencies don't change.
  const MISTRAL_ENABLED = false;

  const [form, setForm] = useState<FormState>({
    uiTab: 'metadata',
    platform: 'adobe' as 'general' | 'adobe' | 'shutterstock',
    model: { provider: 'groq' as 'gemini' | 'mistral' | 'groq', preview: false },
    geminiModel: 'gemini-2.5-flash' as 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | undefined,
    mistralModel: undefined as 'mistral-small-latest' | 'mistral-medium-latest' | 'mistral-large-latest' | undefined,
    groqModel: 'meta-llama/llama-4-scout-17b-16e-instruct' as
      | 'meta-llama/llama-4-maverick-17b-128e-instruct'
      | 'meta-llama/llama-4-scout-17b-16e-instruct'
      | undefined,
    titleLen: 70, // Adobe Stock requirement: 70 chars max
    descLen: 150 as 150,
    keywordMode: 'fixed' as 'auto' | 'fixed',
    keywordCount: 30,
    assetType: 'auto' as 'auto' | 'photo' | 'illustration' | 'vector' | '3d' | 'icon' | 'video',
    prefix: '',
    suffix: '',
    negativeTitle: [] as string[],
    negativeKeywords: [] as string[],
    singleMode: false,
    parallelMode: false,
    videoHints: { style: [] as string[], tech: [] as string[] },
    isolatedOnTransparentBackground: false,
    isolatedOnWhiteBackground: false,
    isVector: false,
    isIllustration: false
  });

  const bearerRef = useRef<string>('');
  const { user } = useAuth();

  // Detect when PNG files are present without an explicit background toggle,
  // so we can gently remind the user to set "isolated on transparent background".
  const showTransparentPngHint = useMemo(
    () =>
      files.some((f) => f.ext?.toLowerCase() === 'png') &&
      !form.isolatedOnTransparentBackground &&
      !form.isolatedOnWhiteBackground,
    [files, form.isolatedOnTransparentBackground, form.isolatedOnWhiteBackground]
  );

  // Helper function to track generation in Firestore
  const trackGenerationInFirestore = async (fileCount: number) => {
    if (!user || fileCount === 0) return;
    
    try {
      // Dynamically import Firestore utilities (client-side only)
      const { trackGeneration, initializeUser } = await import('@/lib/firestore');
      
      const displayName = user.displayName || user.email?.split('@')[0] || 'User';
      const email = user.email || '';
      const photoURL = user.photoURL || undefined;
      
      // Initialize/update user document
      await initializeUser(user.uid, displayName, email, photoURL);
      
      // Track generation
      await trackGeneration(user.uid, fileCount, displayName, email, photoURL);
      
      console.log(`✅ Tracked ${fileCount} generation(s) for user ${user.uid}`);
    } catch (e: any) {
      console.error('❌ Failed to track generation:', e);
      console.error('Error details:', {
        message: e.message,
        code: e.code,
        stack: e.stack
      });
    }
  };
  
  // Wrapper function to ensure all required fields are present when updating form
  const handleFormChange = useCallback((newForm: FormState | ((prev: FormState) => FormState)) => {
    if (typeof newForm === 'function') {
      setForm(prev => {
        const updated = newForm(prev);
        // Ensure singleMode and parallelMode are mutually exclusive
        const singleMode = updated.singleMode ?? prev.singleMode;
        const parallelMode = singleMode ? false : (updated.parallelMode ?? prev.parallelMode);
        return {
          ...prev,
          ...updated,
          // Preserve uiTab from previous state or updated value
          uiTab: updated.uiTab ?? prev.uiTab,
          // Explicitly preserve model fields to ensure they're not lost during state updates
          geminiModel: updated.geminiModel !== undefined ? updated.geminiModel : prev.geminiModel,
          mistralModel: updated.mistralModel !== undefined ? updated.mistralModel : prev.mistralModel,
          groqModel: updated.groqModel !== undefined ? updated.groqModel : prev.groqModel,
          model: {
            ...prev.model,
            ...updated.model,
            preview: updated.model.preview ?? prev.model.preview ?? false
          },
          videoHints: {
            style: updated.videoHints?.style ?? prev.videoHints?.style ?? [],
            tech: updated.videoHints?.tech ?? prev.videoHints?.tech ?? []
          },
          negativeTitle: updated.negativeTitle ?? prev.negativeTitle,
          negativeKeywords: updated.negativeKeywords ?? prev.negativeKeywords,
          isolatedOnTransparentBackground: updated.isolatedOnTransparentBackground ?? prev.isolatedOnTransparentBackground,
          isolatedOnWhiteBackground: updated.isolatedOnWhiteBackground ?? prev.isolatedOnWhiteBackground,
          isVector: updated.isVector ?? prev.isVector,
          isIllustration: updated.isIllustration ?? prev.isIllustration,
          singleMode,
          parallelMode
        };
      });
    } else {
      setForm(prev => {
        // Ensure singleMode and parallelMode are mutually exclusive
        const singleMode = newForm.singleMode ?? prev.singleMode;
        const parallelMode = singleMode ? false : (newForm.parallelMode ?? prev.parallelMode);
        return {
          ...prev,
          ...newForm,
          // Preserve uiTab from previous state or updated value
          uiTab: newForm.uiTab ?? prev.uiTab,
          // Explicitly preserve model fields to ensure they're not lost during state updates
          geminiModel: newForm.geminiModel !== undefined ? newForm.geminiModel : prev.geminiModel,
          mistralModel: newForm.mistralModel !== undefined ? newForm.mistralModel : prev.mistralModel,
          model: {
            ...prev.model,
            ...newForm.model,
            preview: newForm.model.preview ?? prev.model.preview ?? false
          },
          videoHints: {
            style: newForm.videoHints?.style ?? prev.videoHints?.style ?? [],
            tech: newForm.videoHints?.tech ?? prev.videoHints?.tech ?? []
          },
          negativeTitle: newForm.negativeTitle ?? prev.negativeTitle,
          negativeKeywords: newForm.negativeKeywords ?? prev.negativeKeywords,
          isolatedOnTransparentBackground: newForm.isolatedOnTransparentBackground ?? prev.isolatedOnTransparentBackground,
          isolatedOnWhiteBackground: newForm.isolatedOnWhiteBackground ?? prev.isolatedOnWhiteBackground,
          isVector: newForm.isVector ?? prev.isVector,
          isIllustration: newForm.isIllustration ?? prev.isIllustration,
          singleMode,
          parallelMode
        };
      });
    }
  }, []);
  
  // Load bearer token and model preferences based on current provider
  const updateBearerToken = useCallback(async () => {
    try {
      const enc = await getDecryptedJSON<{ 
        geminiKeys?: Array<{ id: string; key: string; visible: boolean }>;
        mistralKeys?: Array<{ id: string; key: string; visible: boolean }>;
        groqKeys?: Array<{ id: string; key: string; visible: boolean }>;
        active?: 'gemini'|'mistral'|'groq';
        activeKeyId?: string;
        bearer?: string;
        geminiModel?: string;
        mistralModel?: string;
        groqModel?: string;
      }>('smg_keys_enc', null as any);
      
      if (!enc) {
        bearerRef.current = '';
        console.warn('⚠ No encrypted keys found in storage');
        return;
      }
      
      // ALWAYS load model preferences FIRST (before key loading, so it runs even if key is found)
      if (enc.geminiModel) {
        handleFormChange(prev => ({ ...prev, geminiModel: enc.geminiModel as any }));
        console.log(`✅ Loaded Gemini model preference: ${enc.geminiModel}`);
      }
      if (enc.mistralModel && MISTRAL_ENABLED) {
        handleFormChange(prev => ({ ...prev, mistralModel: enc.mistralModel as any }));
        console.log(`✅ Loaded Mistral model preference: ${enc.mistralModel}`);
      }
      if (enc.groqModel) {
        handleFormChange(prev => ({ ...prev, groqModel: enc.groqModel as any }));
        console.log(`✅ Loaded Groq model preference: ${enc.groqModel}`);
      }
      
      // Use the current provider from form state, not stored active
      const currentProvider = form.model.provider;
      const keys = currentProvider === 'gemini' ? enc.geminiKeys : currentProvider === 'groq' ? enc.groqKeys : enc.mistralKeys;
      const activeKeyId = enc.activeKeyId;
      
      // Try to find the active key for current provider
      if (activeKeyId && keys && keys.length > 0) {
        const activeKey = keys.find(k => k.id === activeKeyId);
        if (activeKey && activeKey.key && activeKey.key.trim().length > 0) {
          bearerRef.current = activeKey.key.trim();
          console.log(`🔑 Loaded ${currentProvider} API key from stored keys (length: ${activeKey.key.length})`);
          return;
        }
      }
      
      // Fallback: use bearer if it matches current provider
      if (enc.bearer && enc.bearer.trim().length > 0 && enc.active === currentProvider) {
        bearerRef.current = enc.bearer.trim();
        console.log(`🔑 Loaded ${currentProvider} API key from bearer (length: ${enc.bearer.length})`);
        return;
      }
      
      // Last resort: use first available key for current provider
      if (keys && keys.length > 0) {
        const firstKey = keys.find(k => k.key && k.key.trim().length > 0);
        if (firstKey) {
          bearerRef.current = firstKey.key.trim();
          console.log(`🔑 Loaded ${currentProvider} API key from first available key (length: ${firstKey.key.length})`);
          return;
        }
      }
      
      bearerRef.current = '';
      console.warn(`⚠ No ${currentProvider} API key found in storage`);
    } catch (error) {
      console.error('❌ Error loading bearer token:', error);
      bearerRef.current = '';
    }
  }, [form.model.provider, handleFormChange, MISTRAL_ENABLED]);
  
  // Load bearer token on mount and when provider changes
  useEffect(() => {
    updateBearerToken();
  }, [updateBearerToken]);
  
  // Force provider to Gemini if Mistral is disabled
  useEffect(() => {
    if (!MISTRAL_ENABLED && form.model.provider === 'mistral') {
      handleFormChange(prev => ({ 
        ...prev, 
        model: { ...prev.model, provider: 'gemini' } 
      }));
    }
  }, [form.model.provider, handleFormChange, MISTRAL_ENABLED]);
  
  // Listen for model preference changes (from Header's KeyModal or other sources)
  useEffect(() => {
    const handleModelChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ provider: 'gemini' | 'mistral' | 'groq'; model: any }>;
      const { provider, model } = customEvent.detail;
      console.log(`📢 Received modelPreferenceChanged event: ${provider} -> ${model}`);
      
      // Handle async work without making the handler async
      void (async () => {
        try {
          // Reload from storage to get the latest value
          const enc = await getDecryptedJSON<{ 
            geminiModel?: string;
            mistralModel?: string;
            groqModel?: string;
          }>('smg_keys_enc', null as any);
          
          if (enc) {
            if (provider === 'gemini' && enc.geminiModel && form.geminiModel !== enc.geminiModel) {
              console.log(`🔄 Updating geminiModel from event: ${form.geminiModel} -> ${enc.geminiModel}`);
              handleFormChange(prev => ({ ...prev, geminiModel: enc.geminiModel as any }));
            } else if (provider === 'groq' && enc.groqModel && form.groqModel !== enc.groqModel) {
              console.log(`🔄 Updating groqModel from event: ${form.groqModel} -> ${enc.groqModel}`);
              handleFormChange(prev => ({ ...prev, groqModel: enc.groqModel as any }));
            } else if (provider === 'mistral' && MISTRAL_ENABLED && enc.mistralModel && form.mistralModel !== enc.mistralModel) {
              console.log(`🔄 Updating mistralModel from event: ${form.mistralModel} -> ${enc.mistralModel}`);
              handleFormChange(prev => ({ ...prev, mistralModel: enc.mistralModel as any }));
            }
          }
        } catch (error) {
          console.error('Failed to update model from event:', error);
        }
      })();
    };
    
    // Listen for custom event
    window.addEventListener('modelPreferenceChanged', handleModelChange);
    
    // Also listen for storage events (cross-tab/window)
    const handleStorageChange = async () => {
      try {
        const enc = await getDecryptedJSON<{ 
          geminiModel?: string;
          mistralModel?: string;
          groqModel?: string;
        }>('smg_keys_enc', null as any);
        if (enc) {
          if (enc.geminiModel && form.geminiModel !== enc.geminiModel) {
            console.log(`🔄 Storage event: Updating geminiModel to ${enc.geminiModel}`);
            handleFormChange(prev => ({ ...prev, geminiModel: enc.geminiModel as any }));
          }
          if (enc.groqModel && form.groqModel !== enc.groqModel) {
            console.log(`🔄 Storage event: Updating groqModel to ${enc.groqModel}`);
            handleFormChange(prev => ({ ...prev, groqModel: enc.groqModel as any }));
          }
          if (enc.mistralModel && MISTRAL_ENABLED && form.mistralModel !== enc.mistralModel) {
            console.log(`🔄 Storage event: Updating mistralModel to ${enc.mistralModel}`);
            handleFormChange(prev => ({ ...prev, mistralModel: enc.mistralModel as any }));
          }
        }
      } catch (error) {
        console.error('Failed to check storage for model changes:', error);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('modelPreferenceChanged', handleModelChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [form.geminiModel, form.mistralModel, form.groqModel, handleFormChange, MISTRAL_ENABLED]);

  // Reset progress-related state when files are cleared
  useEffect(() => {
    if (files.length === 0) {
      setProcessingProgress(0);
      setSuccessCount(0);
      setFailedCount(0);
      setRows([]);
      setGeneratingFiles(new Set());
      setRetryingFiles(new Map());
      setFileToWorkerId(new Map());
      setBusy(false);
      setCompletionModalOpen(false);
      setCompletionStats(null);
    }
  }, [files.length]);

  // Server rehydration removed - files are now stored client-side only

  const onExportCSV = () => {
    const isPromptMode = form.uiTab === 'prompt';
    
    if (isPromptMode) {
      const csv = toPromptCSV(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ImagePrompts.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else {
      const csv = toCSV(rows, form.titleLen, form.descLen, form.keywordCount, form.platform);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename =
        form.platform === 'adobe'
          ? 'StockCSV_Adobe.csv'
          : form.platform === 'shutterstock'
            ? 'StockCSV_ShutterStock.csv'
            : 'StockCSV_Gen.csv';
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  };

  const onExportZIP = async () => {
    // ZIP export is only available in metadata mode
    if (form.uiTab === 'prompt') {
      setError({
        id: Date.now().toString(),
        message: 'ZIP export is only available in Metadata mode.',
        severity: 'info',
        duration: 3000
      });
      return;
    }
    
    try {
      // Filter out rows with errors
      const validRows = rows.filter(r => !r.error);

      if (validRows.length === 0) {
        setError({
          id: Date.now().toString(),
          message: 'No completed metadata found. Generate metadata first before exporting.',
          severity: 'warning',
          duration: 5000
        });
        return;
      }

      // Dynamically import JSZip to avoid SSR issues
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Define all target formats to generate CSVs for
      const targetFormats: Array<{ ext: string; fileName: string }> = [
        { ext: 'jpg', fileName: 'metadata-jpg.csv' },
        { ext: 'png', fileName: 'metadata-png.csv' },
        { ext: 'svg', fileName: 'metadata-svg.csv' },
        { ext: 'eps', fileName: 'metadata-eps.csv' },
        { ext: 'ai', fileName: 'metadata-ai.csv' },
        { ext: 'webp', fileName: 'metadata-webp.csv' },
        { ext: 'mp4', fileName: 'metadata-video.csv' }
      ];

      // For each target format, create a CSV with ALL rows (filename changed to that format)
      for (const format of targetFormats) {
        const rowsForFormat = validRows.map(r => {
          // Get base filename without extension
          const baseName = r.filename.replace(/\.[^.]+$/, '');
          return {
            ...r,
            filename: `${baseName}.${format.ext}`,
            extension: format.ext
          };
        });

        const csv = toCSV(rowsForFormat, form.titleLen, form.descLen, form.keywordCount, 'general');
        zip.file(format.fileName, csv);
      }

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stock-metadata-multi-csv.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export ZIP:', error);
      setError({
        id: Date.now().toString(),
        message: 'Failed to create ZIP file. Please try again.',
        severity: 'error',
        duration: 5000
      });
    }
  };

  // Maximum number of concurrent workers for parallel generation
  const MAX_CONCURRENT_WORKERS = 5;

  // Helper function to process a single file
  const processFile = async (
    fileIndex: number,
    allRows: Row[],
    completedCountRef: { current: number },
    unsubscribeCallbacks: Map<string, () => void>,
    assignedKey?: string, // Optional: specific API key for this worker
    workerId?: number // Optional: worker ID for parallel mode (0-indexed)
  ): Promise<void> => {
    if (shouldStopRef.current) {
      return;
    }

    const file = files[fileIndex];
    
    // Mark file as generating
    setGeneratingFiles(prev => new Set(prev).add(file.name));
    
    // Track which worker (API) is processing this file
    if (workerId !== undefined) {
      setFileToWorkerId(prev => {
        const next = new Map(prev);
        next.set(file.name, workerId);
        return next;
      });
    }
    
    // Subscribe to retry events for this file
    const unsubscribe = retrySSEClient.subscribe(file.name, (event) => {
      if (event.type === 'retry-event') {
        setRetryingFiles(prev => {
          const next = new Map(prev);

          if (event.status === 'retrying') {
            next.set(file.name, {
              attempt: event.attempt,
              maxAttempts: event.maxAttempts,
              errorType: event.errorType
            });
          } else {
            // On success or failure, clear retry state for this file
            next.delete(file.name);
          }

          return next;
        });
      }
    });
    unsubscribeCallbacks.set(file.name, unsubscribe);

    try {
      // Convert file to base64 if it's an image (lazy conversion)
      let imageData: string | undefined;
      
      if (file.file && (isImageFile(file.file) || isVideoFile(file.file))) {
        try {
          imageData = await fileToBase64WithCompression(file.file, true);
          console.log(`✓ Extracted frame/image data for ${file.name}`);
          
          // Estimate compressed byte size from data URL and update file list
          const compressedBytes = estimateDataUrlByteSize(imageData);
          const originalFileSize = file.file?.size;
          if (compressedBytes > 0 && originalFileSize && compressedBytes < originalFileSize) {
            const compressionRatio = ((1 - compressedBytes / originalFileSize) * 100).toFixed(1);
            console.log(`📊 Compression for ${file.name}: Original=${originalFileSize} bytes, Compressed=${compressedBytes} bytes (${compressionRatio}% reduction)`);
            setFiles(prev => {
              const updated = prev.map(f =>
                f.name === file.name
                  ? {
                      ...f,
                      // Always use File object's original size to ensure accuracy
                      originalSize: originalFileSize,
                      size: compressedBytes
                    }
                  : f
              );
              // Debug: verify the update
              const updatedFile = updated.find(f => f.name === file.name);
              if (updatedFile) {
                console.log(`✅ Updated file state: originalSize=${updatedFile.originalSize}, size=${updatedFile.size}, will show: ${updatedFile.originalSize !== updatedFile.size}`);
              }
              return updated;
            });
          } else {
            console.warn(`⚠️ Compression update skipped for ${file.name}: compressedBytes=${compressedBytes}, originalFileSize=${originalFileSize}, compressedBytes < originalFileSize=${compressedBytes < (originalFileSize || 0)}`);
          }
        } catch (error) {
          console.warn(`Failed to convert ${isVideoFile(file.file) ? 'video frame' : 'image'} to base64 for ${file.name}:`, error);
          // For videos, continue without imageData (fallback to filename-based)
        }
      }
      
      // Detect mode: prompt or metadata
      const isPromptMode = form.uiTab === 'prompt';
      
      // Build request payload based on mode
      const requestPayload = isPromptMode ? {
        // Prompt generation payload
        imageData: imageData,
        imageUrl: undefined, // Not using URL for now
        platform: form.platform,
        assetType: form.assetType === 'auto' ? 'image' : form.assetType === 'video' ? 'video' : 'image',
        minWords: 160,
        stylePolicy: 'microstock-safe',
        negativePolicy: 'no text, no logo, no watermark',
        provider: form.model.provider,
        geminiModel: form.geminiModel,
        groqModel: form.groqModel,
        visionBearer: bearerRef.current // For Gemini/Mistral 2-step pipeline
      } : {
        // Existing metadata generation payload
        platform: form.platform,
        titleLen: form.titleLen,
        descLen: 150,
        keywordMode: form.keywordMode,
        keywordCount: form.keywordCount,
        assetType: form.assetType,
        prefix: form.prefix || undefined,
        suffix: form.suffix || undefined,
        negativeTitle: form.negativeTitle,
        negativeKeywords: form.negativeKeywords,
        model: { provider: form.model.provider, preview: form.model.preview },
        geminiModel: form.geminiModel,
        mistralModel: form.mistralModel,
        groqModel: form.groqModel,
        files: [file].map(f => ({ 
          name: f.name, 
          type: f.type, 
          url: f.url, 
          ext: f.ext,
          imageData: imageData // Include base64 data for images/videos
        })),
        videoHints: form.assetType === 'video' ? form.videoHints : undefined,
        singleMode: form.singleMode,
        isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
        isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
        isVector: form.isVector,
        isIllustration: form.isIllustration,
        userId: user?.uid,
        userDisplayName: user?.displayName || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || undefined,
        userPhotoURL: user?.photoURL || undefined
      };
      
      console.log(`📤 API Request for ${file.name} (${isPromptMode ? 'PROMPT' : 'METADATA'} mode):`, {
        mode: isPromptMode ? 'prompt' : 'metadata',
        toggleValues: isPromptMode ? {} : {
          isolatedOnTransparentBackground: (requestPayload as any).isolatedOnTransparentBackground,
          isolatedOnWhiteBackground: (requestPayload as any).isolatedOnWhiteBackground,
          isVector: (requestPayload as any).isVector,
          isIllustration: (requestPayload as any).isIllustration
        }
      });
      
      // Use assigned key if provided (for parallel workers), otherwise fall back to bearerRef
      const apiKey = assignedKey || bearerRef.current;
      
      // Route to appropriate API endpoint based on mode
      const apiEndpoint = isPromptMode ? '/api/prompt/image-to-prompt' : '/api/generate';
      
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestPayload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || `Failed to generate metadata for ${file.name}`;
        
        // Check if this is a quota exhaustion error
        const isQuotaExhausted = res.status === 429 && (
          errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('exceeded') ||
          errorMsg.toLowerCase().includes('free_tier') ||
          errorMsg.toLowerCase().includes('rate limit exceeded') ||
          errorData.error?.message?.toLowerCase().includes('quota')
        );
        
        // If quota exhausted and using parallel mode with assigned key, mark it as exhausted
        if (isQuotaExhausted && assignedKey && form.parallelMode && workerId !== undefined) {
          keyPoolManager.markKeyExhausted(form.model.provider, assignedKey);
          const availableKeys = keyPoolManager.getAvailableKeyCount(form.model.provider);
          
          console.warn(`⚠️ Worker ${workerId}: API key exhausted. Stopping this worker. Other workers will continue.`);
          
          // If all keys exhausted, stop all workers
          if (availableKeys === 0) {
            console.error('🛑 All API keys exhausted! Stopping all workers.');
            shouldStopRef.current = true;
            setError({
              id: Date.now().toString(),
              message: 'All API keys have exceeded their quota limits. Generation stopped. Please wait or add more API keys.',
              severity: 'error',
              duration: 10000
            });
          } else {
            console.log(`ℹ️ Worker ${workerId} stopped: API quota exceeded. ${availableKeys} key(s) still available.`);
          }
          
          // Create error row with quota exhaustion message
          const isPromptMode = form.uiTab === 'prompt';
          const errorRow: Row = isPromptMode ? {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: '', // Empty for prompt mode
            description: '', // Empty for prompt mode
            keywords: [], // Empty for prompt mode
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
          } : {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: `[ERROR] API quota exceeded (Worker ${workerId + 1}). Worker stopped.`,
            description: 'API quota exceeded for this key. This worker has stopped. Other workers will continue.',
            keywords: [],
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
          };
          allRows.push(errorRow);
          setRows([...allRows]);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          // Clear worker ID mapping
          setFileToWorkerId(prev => {
            const next = new Map(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          setFailedCount(prev => prev + 1);
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / files.length) * 100));
          return; // Stop this worker from processing more files
        }
        
        // Regular error handling (non-quota errors)
        const isPromptMode = form.uiTab === 'prompt';
        const errorRow: Row = isPromptMode ? {
          filename: file.name,
          platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
          title: '', // Empty for prompt mode
          description: '', // Empty for prompt mode
          keywords: [], // Empty for prompt mode
          assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
          extension: file.ext || '',
          error: errorMsg
        } : {
          filename: file.name,
          platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
          title: `[ERROR] ${errorMsg}`,
          description: 'Generation failed. Please check your API key and try again.',
          keywords: [],
          assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
          extension: file.ext || '',
          error: errorMsg
        };
        allRows.push(errorRow);
        setRows([...allRows]); // Update UI immediately with error
        
        // Remove from generating set
        setGeneratingFiles(prev => {
          const next = new Set(prev);
          next.delete(file.name);
          return next;
        });
        // Clear worker ID mapping
        setFileToWorkerId(prev => {
          const next = new Map(prev);
          next.delete(file.name);
          return next;
        });
        unsubscribe();
        unsubscribeCallbacks.delete(file.name);
        completedCountRef.current++;
        setFailedCount(prev => prev + 1);
        const completed = completedCountRef.current;
        setProcessingProgress(Math.round((completed / files.length) * 100));
        return;
      }
      
      const data = await res.json();
      
      if (isPromptMode) {
        // Handle prompt generation response
        if (data.prompt) {
          const newRow: Row = {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: '', // Empty for prompt mode
            description: '', // Empty for prompt mode
            keywords: [], // Empty for prompt mode
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            generatedPrompt: data.prompt, // Store the generated prompt
            negativePrompt: data.negative_prompt, // Store negative prompt (optional)
            error: data.error
          };
          allRows.push(newRow);
          // Update UI immediately after each generation
          setRows([...allRows]);
          
          // Track generation
          await trackGenerationInFirestore(1);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          // Clear worker ID mapping
          setFileToWorkerId(prev => {
            const next = new Map(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          // Only count as success if there's no error
          if (!newRow.error) {
            setSuccessCount(prev => prev + 1);
          } else {
            setFailedCount(prev => prev + 1);
          }
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / files.length) * 100));
        } else if (data.error) {
          // Handle prompt generation error
          const errorRow: Row = {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: `[ERROR] ${data.error}`,
            description: 'Prompt generation failed. Please check your API key and try again.',
            keywords: [],
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            error: data.error
          };
          allRows.push(errorRow);
          setRows([...allRows]);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          // Clear worker ID mapping
          setFileToWorkerId(prev => {
            const next = new Map(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          setFailedCount(prev => prev + 1);
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / files.length) * 100));
        }
      } else {
        // Existing metadata handling
        if (data.rows && data.rows.length > 0) {
          const newRow = data.rows[0];
          allRows.push(newRow);
          // Update UI immediately after each generation
          setRows([...allRows]);
          
          // Track generation
          await trackGenerationInFirestore(data.rows.length);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          // Clear worker ID mapping
          setFileToWorkerId(prev => {
            const next = new Map(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          // Only count as success if there's no error
          if (!newRow.error) {
            setSuccessCount(prev => prev + 1);
          } else {
            setFailedCount(prev => prev + 1);
          }
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / files.length) * 100));
        }
      }
    } catch (fileError: any) {
      unsubscribe();
      unsubscribeCallbacks.delete(file.name);
      console.error(`Error processing ${file.name}:`, fileError);
      
      // Check if this is a quota exhaustion error in the catch block
      const errorMsg = fileError.message || 'Unknown error';
      const isQuotaExhausted = fileError?.status === 429 && (
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('exceeded') ||
        errorMsg.toLowerCase().includes('free_tier') ||
        errorMsg.toLowerCase().includes('rate limit exceeded')
      );
      
      // If quota exhausted and using parallel mode with assigned key, mark it as exhausted
      if (isQuotaExhausted && assignedKey && form.parallelMode && workerId !== undefined) {
        keyPoolManager.markKeyExhausted(form.model.provider, assignedKey);
        const availableKeys = keyPoolManager.getAvailableKeyCount(form.model.provider);
        
        console.warn(`⚠️ Worker ${workerId}: API key exhausted (from catch). Stopping this worker. Other workers will continue.`);
        
        // If all keys exhausted, stop all workers
        if (availableKeys === 0) {
          console.error('🛑 All API keys exhausted! Stopping all workers.');
          shouldStopRef.current = true;
          setError({
            id: Date.now().toString(),
            message: 'All API keys have exceeded their quota limits. Generation stopped. Please wait or add more API keys.',
            severity: 'error',
            duration: 10000
          });
        } else {
          console.log(`ℹ️ Worker ${workerId} stopped: API quota exceeded. ${availableKeys} key(s) still available.`);
        }
        
        // Create error row with quota exhaustion message
        const isPromptMode = form.uiTab === 'prompt';
        const errorRow: Row = isPromptMode ? {
          filename: file.name,
          platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
          title: '', // Empty for prompt mode
          description: '', // Empty for prompt mode
          keywords: [], // Empty for prompt mode
          assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
          extension: file.ext || '',
          error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
        } : {
          filename: file.name,
          platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
          title: `[ERROR] API quota exceeded (Worker ${workerId + 1}). Worker stopped.`,
          description: 'API quota exceeded for this key. This worker has stopped. Other workers will continue.',
          keywords: [],
          assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
          extension: file.ext || '',
          error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
        };
        allRows.push(errorRow);
        setRows([...allRows]);
        
        // Remove from generating set
        setGeneratingFiles(prev => {
          const next = new Set(prev);
          next.delete(file.name);
          return next;
        });
        // Clear worker ID mapping
        setFileToWorkerId(prev => {
          const next = new Map(prev);
          next.delete(file.name);
          return next;
        });
        completedCountRef.current++;
        setFailedCount(prev => prev + 1);
        const completed = completedCountRef.current;
        setProcessingProgress(Math.round((completed / files.length) * 100));
        return; // Stop this worker from processing more files
      }
      
      // Regular error handling (non-quota errors)
      const errorRow: Row = {
        filename: file.name,
        platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
        title: `[ERROR] ${errorMsg}`,
        description: 'Generation failed. Please check your API key and try again.',
        keywords: [],
        assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
        extension: file.ext || '',
        error: errorMsg
      };
      allRows.push(errorRow);
      setRows([...allRows]); // Update UI immediately with error
      
      // Remove from generating set
      setGeneratingFiles(prev => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
      // Clear worker ID mapping
      setFileToWorkerId(prev => {
        const next = new Map(prev);
        next.delete(file.name);
        return next;
      });
      completedCountRef.current++;
      setFailedCount(prev => prev + 1);
      const completed = completedCountRef.current;
      setProcessingProgress(Math.round((completed / files.length) * 100));
    }
  };

  const onGenerateAll = async () => {
    if (!files.length) return;
    
    // Validate that prompt mode has image/video files
    if (form.uiTab === 'prompt') {
      const hasImageOrVideo = files.some(f => f.file && (isImageFile(f.file) || isVideoFile(f.file)));
      if (!hasImageOrVideo) {
        setError({
          id: Date.now().toString(),
          message: 'Image to Prompt mode requires image or video files. Please upload images/videos or switch to Metadata mode.',
          severity: 'warning',
          duration: 5000
        });
        return;
      }
    }
    
    // Reset exhausted keys when starting fresh generation
    if (form.parallelMode) {
      keyPoolManager.resetExhaustedKeys();
    }
    
    // Ensure bearer token is loaded before starting
    await updateBearerToken();
    
    // Check if bearer token is available
    if (!bearerRef.current || bearerRef.current.length === 0) {
      setError({
        id: Date.now().toString(),
        message: `No API key found for ${form.model.provider}. Please add an API key in the "API Secrets" modal.`,
        severity: 'error',
        duration: 7000
      });
      return;
    }
    
    // Track start time for completion modal
    const startTime = Date.now();
    
    setBusy(true);
    shouldStopRef.current = false; // Reset stop flag
    setProcessingProgress(0);
    setSuccessCount(0);
    setFailedCount(0);
    setCompletionModalOpen(false); // Close any existing modal
    // Don't clear rows - preserve existing results and only update as new ones come in
    
    try {
      const allRows: Row[] = [];
      const completedCountRef = { current: 0 };
      const unsubscribeCallbacks = new Map<string, () => void>();
      
      if (form.singleMode) {
        // Single mode: Process one file at a time and show results immediately
        for (let i = 0; i < files.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Generation stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            setFileToWorkerId(new Map());
            // Clean up all subscriptions
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await processFile(i, allRows, completedCountRef, unsubscribeCallbacks);
        }
      } else if (form.parallelMode) {
        // Parallel mode: Use worker queue to process multiple files concurrently
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        // Initialize key pool for the current provider
        const initResult = await keyPoolManager.initialize(form.model.provider);
        const availableKeys = keyPoolManager.getKeyCount(form.model.provider);
        
        if (!initResult.success || availableKeys === 0) {
          setError({
            id: Date.now().toString(),
            message: initResult.error || `No keys selected for parallel generation. Please select keys in the "API Secrets" modal.`,
            severity: 'error',
            duration: 7000
          });
          setBusy(false);
          return;
        }
        
        const selectedModel = keyPoolManager.getModel(form.model.provider);
        console.log(`🔑 Parallel mode: Using ${availableKeys} selected key(s) for ${form.model.provider}, model: ${selectedModel}`);
        
        let currentIndex = 0;
        const total = files.length;
        
        // Worker function that processes files from the queue
        // Each worker gets assigned a unique API key from the pool
        const worker = async (workerId: number) => {
          // Get assigned key for this worker (round-robin distribution)
          const assignedKey = keyPoolManager.getKeyByIndex(form.model.provider, workerId);
          
          if (!assignedKey) {
            console.error(`❌ Worker ${workerId}: No API key available`);
            return;
          }
          
          console.log(`👷 Worker ${workerId}: Assigned API key ${assignedKey.substring(0, 8)}...`);
          
          while (true) {
            if (shouldStopRef.current) {
              console.log(`🛑 Worker ${workerId}: Stopped by user or all keys exhausted`);
              break;
            }
            
            // Check if assigned key is exhausted before processing each file
            if (keyPoolManager.isKeyExhausted(form.model.provider, assignedKey)) {
              console.warn(`⚠️ Worker ${workerId}: Assigned key exhausted, stopping this worker`);
              break; // This worker stops completely - don't try to get another key
            }
            
            const myIndex = currentIndex++;
            if (myIndex >= total) {
              break; // Queue empty, this worker stops
            }
            
            await processFile(myIndex, allRows, completedCountRef, unsubscribeCallbacks, assignedKey, workerId);
          }
        };
        
        // Start workers in parallel, each with its own API key
        // For Groq, allow parallel workers (up to 5) so multiple accounts/orgs can be used
        const maxGroqWorkers = 5;
        const numWorkers =
          form.model.provider === 'groq'
            ? Math.min(maxGroqWorkers, MAX_CONCURRENT_WORKERS, files.length, availableKeys)
            : Math.min(MAX_CONCURRENT_WORKERS, files.length, availableKeys);
        console.log(`⚡ Starting ${numWorkers} parallel workers with ${availableKeys} selected key(s) for provider ${form.model.provider}`);
        
        await Promise.all(
          Array.from({ length: numWorkers }, (_, i) => worker(i))
        );
        
        // If stopped early, clean up remaining subscriptions
        if (shouldStopRef.current) {
          console.log('🛑 Generation stopped by user');
          unsubscribeCallbacks.forEach(unsub => unsub());
        }
      } else {
        // Default sequential mode: Process files one-by-one
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        // Log bearer token status for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Generate request - Provider: ${form.model.provider}, Bearer token: ${bearerRef.current ? 'YES' : 'NO'}, Length: ${bearerRef.current.length}`);
        }
        
        for (let i = 0; i < files.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Generation stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            setFileToWorkerId(new Map());
            // Clean up all subscriptions
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await processFile(i, allRows, completedCountRef, unsubscribeCallbacks);
        }
      }
      
      // Clean up any remaining subscriptions
      unsubscribeCallbacks.forEach(unsub => unsub());
      
      // Final update with all rows (in case any were missed)
      setRows(allRows);
      setProcessingProgress(100);
      setGeneratingFiles(new Set()); // Clear all generating files
      setFileToWorkerId(new Map()); // Clear worker ID mappings
      
      // Calculate completion stats
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      const successCount = allRows.filter((r: Row) => !r.error).length;
      const errorCount = allRows.length - successCount;
      
      // Calculate average quality score
      const qualityScores = allRows
        .filter((r: Row) => !r.error && r.title)
        .map((r: Row) => scoreTitleQuality(r.title || '', r.filename || '', form.titleLen, true, form.platform).score);
      const avgQuality = qualityScores.length > 0 
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
        : undefined;
      
      // Track analytics
      if (allRows.length > 0) {
        const avgTitleLength = allRows
          .filter((r: Row) => !r.error && r.title)
          .reduce((sum: number, r: Row) => sum + (r.title?.length || 0), 0) / successCount || 0;
        const avgKeywordCount = allRows
          .filter((r: Row) => !r.error && r.keywords)
          .reduce((sum: number, r: Row) => sum + (r.keywords?.length || 0), 0) / successCount || 0;
        
        trackEvent({
          type: 'generation',
          data: {
            platform: form.platform,
            fileCount: files.length,
            successCount,
            errorCount,
            avgQualityScore: avgQuality || 0,
            avgTitleLength: Math.round(avgTitleLength),
            avgKeywordCount: Math.round(avgKeywordCount),
            model: form.model.provider
          }
        });
      }
      
      // Show completion modal only if generation completed (not stopped early)
      if (!shouldStopRef.current && allRows.length > 0) {
        const platformName = form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock';
        
        // Get model display name from selected model
        let modelName: string;
        if (form.model.provider === 'gemini') {
          if (form.geminiModel) {
            // Map internal model names to user-friendly display names
            const modelMap: Record<string, string> = {
              'gemini-2.5-flash': 'Gemini 2.5 Flash',
              'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite'
            };
            modelName = modelMap[form.geminiModel] || 'Gemini 2.5 Flash';
          } else {
            // Fallback to old preview logic for backward compatibility
            modelName = form.model.preview ? 'Gemini 1.5 Pro' : 'Gemini 2.5 Flash';
          }
        } else if (form.model.provider === 'groq') {
          if (form.groqModel) {
            const modelMap: Record<string, string> = {
              'meta-llama/llama-4-maverick-17b-128e-instruct': 'Llama 4 Maverick 17B',
              'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B'
            };
            modelName = modelMap[form.groqModel] || 'Groq';
          } else {
            modelName = 'Groq';
          }
        } else {
          modelName = 'Mistral';
        }
        
        setCompletionStats({
          totalFiles: files.length,
          successCount,
          errorCount,
          timeTaken,
          platform: platformName,
          model: modelName,
          avgQualityScore: avgQuality
        });
        setCompletionModalOpen(true);
      }
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.message || 'Generation failed. Please check your API key and try again.';
      setError({
        id: Date.now().toString(),
        message: errorMsg,
        severity: 'error',
        duration: 7000
      });
    } finally {
      setBusy(false);
      setProcessingProgress(0);
    }
  };

  const onStopProcessing = () => {
    console.log('🛑 Stop button clicked - setting stop flag');
    shouldStopRef.current = true;
    setBusy(false);
    setGeneratingFiles(new Set()); // Clear generating files immediately
  };

  // Helper function to regenerate a single file (updates existing row)
  const regenerateFile = async (
    fileIndex: number,
    filesToRegenerate: typeof files,
    completedCountRef: { current: number },
    unsubscribeCallbacks: Map<string, () => void>,
    assignedKey?: string, // Optional: specific API key for this worker
    workerId?: number // Optional: worker ID for parallel mode (0-indexed)
  ): Promise<void> => {
    if (shouldStopRef.current) {
      return;
    }

    const file = filesToRegenerate[fileIndex];
    
    // Mark file as generating
    setGeneratingFiles(prev => new Set(prev).add(file.name));
    
    // Subscribe to retry events for this file
    const unsubscribe = retrySSEClient.subscribe(file.name, (event) => {
      if (event.type === 'retry-event') {
        setRetryingFiles(prev => {
          const next = new Map(prev);

          if (event.status === 'retrying') {
            next.set(file.name, {
              attempt: event.attempt,
              maxAttempts: event.maxAttempts,
              errorType: event.errorType
            });
          } else {
            next.delete(file.name);
          }

          return next;
        });
      }
    });
    unsubscribeCallbacks.set(file.name, unsubscribe);

    try {
      // Convert file to base64 if it's an image (lazy conversion)
      let imageData: string | undefined;
      
      if (file.file && (isImageFile(file.file) || isVideoFile(file.file))) {
        try {
          imageData = await fileToBase64WithCompression(file.file, true);
          console.log(`✓ Extracted frame/image data for ${file.name}`);
          
          // Estimate compressed byte size from data URL and update file list
          const compressedBytes = estimateDataUrlByteSize(imageData);
          const originalFileSize = file.file?.size;
          if (compressedBytes > 0 && originalFileSize && compressedBytes < originalFileSize) {
            const compressionRatio = ((1 - compressedBytes / originalFileSize) * 100).toFixed(1);
            console.log(`📊 Compression for ${file.name}: Original=${originalFileSize} bytes, Compressed=${compressedBytes} bytes (${compressionRatio}% reduction)`);
            setFiles(prev => {
              const updated = prev.map(f =>
                f.name === file.name
                  ? {
                      ...f,
                      // Always use File object's original size to ensure accuracy
                      originalSize: originalFileSize,
                      size: compressedBytes
                    }
                  : f
              );
              // Debug: verify the update
              const updatedFile = updated.find(f => f.name === file.name);
              if (updatedFile) {
                console.log(`✅ Updated file state: originalSize=${updatedFile.originalSize}, size=${updatedFile.size}, will show: ${updatedFile.originalSize !== updatedFile.size}`);
              }
              return updated;
            });
          } else {
            console.warn(`⚠️ Compression update skipped for ${file.name}: compressedBytes=${compressedBytes}, originalFileSize=${originalFileSize}, compressedBytes < originalFileSize=${compressedBytes < (originalFileSize || 0)}`);
          }
        } catch (error) {
          console.warn(`Failed to convert ${isVideoFile(file.file) ? 'video frame' : 'image'} to base64 for ${file.name}:`, error);
          // For videos, continue without imageData (fallback to filename-based)
        }
      }
      
      // Detect mode: prompt or metadata
      const isPromptMode = form.uiTab === 'prompt';
      
      // Build request payload based on mode
      const requestPayload = isPromptMode ? {
        // Prompt generation payload
        imageData: imageData,
        imageUrl: undefined, // Not using URL for now
        platform: form.platform,
        assetType: form.assetType === 'auto' ? 'image' : form.assetType === 'video' ? 'video' : 'image',
        minWords: 160,
        stylePolicy: 'microstock-safe',
        negativePolicy: 'no text, no logo, no watermark',
        provider: form.model.provider,
        geminiModel: form.geminiModel,
        groqModel: form.groqModel,
        visionBearer: bearerRef.current // For Gemini/Mistral 2-step pipeline
      } : {
        // Existing metadata generation payload
        platform: form.platform,
        titleLen: form.titleLen,
        descLen: 150,
        keywordMode: form.keywordMode,
        keywordCount: form.keywordCount,
        assetType: form.assetType,
        prefix: form.prefix || undefined,
        suffix: form.suffix || undefined,
        negativeTitle: form.negativeTitle,
        negativeKeywords: form.negativeKeywords,
        model: { provider: form.model.provider, preview: form.model.preview },
        geminiModel: form.geminiModel,
        mistralModel: form.mistralModel,
        groqModel: form.groqModel,
        files: [file].map(f => ({ 
          name: f.name, 
          type: f.type, 
          url: f.url, 
          ext: f.ext,
          imageData: imageData // Include base64 data for images/videos
        })),
        videoHints: form.assetType === 'video' ? form.videoHints : undefined,
        singleMode: form.singleMode,
        isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
        isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
        isVector: form.isVector,
        isIllustration: form.isIllustration,
        userId: user?.uid,
        userDisplayName: user?.displayName || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || undefined,
        userPhotoURL: user?.photoURL || undefined
      };
      
      console.log(`📤 API Request (regenerate) for ${file.name} (${isPromptMode ? 'PROMPT' : 'METADATA'} mode):`, {
        mode: isPromptMode ? 'prompt' : 'metadata',
        toggleValues: isPromptMode ? {} : {
          isolatedOnTransparentBackground: (requestPayload as any).isolatedOnTransparentBackground,
          isolatedOnWhiteBackground: (requestPayload as any).isolatedOnWhiteBackground,
          isVector: (requestPayload as any).isVector,
          isIllustration: (requestPayload as any).isIllustration
        }
      });
      
      // Use assigned key if provided (for parallel workers), otherwise fall back to bearerRef
      const apiKey = assignedKey || bearerRef.current;
      
      // Route to appropriate API endpoint based on mode
      const apiEndpoint = isPromptMode ? '/api/prompt/image-to-prompt' : '/api/generate';
      
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify(requestPayload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || `Failed to regenerate metadata for ${file.name}`;
        
        // Check if this is a quota exhaustion error
        const isQuotaExhausted = res.status === 429 && (
          errorMsg.toLowerCase().includes('quota') ||
          errorMsg.toLowerCase().includes('exceeded') ||
          errorMsg.toLowerCase().includes('free_tier') ||
          errorMsg.toLowerCase().includes('rate limit exceeded') ||
          errorData.error?.message?.toLowerCase().includes('quota')
        );
        
        // If quota exhausted and using parallel mode with assigned key, mark it as exhausted
        if (isQuotaExhausted && assignedKey && form.parallelMode && workerId !== undefined) {
          keyPoolManager.markKeyExhausted(form.model.provider, assignedKey);
          const availableKeys = keyPoolManager.getAvailableKeyCount(form.model.provider);
          
          console.warn(`⚠️ Worker ${workerId}: API key exhausted (regenerate). Stopping this worker. Other workers will continue.`);
          
          // If all keys exhausted, stop all workers
          if (availableKeys === 0) {
            console.error('🛑 All API keys exhausted! Stopping all workers.');
            shouldStopRef.current = true;
            setError({
              id: Date.now().toString(),
              message: 'All API keys have exceeded their quota limits. Generation stopped. Please wait or add more API keys.',
              severity: 'error',
              duration: 10000
            });
          } else {
            console.log(`ℹ️ Worker ${workerId} stopped: API quota exceeded. ${availableKeys} key(s) still available.`);
          }
          
          // Update row with quota exhaustion error
          const isPromptMode = form.uiTab === 'prompt';
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === file.name);
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                title: isPromptMode ? '' : `[ERROR] API quota exceeded (Worker ${workerId + 1}). Worker stopped.`, // Empty title for prompt mode
                error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
              };
            }
            return updated;
          });
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          setFailedCount(prev => prev + 1);
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / filesToRegenerate.length) * 100));
          return; // Stop this worker from processing more files
        }
        
        // Regular error handling (non-quota errors)
        const isPromptMode = form.uiTab === 'prompt';
        setRows(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(r => r.filename === file.name);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              title: isPromptMode ? '' : `[ERROR] ${errorMsg}`, // Empty title for prompt mode
              error: errorMsg
            };
          }
          return updated;
        });
        
        // Remove from generating set
        setGeneratingFiles(prev => {
          const next = new Set(prev);
          next.delete(file.name);
          return next;
        });
        unsubscribe();
        unsubscribeCallbacks.delete(file.name);
        completedCountRef.current++;
        setFailedCount(prev => prev + 1);
        const completed = completedCountRef.current;
        setProcessingProgress(Math.round((completed / filesToRegenerate.length) * 100));
        return;
      }
      
      const data = await res.json();
      
      if (isPromptMode) {
        // Handle prompt generation response
        if (data.prompt) {
          const newRow: Row = {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: '', // Empty for prompt mode
            description: '', // Empty for prompt mode
            keywords: [], // Empty for prompt mode
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            generatedPrompt: data.prompt, // Store the generated prompt
            negativePrompt: data.negative_prompt, // Store negative prompt (optional)
            error: data.error
          };
          // Update row progressively
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === file.name);
            if (idx >= 0) {
              updated[idx] = newRow;
            } else {
              updated.push(newRow);
            }
            return updated;
          });
          
          // Track generation
          await trackGenerationInFirestore(1);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          // Only count as success if there's no error
          if (!newRow.error) {
            setSuccessCount(prev => prev + 1);
          } else {
            setFailedCount(prev => prev + 1);
          }
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / filesToRegenerate.length) * 100));
        } else if (data.error) {
          // Handle prompt generation error
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === file.name);
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                title: `[ERROR] ${data.error}`,
                error: data.error
              };
            }
            return updated;
          });
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          setFailedCount(prev => prev + 1);
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / filesToRegenerate.length) * 100));
        }
      } else {
        // Existing metadata handling
        if (data.rows && data.rows.length > 0) {
          const newRow = data.rows[0];
          // Update row progressively
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === file.name);
            if (idx >= 0) {
              updated[idx] = newRow;
            } else {
              updated.push(newRow);
            }
            return updated;
          });
          
          // Track generation
          await trackGenerationInFirestore(data.rows.length);
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
          unsubscribe();
          unsubscribeCallbacks.delete(file.name);
          completedCountRef.current++;
          // Only count as success if there's no error
          if (!newRow.error) {
            setSuccessCount(prev => prev + 1);
          } else {
            setFailedCount(prev => prev + 1);
          }
          const completed = completedCountRef.current;
          setProcessingProgress(Math.round((completed / filesToRegenerate.length) * 100));
        }
      }
    } catch (fileError: any) {
      unsubscribe();
      unsubscribeCallbacks.delete(file.name);
      console.error(`Error regenerating ${file.name}:`, fileError);
      
      // Check if this is a quota exhaustion error in the catch block
      const errorMsg = fileError.message || 'Unknown error';
      const isQuotaExhausted = fileError?.status === 429 && (
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('exceeded') ||
        errorMsg.toLowerCase().includes('free_tier') ||
        errorMsg.toLowerCase().includes('rate limit exceeded')
      );
      
      // If quota exhausted and using parallel mode with assigned key, mark it as exhausted
      if (isQuotaExhausted && assignedKey && form.parallelMode && workerId !== undefined) {
        keyPoolManager.markKeyExhausted(form.model.provider, assignedKey);
        const availableKeys = keyPoolManager.getAvailableKeyCount(form.model.provider);
        
        console.warn(`⚠️ Worker ${workerId}: API key exhausted (regenerate, from catch). Stopping this worker. Other workers will continue.`);
        
        // If all keys exhausted, stop all workers
        if (availableKeys === 0) {
          console.error('🛑 All API keys exhausted! Stopping all workers.');
          shouldStopRef.current = true;
          setError({
            id: Date.now().toString(),
            message: 'All API keys have exceeded their quota limits. Generation stopped. Please wait or add more API keys.',
            severity: 'error',
            duration: 10000
          });
        } else {
          console.log(`ℹ️ Worker ${workerId} stopped: API quota exceeded. ${availableKeys} key(s) still available.`);
        }
        
        // Update row with quota exhaustion error
        const isPromptMode = form.uiTab === 'prompt';
        setRows(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(r => r.filename === file.name);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              title: isPromptMode ? '' : `[ERROR] API quota exceeded (Worker ${workerId + 1}). Worker stopped.`, // Empty title for prompt mode
              error: `API quota exceeded for Worker ${workerId + 1} (key: ${assignedKey.substring(0, 8)}...). This worker has stopped.`
            };
          }
          return updated;
        });
      
      // Remove from generating set
      setGeneratingFiles(prev => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
      completedCountRef.current++;
      setProcessingProgress(Math.round((completedCountRef.current / filesToRegenerate.length) * 100));
        return; // Stop this worker from processing more files
      }
      
      // Regular error handling (non-quota errors)
      const isPromptMode = form.uiTab === 'prompt';
      setRows(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(r => r.filename === file.name);
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            title: isPromptMode ? '' : `[ERROR] ${errorMsg}`, // Empty title for prompt mode
            error: errorMsg
          };
        }
        return updated;
      });
      
      // Remove from generating set
      setGeneratingFiles(prev => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
      completedCountRef.current++;
      setProcessingProgress(Math.round((completedCountRef.current / filesToRegenerate.length) * 100));
    }
  };

  const onRegenerate = async (filename: string) => {
    const file = files.find(f => f.name === filename);
    if (!file) return;
    setBusy(true);
    // Mark file as generating for animation
    setGeneratingFiles(prev => new Set(prev).add(filename));
    
    // Subscribe to retry events for this file
    const unsubscribe = retrySSEClient.subscribe(filename, (event) => {
      if (event.type === 'retry-event') {
        setRetryingFiles(prev => {
          const next = new Map(prev);

          if (event.status === 'retrying') {
            next.set(filename, {
              attempt: event.attempt,
              maxAttempts: event.maxAttempts,
              errorType: event.errorType
            });
          } else {
            next.delete(filename);
          }

          return next;
        });
      }
    });
    
    try {
      // Convert file to base64 if it's an image or video (lazy conversion)
      let imageData: string | undefined;
      
      if (file.file && (isImageFile(file.file) || isVideoFile(file.file))) {
        try {
          imageData = await fileToBase64WithCompression(file.file, true);
          console.log(`✓ Extracted frame/image data for ${file.name}`);
          
          // Estimate compressed byte size from data URL and update file list
          const compressedBytes = estimateDataUrlByteSize(imageData);
          const originalFileSize = file.file?.size;
          if (compressedBytes > 0 && originalFileSize && compressedBytes < originalFileSize) {
            const compressionRatio = ((1 - compressedBytes / originalFileSize) * 100).toFixed(1);
            console.log(`📊 Compression for ${file.name}: Original=${originalFileSize} bytes, Compressed=${compressedBytes} bytes (${compressionRatio}% reduction)`);
            setFiles(prev => {
              const updated = prev.map(f =>
                f.name === file.name
                  ? {
                      ...f,
                      // Always use File object's original size to ensure accuracy
                      originalSize: originalFileSize,
                      size: compressedBytes
                    }
                  : f
              );
              // Debug: verify the update
              const updatedFile = updated.find(f => f.name === file.name);
              if (updatedFile) {
                console.log(`✅ Updated file state: originalSize=${updatedFile.originalSize}, size=${updatedFile.size}, will show: ${updatedFile.originalSize !== updatedFile.size}`);
              }
              return updated;
            });
          } else {
            console.warn(`⚠️ Compression update skipped for ${file.name}: compressedBytes=${compressedBytes}, originalFileSize=${originalFileSize}, compressedBytes < originalFileSize=${compressedBytes < (originalFileSize || 0)}`);
          }
        } catch (error) {
          console.warn(`Failed to convert ${isVideoFile(file.file) ? 'video frame' : 'image'} to base64 for ${file.name}:`, error);
          // For videos, continue without imageData (fallback to filename-based)
        }
      }
      
      // Detect mode: prompt or metadata
      const isPromptMode = form.uiTab === 'prompt';
      
      // Build request payload based on mode
      const requestPayload = isPromptMode ? {
        // Prompt generation payload
        imageData: imageData,
        imageUrl: undefined, // Not using URL for now
        platform: form.platform,
        assetType: form.assetType === 'auto' ? 'image' : form.assetType === 'video' ? 'video' : 'image',
        minWords: 160,
        stylePolicy: 'microstock-safe',
        negativePolicy: 'no text, no logo, no watermark',
        provider: form.model.provider,
        geminiModel: form.geminiModel,
        groqModel: form.groqModel,
        visionBearer: bearerRef.current // For Gemini/Mistral 2-step pipeline
      } : {
        // Existing metadata generation payload
        platform: form.platform,
        titleLen: form.titleLen,
        descLen: 150,
        keywordMode: form.keywordMode,
        keywordCount: form.keywordCount,
        assetType: form.assetType,
        prefix: form.prefix || undefined,
        suffix: form.suffix || undefined,
        negativeTitle: form.negativeTitle,
        negativeKeywords: form.negativeKeywords,
        model: { provider: form.model.provider, preview: form.model.preview },
        geminiModel: form.geminiModel,
        mistralModel: form.mistralModel,
        groqModel: form.groqModel,
        files: [file].map(f => ({ 
          name: f.name, 
          type: f.type, 
          url: f.url, 
          ext: f.ext,
          imageData: imageData // Include base64 data for images
        })),
        videoHints: form.assetType === 'video' ? form.videoHints : undefined,
        isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
        isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
        isVector: form.isVector,
        isIllustration: form.isIllustration,
        userId: user?.uid,
        userDisplayName: user?.displayName || user?.email?.split('@')[0] || 'User',
        userEmail: user?.email || undefined,
        userPhotoURL: user?.photoURL || undefined
      };
      
      console.log(`📤 API Request (regenerate) for ${filename} (${isPromptMode ? 'PROMPT' : 'METADATA'} mode):`, {
        mode: isPromptMode ? 'prompt' : 'metadata'
      });
      
      // Route to appropriate API endpoint based on mode
      const apiEndpoint = isPromptMode ? '/api/prompt/image-to-prompt' : '/api/generate';
      
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerRef.current ? { Authorization: `Bearer ${bearerRef.current}` } : {})
        },
        body: JSON.stringify(requestPayload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || `Failed to regenerate ${isPromptMode ? 'prompt' : 'metadata'}`;
        setError({
          id: Date.now().toString(),
          message: errorMsg,
          severity: 'error',
          duration: 5000
        });
        return;
      }
      
      const data = await res.json();
      
      if (isPromptMode) {
        // Handle prompt generation response
        if (data.prompt) {
          const newRow: Row = {
            filename: file.name,
            platform: form.platform === 'adobe' ? 'Adobe Stock' : form.platform === 'general' ? 'General' : 'Shutterstock',
            title: '', // Empty for prompt mode
            description: '', // Empty for prompt mode
            keywords: [], // Empty for prompt mode
            assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
            extension: file.ext || '',
            generatedPrompt: data.prompt, // Store the generated prompt
            negativePrompt: data.negative_prompt, // Store negative prompt (optional)
            error: data.error
          };
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === filename);
            if (idx >= 0) {
              updated[idx] = newRow;
            } else {
              updated.push(newRow);
            }
            return updated;
          });
          
          // Track generation
          await trackGenerationInFirestore(1);
        } else if (data.error) {
          setError({
            id: Date.now().toString(),
            message: data.error,
            severity: 'error',
            duration: 5000
          });
        }
      } else {
        // Existing metadata handling
        if (data.rows && data.rows.length > 0) {
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === filename);
            if (idx >= 0) {
              updated[idx] = data.rows[0];
            } else {
              updated.push(data.rows[0]);
            }
            return updated;
          });
          
          // Track generation
          await trackGenerationInFirestore(data.rows.length);
        }
      }
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.message || 'Regeneration failed. Please check your API key and try again.';
      setError({
        id: Date.now().toString(),
        message: errorMsg,
        severity: 'error',
        duration: 5000
      });
    } finally {
      setBusy(false);
      // Remove from generating set
      setGeneratingFiles(prev => {
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
    }
  };

  const onRegenerateAll = async () => {
    // Reset exhausted keys when starting regeneration
    if (form.parallelMode) {
      keyPoolManager.resetExhaustedKeys();
    }
    // Find all files that have existing results (rows)
    const filesWithResults = files.filter(f => rows.some(r => r.filename === f.name));
    
    if (filesWithResults.length === 0) {
      setError({
        id: Date.now().toString(),
        message: 'No files with existing results to regenerate.',
        severity: 'warning',
        duration: 3000
      });
      return;
    }
    
    // Ensure bearer token is loaded before starting
    await updateBearerToken();
    
    // Check if bearer token is available
    if (!bearerRef.current || bearerRef.current.length === 0) {
      setError({
        id: Date.now().toString(),
        message: `No API key found for ${form.model.provider}. Please add an API key in the "API Secrets" modal.`,
        severity: 'error',
        duration: 7000
      });
      return;
    }
    
    setBusy(true);
    shouldStopRef.current = false;
    setProcessingProgress(0);
    setSuccessCount(0);
    setFailedCount(0);
    
    try {
      const completedCountRef = { current: 0 };
      const unsubscribeCallbacks = new Map<string, () => void>();
      
      if (form.singleMode) {
        // Single mode: Process one file at a time
        for (let i = 0; i < filesWithResults.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Regeneration stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await regenerateFile(i, filesWithResults, completedCountRef, unsubscribeCallbacks);
        }
      } else if (form.parallelMode) {
        // Parallel mode: Use worker queue to process multiple files concurrently
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        // Initialize key pool for the current provider
        await keyPoolManager.initialize(form.model.provider);
        const availableKeys = keyPoolManager.getKeyCount(form.model.provider);
        
        if (availableKeys === 0) {
          setError({
            id: Date.now().toString(),
            message: `No keys selected for parallel generation. Please select keys in the "API Secrets" modal.`,
            severity: 'error',
            duration: 7000
          });
          setBusy(false);
          return;
        }
        
        console.log(`🔑 Regenerate (parallel mode): Using ${availableKeys} selected key(s) for ${form.model.provider}`);
        
        let currentIndex = 0;
        const total = filesWithResults.length;
        
        // Worker function that processes files from the queue
        // Each worker gets assigned a unique API key from the pool
        const worker = async (workerId: number) => {
          // Get assigned key for this worker (round-robin distribution)
          const assignedKey = keyPoolManager.getKeyByIndex(form.model.provider, workerId);
          
          if (!assignedKey) {
            console.error(`❌ Worker ${workerId}: No API key available`);
            return;
          }
          
          console.log(`👷 Regenerate Worker ${workerId}: Assigned API key ${assignedKey.substring(0, 8)}...`);
          
          while (true) {
            if (shouldStopRef.current) {
              console.log(`🛑 Worker ${workerId}: Stopped by user or all keys exhausted`);
              break;
            }
            
            // Check if assigned key is exhausted before processing each file
            if (keyPoolManager.isKeyExhausted(form.model.provider, assignedKey)) {
              console.warn(`⚠️ Worker ${workerId}: Assigned key exhausted, stopping this worker`);
              break; // This worker stops completely - don't try to get another key
            }
            
            const myIndex = currentIndex++;
            if (myIndex >= total) {
              break; // Queue empty, this worker stops
            }
            
            await regenerateFile(myIndex, filesWithResults, completedCountRef, unsubscribeCallbacks, assignedKey, workerId);
          }
        };
        
        // Start workers in parallel, each with its own API key
        // For Groq, allow parallel workers (up to 5) so multiple accounts/orgs can be used
        const maxGroqWorkers = 5;
        const numWorkers =
          form.model.provider === 'groq'
            ? Math.min(maxGroqWorkers, MAX_CONCURRENT_WORKERS, filesWithResults.length, availableKeys)
            : Math.min(MAX_CONCURRENT_WORKERS, filesWithResults.length, availableKeys);
        console.log(`⚡ Starting ${numWorkers} parallel regenerate workers with ${availableKeys} selected key(s) for provider ${form.model.provider}`);
        
        await Promise.all(
          Array.from({ length: numWorkers }, (_, i) => worker(i))
        );
        
        // If stopped early, clean up remaining subscriptions
        if (shouldStopRef.current) {
          console.log('🛑 Regeneration stopped by user');
          unsubscribeCallbacks.forEach(unsub => unsub());
        }
      } else {
        // Default sequential mode: Process files one-by-one
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        for (let i = 0; i < filesWithResults.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Regeneration stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await regenerateFile(i, filesWithResults, completedCountRef, unsubscribeCallbacks);
        }
      }
      
      // Clean up any remaining subscriptions
      unsubscribeCallbacks.forEach(unsub => unsub());
    } catch (e: any) {
      console.error('Regenerate all error:', e);
      setError({
        id: Date.now().toString(),
        message: e.message || 'Regeneration failed. Please check your API key and try again.',
        severity: 'error',
        duration: 5000
      });
    } finally {
      setBusy(false);
      setProcessingProgress(100);
      setGeneratingFiles(new Set()); // Clear all generating files
      setFileToWorkerId(new Map()); // Clear worker ID mappings
    }
  };

  const onRegenerateFailed = async () => {
    // Reset exhausted keys when starting regeneration
    if (form.parallelMode) {
      keyPoolManager.resetExhaustedKeys();
    }
    // Find all files that have error rows
    const failedFiles = files.filter(f => {
      const row = rows.find(r => r.filename === f.name);
      return row?.error; // Only files with errors
    });
    
    if (failedFiles.length === 0) {
      setError({
        id: Date.now().toString(),
        message: 'No failed files to regenerate.',
        severity: 'info',
        duration: 3000
      });
      return;
    }
    
    // Ensure bearer token is loaded before starting
    await updateBearerToken();
    
    // Check if bearer token is available
    if (!bearerRef.current || bearerRef.current.length === 0) {
      setError({
        id: Date.now().toString(),
        message: `No API key found for ${form.model.provider}. Please add an API key in the "API Secrets" modal.`,
        severity: 'error',
        duration: 7000
      });
      return;
    }
    
    setBusy(true);
    shouldStopRef.current = false;
    setProcessingProgress(0);
    setSuccessCount(0);
    setFailedCount(0);
    
    try {
      const completedCountRef = { current: 0 };
      const unsubscribeCallbacks = new Map<string, () => void>();
      
      if (form.singleMode) {
        // Single mode: Process one file at a time
        for (let i = 0; i < failedFiles.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Regeneration stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await regenerateFile(i, failedFiles, completedCountRef, unsubscribeCallbacks);
        }
      } else if (form.parallelMode) {
        // Parallel mode: Use worker queue to process multiple files concurrently
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        // Initialize key pool for the current provider
        const initResult = await keyPoolManager.initialize(form.model.provider);
        const availableKeys = keyPoolManager.getKeyCount(form.model.provider);
        
        if (!initResult.success || availableKeys === 0) {
          setError({
            id: Date.now().toString(),
            message: initResult.error || `No keys selected for parallel generation. Please select keys in the "API Secrets" modal.`,
            severity: 'error',
            duration: 7000
          });
          setBusy(false);
          return;
        }
        
        const selectedModel = keyPoolManager.getModel(form.model.provider);
        console.log(`🔑 Regenerate Failed (parallel mode): Using ${availableKeys} selected key(s) for ${form.model.provider}, model: ${selectedModel}`);
        
        let currentIndex = 0;
        const total = failedFiles.length;
        
        // Worker function that processes files from the queue
        // Each worker gets assigned a unique API key from the pool
        const worker = async (workerId: number) => {
          // Get assigned key for this worker (round-robin distribution)
          const assignedKey = keyPoolManager.getKeyByIndex(form.model.provider, workerId);
          
          if (!assignedKey) {
            console.error(`❌ Worker ${workerId}: No API key available`);
            return;
          }
          
          console.log(`👷 Regenerate Failed Worker ${workerId}: Assigned API key ${assignedKey.substring(0, 8)}...`);
          
          while (true) {
            if (shouldStopRef.current) {
              console.log(`🛑 Worker ${workerId}: Stopped by user or all keys exhausted`);
              break;
            }
            
            // Check if assigned key is exhausted before processing each file
            if (keyPoolManager.isKeyExhausted(form.model.provider, assignedKey)) {
              console.warn(`⚠️ Worker ${workerId}: Assigned key exhausted, stopping this worker`);
              break; // This worker stops completely - don't try to get another key
            }
            
            const myIndex = currentIndex++;
            if (myIndex >= total) {
              break; // Queue empty, this worker stops
            }
            
            await regenerateFile(myIndex, failedFiles, completedCountRef, unsubscribeCallbacks, assignedKey, workerId);
          }
        };
        
        // Start multiple workers in parallel, each with its own API key
        const numWorkers = Math.min(MAX_CONCURRENT_WORKERS, failedFiles.length, availableKeys);
        console.log(`⚡ Starting ${numWorkers} parallel regenerate failed workers with ${availableKeys} selected key(s)`);
        
        await Promise.all(
          Array.from({ length: numWorkers }, (_, i) => worker(i))
        );
        
        // If stopped early, clean up remaining subscriptions
        if (shouldStopRef.current) {
          console.log('🛑 Regeneration stopped by user');
          unsubscribeCallbacks.forEach(unsub => unsub());
        }
      } else {
        // Default sequential mode: Process files one-by-one
        setProcessingProgress(0); // Start at 0, will update as files complete
        
        for (let i = 0; i < failedFiles.length; i++) {
          if (shouldStopRef.current) {
            console.log('🛑 Regeneration stopped by user');
            setBusy(false);
            setGeneratingFiles(new Set());
            unsubscribeCallbacks.forEach(unsub => unsub());
            return;
          }
          
          await regenerateFile(i, failedFiles, completedCountRef, unsubscribeCallbacks);
        }
      }
      
      // Clean up any remaining subscriptions
      unsubscribeCallbacks.forEach(unsub => unsub());
    } catch (e: any) {
      console.error('Regenerate failed error:', e);
      setError({
        id: Date.now().toString(),
        message: e.message || 'Regeneration failed. Please check your API key and try again.',
        severity: 'error',
        duration: 5000
      });
    } finally {
      setBusy(false);
      setProcessingProgress(100);
      setGeneratingFiles(new Set()); // Clear all generating files
      setFileToWorkerId(new Map()); // Clear worker ID mappings
    }
  };

  return (
    <>
      <ErrorToastComponent error={error} onDismiss={() => setError(null)} />
      <CompletionModal 
        open={completionModalOpen}
        onClose={() => setCompletionModalOpen(false)}
        stats={completionStats}
        onExportCSV={onExportCSV}
        onExportZIP={onExportZIP}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-4 sm:gap-6 animate-fade-in">
        {/* Left Sidebar - Settings */}
        <div className="space-y-6">
          {/* Quick Start Guide */}
          <div className="card p-6 bg-gradient-to-br from-green-accent/5 to-teal-accent/5 border-green-accent/30">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚀</span>
                  <h3 className="text-lg font-extrabold text-text-primary tracking-tight">Quick Start Guide</h3>
                </div>
                <span className="text-green-bright text-lg transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div className="mt-4 pt-4 border-t border-green-accent/20 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-green-bright font-bold text-lg flex-shrink-0">1.</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-1">Upload Files</div>
                    <div className="text-sm text-text-secondary">Drag and drop or click to upload your images/videos (PNG, JPG, SVG, MP4, etc.)</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-bright font-bold text-lg flex-shrink-0">2.</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-1">Configure Settings</div>
                    <div className="text-sm text-text-secondary">Select export platform (Adobe, Shutterstock, etc.), adjust metadata length, and set file type attributes</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-bright font-bold text-lg flex-shrink-0">3.</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-1">Generate Metadata</div>
                    <div className="text-sm text-text-secondary">Click &quot;Generate All&quot; to process all files, or use individual &quot;Generate&quot; buttons to test one file first</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-green-bright font-bold text-lg flex-shrink-0">4.</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-1">Export Results</div>
                    <div className="text-sm text-text-secondary">Use &quot;Export CSV&quot; for a single CSV file, or &quot;Export ZIP (Multi-CSV)&quot; to get CSVs for all formats (JPG, PNG, SVG, EPS, AI, WebP, video) - each CSV contains all your files with that format&apos;s extension</div>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div className="card p-8">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-green-accent/20">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚙️</span>
                <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">Settings</h2>
              </div>
              <div className="flex gap-2">
                <Analytics />
              </div>
            </div>
            <APIControls value={form} onChange={handleFormChange} />
          </div>
          <div className="card p-8">
            <AdvancedMetadataControls value={form} onChange={handleFormChange} />
          </div>
          <div className="p-5 bg-gradient-to-r from-green-accent/10 to-teal-accent/10 rounded-lg border border-green-accent/20">
            <div className="flex items-start gap-2 mb-3">
              <span className="text-lg">💡</span>
              <h3 className="text-sm font-bold text-text-primary">Quick Tips</h3>
            </div>
            <div className="space-y-2 text-sm text-text-secondary">
              <p className="flex items-start gap-2">
                <span className="text-green-bright">📁</span>
                <span>
                  {/* eslint-disable-next-line react/no-unescaped-entities */}
                  Files are saved in <code className="px-1.5 py-0.5 bg-green-accent/20 rounded border border-green-accent/30 text-green-bright font-bold">/public/uploads</code>. &ldquo;Clear All&rdquo; removes them.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-green-bright">📦</span>
                <span>
                  <strong className="text-green-bright font-semibold">Multi-CSV Export:</strong> Use &ldquo;Export ZIP (Multi-CSV)&rdquo; to download a ZIP containing CSVs for all formats (JPG, PNG, SVG, EPS, AI, WebP, video). Each CSV contains all your files with that format&apos;s extension.
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Center - Main Content */}
        <div className="space-y-6">
          <div className="card p-6">
            <FileDrop
              files={files}
              onFilesChange={setFiles}
              onGenerateAll={onGenerateAll}
              generating={busy}
              onExportCSV={onExportCSV}
              onExportZIP={onExportZIP}
              hasRows={rows.length > 0}
              rows={rows}
              onRegenerate={onRegenerate}
              onRegenerateAll={onRegenerateAll}
              onRegenerateFailed={onRegenerateFailed}
              processingProgress={processingProgress}
              onStopProcessing={onStopProcessing}
              onRowsUpdate={setRows}
              generatingFiles={generatingFiles}
              retryingFiles={retryingFiles}
              fileToWorkerId={fileToWorkerId}
              successCount={successCount}
              failedCount={failedCount}
              showTransparentPngHint={showTransparentPngHint}
            />
          </div>
        </div>
      </div>
    </>
  );
}

