'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import APIControls from '@/components/APIControls';
import AdvancedMetadataControls from '@/components/AdvancedMetadataControls';
import FileDrop from '@/components/FileDrop';
import ResultTable from '@/components/ResultTable';
import ErrorToastComponent, { type ErrorToast } from '@/components/ErrorToast';
import TemplateManager from '@/components/TemplateManager';
import Analytics from '@/components/Analytics';
import HistoryViewer, { saveToHistory } from '@/components/HistoryViewer';
import { toCSV } from '@/lib/csv';
import { getJSON, setJSON, getDecryptedJSON } from '@/lib/util';
import { trackEvent } from '@/lib/analytics';
import { scoreTitleQuality } from '@/lib/util';
import { getSmartDefaults } from '@/lib/smart-defaults';
import type { Row } from '@/lib/csv';
import type { FormState } from '@/lib/types';
import { fileToBase64WithCompression, isImageFile } from '@/lib/client-file-util';
import { retrySSEClient } from '@/lib/retry-sse';

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

export default function Page() {
  const [files, setFiles] = useState<UploadItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [shouldStop, setShouldStop] = useState(false);
  const [generatingFiles, setGeneratingFiles] = useState<Set<string>>(new Set());
  const [retryingFiles, setRetryingFiles] = useState<Map<string, { attempt: number; maxAttempts: number; errorType?: string }>>(new Map());
  const [history, setHistory] = useState<Array<{ at: number; count: number }>>(() => {
    if (typeof window !== 'undefined') {
      return getJSON('smg_history', []);
    }
    return [];
  });
  const [error, setError] = useState<ErrorToast | null>(null);

  const [form, setForm] = useState({
    platform: 'shutterstock' as 'adobe' | 'freepik' | 'shutterstock',
    model: { provider: 'gemini' as 'gemini' | 'mistral', preview: false },
    titleLen: 70, // Adobe Stock requirement: 70 chars max
    descLen: 150 as 150,
    keywordCount: 41,
    assetType: 'auto' as 'auto' | 'photo' | 'illustration' | 'vector' | '3d' | 'icon' | 'video',
    prefix: '',
    suffix: '',
    negativeTitle: [] as string[],
    negativeKeywords: [] as string[],
    singleMode: false,
    videoHints: { style: [] as string[], tech: [] as string[] },
    isolatedOnTransparentBackground: false,
    isolatedOnWhiteBackground: false,
    isVector: false,
    isIllustration: false
  });

  const bearerRef = useRef<string>('');
  
  // Load bearer token based on current provider
  const updateBearerToken = useCallback(async () => {
    try {
      const enc = await getDecryptedJSON<{ 
        geminiKeys?: Array<{ id: string; key: string; visible: boolean }>;
        mistralKeys?: Array<{ id: string; key: string; visible: boolean }>;
        active?: 'gemini'|'mistral';
        activeKeyId?: string;
        bearer?: string;
      }>('smg_keys_enc', null as any);
      
      if (!enc) {
        bearerRef.current = '';
        console.warn('⚠ No encrypted keys found in storage');
        return;
      }
      
      // Use the current provider from form state, not stored active
      const currentProvider = form.model.provider;
      const keys = currentProvider === 'gemini' ? enc.geminiKeys : enc.mistralKeys;
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
  }, [form.model.provider]);
  
  // Load bearer token on mount and when provider changes
  useEffect(() => {
    updateBearerToken();
  }, [updateBearerToken]);

  // Server rehydration removed - files are now stored client-side only

  const onExportCSV = () => {
    const csv = toCSV(rows, form.titleLen, form.descLen, form.keywordCount);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stock-metadata.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onGenerateAll = async () => {
    if (!files.length) return;
    
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
    setShouldStop(false);
    setProcessingProgress(0);
    // Don't clear rows - preserve existing results and only update as new ones come in
    
    try {
      const allRows: Row[] = [];
      
      if (form.singleMode) {
        // Single mode: Process one file at a time and show results immediately
        
        for (let i = 0; i < files.length; i++) {
          if (shouldStop) {
            setBusy(false);
            setGeneratingFiles(new Set());
            return;
          }
          
          setProcessingProgress(Math.round(((i + 1) / files.length) * 100));
          
          // Mark file as generating
          setGeneratingFiles(prev => new Set(prev).add(files[i].name));
          
          // Subscribe to retry events for this file
          const unsubscribe = retrySSEClient.subscribe(files[i].name, (event) => {
            if (event.type === 'retry-event') {
              setRetryingFiles(prev => {
                const next = new Map(prev);
                next.set(files[i].name, {
                  attempt: event.attempt,
                  maxAttempts: event.maxAttempts,
                  errorType: event.errorType
                });
                return next;
              });
            }
          });
          
          try {
            // Convert file to base64 if it's an image (lazy conversion)
            const file = files[i];
            let imageData: string | undefined;
            
            if (file.file && isImageFile(file.file)) {
              try {
                imageData = await fileToBase64WithCompression(file.file, true);
              } catch (error) {
                console.warn(`Failed to convert image to base64 for ${file.name}:`, error);
              }
            }
            
            const requestPayload = {
              platform: form.platform,
              titleLen: form.titleLen,
              descLen: 150,
              keywordCount: form.keywordCount,
              assetType: form.assetType,
              prefix: form.prefix || undefined,
              suffix: form.suffix || undefined,
              negativeTitle: form.negativeTitle,
              negativeKeywords: form.negativeKeywords,
              model: { provider: form.model.provider, preview: form.model.preview },
              files: [files[i]].map(f => ({ 
                name: f.name, 
                type: f.type, 
                url: f.url, 
                ext: f.ext,
                imageData: imageData // Include base64 data for images
              })),
              videoHints: form.assetType === 'video' ? form.videoHints : undefined,
              singleMode: true,
              isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
              isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
              isVector: form.isVector,
              isIllustration: form.isIllustration
            };
            
            console.log(`📤 API Request (single mode) for ${files[i].name}:`, {
              toggleValues: {
                isolatedOnTransparentBackground: requestPayload.isolatedOnTransparentBackground,
                isolatedOnWhiteBackground: requestPayload.isolatedOnWhiteBackground,
                isVector: requestPayload.isVector,
                isIllustration: requestPayload.isIllustration
              }
            });
            
            const res = await fetch('/api/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(bearerRef.current ? { Authorization: `Bearer ${bearerRef.current}` } : {})
              },
              body: JSON.stringify(requestPayload)
            });
            
            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              const errorMsg = errorData.message || errorData.error || `Failed to generate metadata for ${files[i].name}`;
              
              // Add error row immediately
              const errorRow: Row = {
                filename: files[i].name,
                platform: form.platform === 'adobe' ? 'Adobe' : form.platform === 'freepik' ? 'Freepik' : 'Shutterstock',
                title: `[ERROR] ${errorMsg}`,
                description: 'Generation failed. Please check your API key and try again.',
                keywords: [],
                assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
                extension: files[i].ext || '',
                error: errorMsg
              };
              allRows.push(errorRow);
              setRows([...allRows]); // Update UI immediately with error
              
              // Remove from generating set
              setGeneratingFiles(prev => {
                const next = new Set(prev);
                next.delete(files[i].name);
                return next;
              });
              unsubscribe();
              continue;
            }
            
            const data = await res.json();
            if (data.rows && data.rows.length > 0) {
              const newRow = data.rows[0];
              allRows.push(newRow);
              // Update UI immediately after each generation
              setRows([...allRows]);
              
              // Remove from generating set
              setGeneratingFiles(prev => {
                const next = new Set(prev);
                next.delete(files[i].name);
                return next;
              });
              unsubscribe();
            }
          } catch (fileError: any) {
            unsubscribe();
            console.error(`Error processing ${files[i].name}:`, fileError);
            // Add error row for this file
            const errorRow: Row = {
              filename: files[i].name,
              platform: form.platform === 'adobe' ? 'Adobe' : form.platform === 'freepik' ? 'Freepik' : 'Shutterstock',
              title: `[ERROR] ${fileError.message || 'Generation failed'}`,
              description: 'Generation failed. Please check your API key and try again.',
              keywords: [],
              assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
              extension: files[i].ext || '',
              error: fileError.message || 'Unknown error'
            };
            allRows.push(errorRow);
            setRows([...allRows]); // Update UI immediately with error
          }
        }
      } else {
        // Batch mode: Process files sequentially to show progressive results
        // Process files one-by-one (similar to single mode) for progressive display
        setProcessingProgress(10); // Show initial progress
        
        // Log bearer token status for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔍 Generate request - Provider: ${form.model.provider}, Bearer token: ${bearerRef.current ? 'YES' : 'NO'}, Length: ${bearerRef.current.length}`);
        }
        
        for (let i = 0; i < files.length; i++) {
          if (shouldStop) {
            setBusy(false);
            setGeneratingFiles(new Set());
            return;
          }
          
          setProcessingProgress(Math.round(((i + 1) / files.length) * 100));
          
          // Mark file as generating
          setGeneratingFiles(prev => new Set(prev).add(files[i].name));
          
          try {
            // Convert file to base64 if it's an image (lazy conversion)
            const file = files[i];
            let imageData: string | undefined;
            
            if (file.file && isImageFile(file.file)) {
              try {
                imageData = await fileToBase64WithCompression(file.file, true);
              } catch (error) {
                console.warn(`Failed to convert image to base64 for ${file.name}:`, error);
              }
            }
            
            const requestPayload = {
              platform: form.platform,
              titleLen: form.titleLen,
              descLen: 150,
              keywordCount: form.keywordCount,
              assetType: form.assetType,
              prefix: form.prefix || undefined,
              suffix: form.suffix || undefined,
              negativeTitle: form.negativeTitle,
              negativeKeywords: form.negativeKeywords,
              model: { provider: form.model.provider, preview: form.model.preview },
              files: [files[i]].map(f => ({ 
                name: f.name, 
                type: f.type, 
                url: f.url, 
                ext: f.ext,
                imageData: imageData // Include base64 data for images
              })),
              videoHints: form.assetType === 'video' ? form.videoHints : undefined,
              singleMode: true,
              isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
              isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
              isVector: form.isVector,
              isIllustration: form.isIllustration
            };
            
            console.log(`📤 API Request (batch mode, file ${i + 1}/${files.length}) for ${files[i].name}:`, {
              toggleValues: {
                isolatedOnTransparentBackground: requestPayload.isolatedOnTransparentBackground,
                isolatedOnWhiteBackground: requestPayload.isolatedOnWhiteBackground,
                isVector: requestPayload.isVector,
                isIllustration: requestPayload.isIllustration
              }
            });
            
            const res = await fetch('/api/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(bearerRef.current ? { Authorization: `Bearer ${bearerRef.current}` } : {})
              },
              body: JSON.stringify(requestPayload)
            });
            
            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              const errorMsg = errorData.message || errorData.error || `Failed to generate metadata for ${files[i].name}`;
              
              // Add error row immediately
              const errorRow: Row = {
                filename: files[i].name,
                platform: form.platform === 'adobe' ? 'Adobe' : form.platform === 'freepik' ? 'Freepik' : 'Shutterstock',
                title: `[ERROR] ${errorMsg}`,
                description: 'Generation failed. Please check your API key and try again.',
                keywords: [],
                assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
                extension: files[i].ext || '',
                error: errorMsg
              };
              allRows.push(errorRow);
              setRows([...allRows]); // Update UI immediately with error
              
              // Remove from generating set
              setGeneratingFiles(prev => {
                const next = new Set(prev);
                next.delete(files[i].name);
                return next;
              });
              continue;
            }
            
            const data = await res.json();
            if (data.rows && data.rows.length > 0) {
              const newRow = data.rows[0];
              allRows.push(newRow);
              // Update UI immediately after each generation
              setRows([...allRows]);
              
              // Remove from generating set
              setGeneratingFiles(prev => {
                const next = new Set(prev);
                next.delete(files[i].name);
                return next;
              });
            }
          } catch (fileError: any) {
            console.error(`Error processing ${files[i].name}:`, fileError);
            // Add error row for this file
            const errorRow: Row = {
              filename: files[i].name,
              platform: form.platform === 'adobe' ? 'Adobe' : form.platform === 'freepik' ? 'Freepik' : 'Shutterstock',
              title: `[ERROR] ${fileError.message || 'Generation failed'}`,
              description: 'Generation failed. Please check your API key and try again.',
              keywords: [],
              assetType: form.assetType === 'auto' ? 'photo' : form.assetType,
              extension: files[i].ext || '',
              error: fileError.message || 'Unknown error'
            };
            allRows.push(errorRow);
            setRows([...allRows]); // Update UI immediately with error
            
            // Remove from generating set
            setGeneratingFiles(prev => {
              const next = new Set(prev);
              next.delete(files[i].name);
              return next;
            });
          }
        }
      }
      
      // Final update with all rows (in case any were missed)
      setRows(allRows);
      setProcessingProgress(100);
      setGeneratingFiles(new Set()); // Clear all generating files
      
      // Track analytics
      if (allRows.length > 0) {
        const successCount = allRows.filter((r: Row) => !r.error).length;
        const errorCount = allRows.length - successCount;
        const qualityScores = allRows
          .filter((r: Row) => !r.error && r.title)
          .map((r: Row) => scoreTitleQuality(r.title || '', r.filename || '', form.titleLen, true, form.platform).score);
        const avgQuality = qualityScores.length > 0 
          ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
          : 0;
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
            avgQualityScore: avgQuality,
            avgTitleLength: Math.round(avgTitleLength),
            avgKeywordCount: Math.round(avgKeywordCount),
            model: form.model.provider
          }
        });
        
        // Save to history
        saveToHistory(allRows, form);
        
        // Update history
        const next = [{ at: Date.now(), count: allRows.length }, ...history].slice(0, 20);
        setHistory(next);
        setJSON('smg_history', next);
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
    setShouldStop(true);
    setBusy(false);
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
          next.set(filename, {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            errorType: event.errorType
          });
          return next;
        });
      }
    });
    
    try {
      // Convert file to base64 if it's an image (lazy conversion)
      let imageData: string | undefined;
      
      if (file.file && isImageFile(file.file)) {
        try {
          imageData = await fileToBase64WithCompression(file.file, true);
        } catch (error) {
          console.warn(`Failed to convert image to base64 for ${file.name}:`, error);
        }
      }
      
      const requestPayload = {
        platform: form.platform,
        titleLen: form.titleLen,
        descLen: 150,
        keywordCount: form.keywordCount,
        assetType: form.assetType,
        prefix: form.prefix || undefined,
        suffix: form.suffix || undefined,
        negativeTitle: form.negativeTitle,
        negativeKeywords: form.negativeKeywords,
        model: { provider: form.model.provider, preview: form.model.preview },
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
        isIllustration: form.isIllustration
      };
      
      console.log(`📤 API Request (regenerate) for ${filename}:`, {
        toggleValues: {
          isolatedOnTransparentBackground: requestPayload.isolatedOnTransparentBackground,
          isolatedOnWhiteBackground: requestPayload.isolatedOnWhiteBackground,
          isVector: requestPayload.isVector,
          isIllustration: requestPayload.isIllustration
        }
      });
      
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerRef.current ? { Authorization: `Bearer ${bearerRef.current}` } : {})
        },
        body: JSON.stringify(requestPayload)
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.error || 'Failed to regenerate metadata';
        setError({
          id: Date.now().toString(),
          message: errorMsg,
          severity: 'error',
          duration: 5000
        });
        return;
      }
      const data = await res.json();
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
    setShouldStop(false);
    setProcessingProgress(0);
    
    try {
      for (let i = 0; i < filesWithResults.length; i++) {
        if (shouldStop) {
          setBusy(false);
          setGeneratingFiles(new Set());
          return;
        }
        
        const file = filesWithResults[i];
        setProcessingProgress(Math.round(((i + 1) / filesWithResults.length) * 100));
        
        // Mark file as generating for animation
        setGeneratingFiles(prev => new Set(prev).add(file.name));
        
        try {
          const requestPayload = {
            platform: form.platform,
            titleLen: form.titleLen,
            descLen: 150,
            keywordCount: form.keywordCount,
            assetType: form.assetType,
            prefix: form.prefix || undefined,
            suffix: form.suffix || undefined,
            negativeTitle: form.negativeTitle,
            negativeKeywords: form.negativeKeywords,
            model: { provider: form.model.provider, preview: form.model.preview },
            files: [file].map(f => ({ name: f.name, type: f.type, url: f.url, ext: f.ext })),
            videoHints: form.assetType === 'video' ? form.videoHints : undefined,
            isolatedOnTransparentBackground: form.isolatedOnTransparentBackground,
            isolatedOnWhiteBackground: form.isolatedOnWhiteBackground,
            isVector: form.isVector,
            isIllustration: form.isIllustration
          };
          
          console.log(`📤 API Request (regenerate all, file ${i + 1}/${filesWithResults.length}) for ${file.name}:`, {
            toggleValues: {
              isolatedOnTransparentBackground: requestPayload.isolatedOnTransparentBackground,
              isolatedOnWhiteBackground: requestPayload.isolatedOnWhiteBackground,
              isVector: requestPayload.isVector,
              isIllustration: requestPayload.isIllustration
            }
          });
          
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(bearerRef.current ? { Authorization: `Bearer ${bearerRef.current}` } : {})
            },
            body: JSON.stringify(requestPayload)
          });
          
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            const errorMsg = errorData.message || errorData.error || `Failed to regenerate metadata for ${file.name}`;
            
            // Update row with error
            setRows(prev => {
              const updated = [...prev];
              const idx = updated.findIndex(r => r.filename === file.name);
              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  title: `[ERROR] ${errorMsg}`,
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
            continue;
          }
          
          const data = await res.json();
          if (data.rows && data.rows.length > 0) {
            // Update row progressively
            setRows(prev => {
              const updated = [...prev];
              const idx = updated.findIndex(r => r.filename === file.name);
              if (idx >= 0) {
                updated[idx] = data.rows[0];
              } else {
                updated.push(data.rows[0]);
              }
              return updated;
            });
          }
          
          // Remove from generating set
          setGeneratingFiles(prev => {
            const next = new Set(prev);
            next.delete(file.name);
            return next;
          });
        } catch (fileError: any) {
          console.error(`Error regenerating ${file.name}:`, fileError);
          // Update row with error
          setRows(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.filename === file.name);
            if (idx >= 0) {
              updated[idx] = {
                ...updated[idx],
                title: `[ERROR] ${fileError.message || 'Regeneration failed'}`,
                error: fileError.message || 'Unknown error'
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
        }
      }
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
    }
  };

  return (
    <>
      <ErrorToastComponent error={error} onDismiss={() => setError(null)} />
      <div className="grid grid-cols-1 lg:grid-cols-[30%_70%] gap-4 sm:gap-6 animate-fade-in">
        {/* Left Sidebar - Settings */}
        <div className="space-y-6">
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-green-accent/20">
              <h2 className="text-xl font-bold text-text-primary">Settings</h2>
              <div className="flex gap-2">
                <TemplateManager 
                  currentForm={form} 
                  onApplyTemplate={(template: FormState) => setForm(template)} 
                />
                <Analytics />
                <HistoryViewer onRestore={(rows) => setRows(rows)} />
              </div>
            </div>
            <APIControls value={form} onChange={setForm} />
          </div>
          <div className="card p-6">
            <AdvancedMetadataControls value={form} onChange={setForm} />
          </div>
          <div className="p-4 bg-gradient-to-r from-green-accent/10 to-teal-accent/10 rounded-lg border border-green-accent/20">
            <p className="text-xs text-text-secondary font-medium">
              Helper: Files are saved in <code className="px-1.5 py-0.5 bg-green-accent/20 rounded border border-green-accent/30 text-green-bright font-bold">/public/uploads</code>. "Clear All" removes them.
            </p>
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
              hasRows={rows.length > 0}
              rows={rows}
              onRegenerate={onRegenerate}
              onRegenerateAll={onRegenerateAll}
              processingProgress={processingProgress}
              onStopProcessing={onStopProcessing}
              onRowsUpdate={setRows}
              generatingFiles={generatingFiles}
              retryingFiles={retryingFiles}
            />
          </div>
        </div>
      </div>
    </>
  );
}


