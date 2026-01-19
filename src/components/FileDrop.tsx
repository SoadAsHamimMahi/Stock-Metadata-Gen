'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Row } from '@/lib/csv';
import BulkEditor from '@/components/BulkEditor';
import SkeletonLoader from '@/components/SkeletonLoader';
import ProgressIndicator from '@/components/ProgressIndicator';
import { scoreTitleQuality } from '@/lib/util';
import { 
  getFilePreviewUrl, 
  revokePreviewUrl, 
  getFileExtension, 
  validateFileSize,
  isImageFile,
  isVideoFile,
  compressImageClient,
  extractVideoFrame
} from '@/lib/client-file-util';
import RetryIndicator from '@/components/RetryIndicator';
import { useGuardedAction } from '@/hooks/useGuardedAction';
import LoginModal from '@/components/LoginModal';

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

export default function FileDrop({
  files,
  onFilesChange,
  onGenerateAll,
  generating,
  generationDisabled = false,
  onExportCSV,
  onExportZIP,
  hasRows,
  rows = [],
  onRegenerate,
  onRegenerateAll,
  onRegenerateFailed,
  processingProgress = 0,
  onStopProcessing,
  onRowsUpdate,
  generatingFiles = new Set<string>(),
  retryingFiles = new Map(),
  fileToWorkerId = new Map<string, number>(),
  successCount = 0,
  failedCount = 0,
  showTransparentPngHint = false
}: {
  files: UploadItem[];
  onFilesChange: (f: UploadItem[]) => void;
  onGenerateAll: () => void;
  generating: boolean;
  generationDisabled?: boolean;
  onExportCSV?: () => void;
  onExportZIP?: () => void;
  hasRows?: boolean;
  rows?: Row[];
  onRegenerate?: (filename: string) => void;
  onRegenerateAll?: () => void;
  onRegenerateFailed?: () => void;
  processingProgress?: number;
  onStopProcessing?: () => void;
  onRowsUpdate?: (rows: Row[]) => void;
  generatingFiles?: Set<string>;
  retryingFiles?: Map<string, { attempt: number; maxAttempts: number; errorType?: string }>;
  fileToWorkerId?: Map<string, number>;
  successCount?: number;
  failedCount?: number;
  // When true, show a PNG transparency hint under the action buttons.
  showTransparentPngHint?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing'>('uploading');
  const inputRef = useRef<HTMLInputElement>(null);
  const { executeGuarded, loginModalOpen, setLoginModalOpen, reason, handleLoginSuccess } = useGuardedAction();
  const hideSetupUI = generating;
  const startProcessingDisabled = generationDisabled;

  // Total sizes: original (what user uploaded) vs compressed (what is sent to AI)
  const totalCompressedSize = useMemo(() => {
    return files.reduce((sum, f) => sum + f.size, 0);
  }, [files]);

  const totalOriginalSize = useMemo(() => {
    return files.reduce((sum, f) => sum + (f.originalSize ?? f.size), 0);
  }, [files]);

  const anyCompressed = useMemo(() => {
    return files.some(f => f.originalSize && f.originalSize !== f.size);
  }, [files]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Cleanup blob URLs when files are removed
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.url && f.url.startsWith('blob:')) {
          revokePreviewUrl(f.url);
        }
      });
    };
  }, [files]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    
    executeGuarded(async () => {
      await upload(Array.from(dt.files));
    }, 'Please sign in to upload images.');
  };
  
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    
    executeGuarded(async () => {
      await upload(Array.from(list));
      // Reset input value using ref (safer than currentTarget which can be null)
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }, 'Please sign in to upload images.');
  };
  
  const handleUploadClick = (e: React.MouseEvent) => {
    // Don't prevent default or stop propagation - let the click work naturally
    // Only prevent if clicking on a button or interactive element inside
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return; // Don't trigger file picker if clicking a button
    }
    
    // Check if inputRef is available
    if (!inputRef.current) {
      console.error('File input ref is not available');
      // Try to find the input element directly as fallback
      const inputElement = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (inputElement) {
        inputElement.value = '';
        inputElement.click();
        return;
      }
      return;
    }
    
    // Reset input value first to ensure file picker opens (important for re-selection)
    inputRef.current.value = '';
    
    // Force a reflow to ensure the value reset is processed
    void inputRef.current.offsetHeight;
    
    // Directly click the input - don't guard this, allow file selection always
    // Login check happens in onPick when files are actually selected
    try {
      inputRef.current.click();
    } catch (error) {
      console.error('Error clicking file input:', error);
      // Fallback: try again after a small delay
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.click();
        }
      }, 10);
    }
  };
  const upload = async (fileList: File[]) => {
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);
    setUploadPhase('processing');
    
    try {
      const newFiles: UploadItem[] = [];
      const totalFiles = fileList.length;
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        // Update progress
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        
        // Validate file size
        if (!validateFileSize(file)) {
          console.warn(`File ${file.name} exceeds size limit, skipping`);
          continue;
        }
        
        // Get file extension
        const ext = getFileExtension(file.name);
        
        // Create preview URL
        const previewUrl = getFilePreviewUrl(file);
        
        // Compress image/video immediately on upload and calculate compressed size
        let compressedSize = file.size;
        const originalSize = file.size;
        
        if (isImageFile(file) || isVideoFile(file)) {
          try {
            // For images: compress and get the compressed file size
            if (isImageFile(file)) {
              const compressedFile = await compressImageClient(file, {
                maxWidth: 2048,
                maxHeight: 2048,
                quality: 0.5,
                format: 'jpeg'
              });
              compressedSize = compressedFile.size;
              console.log(`ðŸ“Š Upload compression for ${file.name}: Original=${originalSize} bytes, Compressed=${compressedSize} bytes (${((1 - compressedSize / originalSize) * 100).toFixed(1)}% reduction)`);
            } 
            // For videos: extract frame and estimate size (frame is already compressed)
            else if (isVideoFile(file)) {
              const frameData = await extractVideoFrame(file);
              // Estimate size from base64 data URL
              const commaIndex = frameData.indexOf(',');
              if (commaIndex !== -1) {
                const base64 = frameData.slice(commaIndex + 1);
                const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
                compressedSize = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
                console.log(`ðŸ“Š Upload compression for ${file.name} (video frame): Original=${originalSize} bytes, Compressed frame=${compressedSize} bytes (${((1 - compressedSize / originalSize) * 100).toFixed(1)}% reduction)`);
              }
            }
          } catch (error) {
            console.warn(`Compression failed for ${file.name}, using original size:`, error);
            compressedSize = originalSize;
          }
        }
        
        // Create UploadItem with File object and compressed size
        const uploadItem: UploadItem = {
          name: file.name,
          url: previewUrl,
          size: compressedSize, // Compressed size (what will be sent to AI)
          originalSize: originalSize, // Original file size
          type: file.type,
          ext: ext,
          file: file // Store the File object
        };
        
        newFiles.push(uploadItem);
      }
      
      // Add new files to existing files
      onFilesChange([...(files || []), ...newFiles]);
      
      // Reset progress after a short delay
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadPhase('uploading');
      }, 500);
    } catch (error: any) {
      setUploadError(error.message || 'Failed to process files. Please try again.');
      setUploading(false);
      setUploadProgress(0);
      setUploadPhase('uploading');
    }
  };

  const clearAll = () => {
    if (!confirm('Delete all uploaded files?')) return;
    
    // Revoke all blob URLs before clearing
    files.forEach(f => {
      if (f.url && f.url.startsWith('blob:')) {
        revokePreviewUrl(f.url);
      }
    });
    
    // Reset file input to allow new file selection
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    
    onFilesChange([]);
  };
  
  const delOne = (name: string) => {
    const fileToRemove = files.find(f => f.name === name);
    
    // Revoke blob URL if it exists
    if (fileToRemove?.url && fileToRemove.url.startsWith('blob:')) {
      revokePreviewUrl(fileToRemove.url);
    }
    
    onFilesChange(files.filter(f => f.name !== name));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 space-y-4">
        {uploadError && (
          <div className="p-3 bg-error/20 border border-error/40 rounded-lg text-error text-sm flex items-center justify-between">
          <span>✗ {uploadError}</span>
            <button onClick={() => setUploadError(null)} className="text-error hover:text-error/80 transition-colors">Ã—</button>
          </div>
        )}
        
        {/* Upload Progress Bar */}
        {uploading && (
          <div className="p-4 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">
                  {uploadPhase === 'uploading' ? 'Uploading Files' : 'Processing Files'}
                </span>
                <span className="text-sm font-bold text-green-bright">{uploadProgress}%</span>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill animate-pulse-glow" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
            <ProgressIndicator progress={uploadProgress} size="md" showPercentage={false} />
          </div>
          <div className="text-xs text-text-secondary text-center font-medium">
            {uploadPhase === 'uploading' 
              ? `Uploading files... ${uploadProgress}% complete`
              : `Processing files... ${uploadProgress}% complete`}
          </div>
        </div>
        )}
        {files.length > 0 && !hideSetupUI && (
          <div className="text-sm text-text-secondary p-3 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
          <span className="font-bold text-green-bright">{files.length}</span>{' '}
          file{files.length !== 1 ? 's' : ''} uploaded |{' '}
          {anyCompressed ? (
            <>
              Original total:{' '}
              <span className="font-semibold line-through text-text-tertiary/60">
                {formatSize(totalOriginalSize)}
              </span>
              {' â†’ '}
              <span className="font-semibold text-green-bright">
                {formatSize(totalCompressedSize)}
              </span>
              {totalOriginalSize > 0 && (
                <span className="ml-1 text-green-400">
                  ({Math.round((1 - totalCompressedSize / totalOriginalSize) * 100)}% smaller)
                </span>
              )}
            </>
          ) : (
            <>
              Total:{' '}
              <span className="font-semibold">
                {formatSize(totalOriginalSize)}
              </span>
            </>
          )}
        </div>
        )}

        {/* Upload Zone - Always visible */}
        {!hideSetupUI && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={handleUploadClick}
            className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 ${
            files.length > 0 
              ? 'p-4' // Smaller when files exist
              : 'p-12' // Larger when empty
          } ${
            dragOver
              ? 'border-green-bright bg-green-accent/10 shadow-green-glow-lg'
              : 'border-green-accent/30 bg-dark-elevated/30 hover:border-green-accent/50 hover:bg-dark-elevated/50 hover:shadow-green-glow'
          }`}
        >
          <div className="upload-zone-content">
            {files.length === 0 ? (
              <>
                <div className="text-4xl mb-4 animate-float">📁</div>
                <div className="text-lg font-bold text-text-primary mb-2">Drag &amp; drop files here</div>
                <div className="text-sm text-text-secondary mb-1">or click to select</div>
                <div className="text-xs text-text-tertiary mt-2">
                  Supports PNG, JPG, JPEG, WEBP, SVG, EPS, AI, MP4, MOV, M4V, WEBM
                </div>
                <div className="text-xs text-text-tertiary">Max 150MB per file</div>
              </>
            ) : (
              <>
                <div className="text-2xl mb-2">📁</div>
                <div className="text-sm font-bold text-text-secondary">Drop more files here or click to add</div>
                <div className="text-xs text-text-tertiary mt-1">
                  Supports PNG, JPG, JPEG, WEBP, SVG, EPS, AI, MP4, MOV, M4V, WEBM
                </div>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.svg,.eps,.ai,.mp4,.mov,.m4v,.webm"
            onChange={onPick}
            className="hidden"
            style={{ display: 'none' }}
          />
        </div>
        )}

        {/* Action Bar */}
        {files.length > 0 && !hideSetupUI && (
          <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
          <button 
            className="btn btn-secondary text-sm"
            onClick={clearAll}
            disabled={files.length === 0}
          >
            Clear All
          </button>
          <button 
            className={`btn text-base px-6 py-3 flex items-center gap-2 ${(!files.length || generating || startProcessingDisabled) ? 'btn-disabled' : ''}`}
            onClick={onGenerateAll}
            disabled={!files.length || generating || startProcessingDisabled}
            title={startProcessingDisabled ? 'Text Prompt is preview-only. Switch to Metadata tab to generate.' : 'Process all uploaded files at once (faster for multiple files)'}
          >
            <span>✨</span>
            {generating ? (
              <>
                <span className="animate-pulse">Generating…</span>
                {processingProgress > 0 && <span className="text-xs">({processingProgress}%)</span>}
              </>
            ) : (
              `Generate All (${files.length})`
            )}
          </button>
          {onRegenerateAll && (() => {
            const filesWithResults = files.filter(f => rows.some(r => r.filename === f.name));
            const canRegenerate = filesWithResults.length > 0 && !generating && !startProcessingDisabled;
            return (
              <button
                className={`btn btn-secondary text-sm flex items-center gap-1 ${!canRegenerate ? 'btn-disabled' : ''}`}
                onClick={onRegenerateAll}
                disabled={!canRegenerate}
                title={startProcessingDisabled ? 'Text Prompt is preview-only. Switch to Metadata tab to generate.' : 'Regenerate metadata for all files (use after changing settings)'}
              >
                {generating && filesWithResults.length > 0 ? (
                  <>
                    <div className="w-4 h-4 border-2 border-green-accent border-t-transparent rounded-full animate-spin"></div>
                    <span>Regenerating...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Regenerate All ({filesWithResults.length})</span>
                  </>
                )}
              </button>
            );
          })()}
          {onRegenerateFailed && (() => {
            const failedFiles = files.filter(f => {
              const row = rows.find(r => r.filename === f.name);
              // Only count actual errors (not word count warnings)
              if (!row?.error) return false;
              // Word count warnings are not failures (prompt was generated)
              if (row.error.startsWith('Warning:')) return false;
              // For prompt mode: only count as failed if no prompt was generated
              if (row.generatedPrompt) return false;
              return true;
            });
            const canRegenerateFailed = failedFiles.length > 0 && !generating && !startProcessingDisabled;
            return (
              <button
                className={`btn btn-secondary text-sm flex items-center gap-1 ${!canRegenerateFailed ? 'btn-disabled' : ''}`}
                onClick={onRegenerateFailed}
                disabled={!canRegenerateFailed}
                title={startProcessingDisabled ? 'Text Prompt is preview-only. Switch to Metadata tab to generate.' : 'Regenerate metadata for failed files only (use when some files had errors)'}
              >
                {generating && failedFiles.length > 0 ? (
                  <>
                    <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Retrying...</span>
                  </>
                ) : (
                  <>
                    <span>🔄</span>
                    <span>Retry Failed ({failedFiles.length})</span>
                  </>
                )}
              </button>
            );
          })()}
          {generating && onStopProcessing && (
            <button 
              className="btn btn-secondary text-sm"
              onClick={onStopProcessing}
            >
              Stop Processing
            </button>
          )}
          {onExportCSV && (
            <button 
              className={`btn btn-secondary text-sm flex items-center gap-1 ${!hasRows ? 'btn-disabled' : ''}`}
              onClick={onExportCSV}
              disabled={!hasRows}
              title="Export all metadata as a single CSV file (standard format)"
            >
              <span>📥</span>
              Export CSV
            </button>
          )}
          {onExportZIP && (
            <button 
              className={`btn btn-secondary text-sm flex items-center gap-1 ${!hasRows ? 'btn-disabled' : ''}`}
              onClick={onExportZIP}
              disabled={!hasRows}
              title="Download a ZIP with CSVs for all formats (JPG, PNG, SVG, EPS, AI, WebP, video) - each CSV contains all your files with that format's extension"
            >
              <span>📦</span>
              Export ZIP (Multi-CSV)
            </button>
          )}
          {onRowsUpdate && hasRows && rows.length > 0 && (
            <BulkEditor 
              rows={rows} 
              onUpdate={onRowsUpdate}
            />
          )}
          </div>
          {!hideSetupUI && showTransparentPngHint && (
            <div className="text-xs text-amber-100 bg-amber-500/10 border border-amber-400/40 rounded-md px-3 py-2 flex items-start gap-2">
              <span>⚠️</span>
              <span>
                PNG file detected. If this artwork has a transparent background, enable
                <span className="font-semibold text-amber-200"> &quot;isolated on transparent background&quot;</span>{' '}
                in the File Type Attributes panel for the most accurate titles and keywords.
              </span>
            </div>
          )}
        </div>
        )}

        {/* Progress Bar */}
        {generating && (
          <div className="p-4 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-text-primary">Processing Files</span>
                <span className="text-sm font-bold text-green-bright">{processingProgress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill animate-pulse-glow" style={{ width: `${processingProgress}%` }}></div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {onStopProcessing && (
                <button
                  className="btn btn-secondary text-sm whitespace-nowrap"
                  onClick={onStopProcessing}
                >
                  Stop
                </button>
              )}
              <ProgressIndicator progress={processingProgress} size="md" showPercentage={false} />
            </div>
          </div>
          <div className="text-xs text-text-secondary text-center font-medium">
            {files.length} file{files.length !== 1 ? 's' : ''} • {processingProgress}% complete
            {successCount > 0 && (
              <span className="ml-2 text-green-400">
                • {successCount} processed
              </span>
            )}
            {failedCount > 0 && (
              <span className="ml-2 text-red-400">
                • {failedCount} failed
              </span>
            )}
            {retryingFiles.size > 0 && (
              <span className="ml-2 text-yellow-400 animate-pulse">
                • {retryingFiles.size} retrying{retryingFiles.size !== 1 ? '' : ''}
              </span>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Scrollable Card Container */}
      {files.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-4">
            {files.map((f, index) => {
              const row = rows.find(r => r.filename === f.name);
              const isGenerating = generatingFiles.has(f.name);
              const workerId = fileToWorkerId.get(f.name);
              // Always show FileCard - it handles loading/empty states internally
              // This prevents cards from disappearing when switching between skeleton and card
              return (
                <div key={f.name} className="animate-scale-in" style={{ animationDelay: `${index * 0.05}s` }}>
                  <FileCard
                    file={f}
                    row={row}
                    formatSize={formatSize}
                    onDelete={() => delOne(f.name)}
                    onRegenerate={onRegenerate}
                    isGenerating={isGenerating}
                    generationDisabled={startProcessingDisabled}
                    retryInfo={retryingFiles.get(f.name)}
                    workerId={workerId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <LoginModal 
        open={loginModalOpen} 
        onOpenChange={setLoginModalOpen}
        reason={reason}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}

function FileCard({
  file,
  row,
  formatSize,
  onDelete,
  onRegenerate,
  isGenerating = false,
  generationDisabled = false,
  retryInfo,
  workerId
}: {
  file: UploadItem;
  row?: Row;
  formatSize: (bytes: number) => string;
  onDelete: () => void;
  onRegenerate?: (filename: string) => void;
  isGenerating?: boolean;
  generationDisabled?: boolean;
  retryInfo?: { attempt: number; maxAttempts: number; errorType?: string };
  workerId?: number;
}) {
  const [title, setTitle] = useState(row?.title || '');
  const [revealedKeywords, setRevealedKeywords] = useState<string[]>([]);
  const [titleAnimated, setTitleAnimated] = useState(false);
  const ext = (file.ext || (file.name ? file.name.split('.').pop() : '') || '').toLowerCase();

  // Track previous title to detect when it first appears
  const prevTitleRef = useRef<string>('');
  // Auto-scroll: only when this card STARTS generating (false -> true)
  const cardRef = useRef<HTMLDivElement>(null);
  const wasGeneratingRef = useRef<boolean>(false);
  
  // Reset animation state when regenerating starts
  useEffect(() => {
    if (isGenerating && row) {
      setTitleAnimated(false);
      prevTitleRef.current = '';
    }
  }, [isGenerating, row]);

  // Scroll the generating card into view so the user sees progress immediately
  useEffect(() => {
    if (isGenerating && !wasGeneratingRef.current) {
      const el = cardRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight;
        const fullyInView = rect.top >= 0 && rect.bottom <= viewportH;

        if (!fullyInView) {
          requestAnimationFrame(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        }
      }
    }

    wasGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  
  useEffect(() => {
    if (row?.title) {
      setTitle(row.title);
      // Trigger title animation when title first appears (was empty, now has value) or when regenerated
      if (row.title && (!prevTitleRef.current || (prevTitleRef.current && prevTitleRef.current !== row.title)) && !titleAnimated) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          setTitleAnimated(true);
        }, 50);
      }
      prevTitleRef.current = row.title;
    } else if (!row) {
      // Reset animation state when row is cleared
      setTitleAnimated(false);
      prevTitleRef.current = '';
    }
  }, [row, titleAnimated]);

  // Progressive keyword reveal with animation
  useEffect(() => {
    // Reset revealed keywords when regenerating starts
    if (isGenerating && row) {
      setRevealedKeywords([]);
      return;
    }
    
    if (row?.keywords && row.keywords.length > 0) {
      // Reset revealed keywords when keywords change
      setRevealedKeywords([]);
      
      // Reveal keywords one by one with staggered delay
      const timeouts: NodeJS.Timeout[] = [];
      row.keywords.forEach((keyword, index) => {
        const timeout = setTimeout(() => {
          setRevealedKeywords(prev => {
            // Only add if not already in the array
            if (!prev.includes(keyword)) {
              return [...prev, keyword];
            }
            return prev;
          });
        }, index * 80); // 80ms delay between each keyword
        timeouts.push(timeout);
      });
      
      // Cleanup timeouts on unmount or when keywords change
      return () => {
        timeouts.forEach(clearTimeout);
      };
    } else {
      setRevealedKeywords([]);
    }
  }, [row, isGenerating]);

  const getPreviewUrl = () => file.url;

  // For prompt mode: Only show error if prompt generation actually failed (no prompt generated)
  // Word count warnings should not be treated as errors since prompt was generated successfully
  const isActualError = row?.error && (
    // If it's a word count warning, it's not an error (prompt was generated)
    row.error.startsWith('Warning:') 
      ? false 
      // For prompt mode: error only if no prompt was generated
      : row.generatedPrompt 
        ? false 
        : true
  );

  const statusBadge = row 
    ? isActualError
      ? 'badge-error' 
      : 'badge-success'
    : '';

  // Calculate quality score for display
  const qualityScore = useMemo(() => {
    if (!row || !row.title || isActualError) return null;
    const platformLower = row.platform.toLowerCase() as 'general' | 'adobe' | 'shutterstock';
    const hasImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    // Use title length as expected length (or default to 200)
    const expectedLength = Math.min(row.title.length + 20, 200);
    return scoreTitleQuality(row.title, file.name, expectedLength, hasImage, platformLower);
  }, [row, file.name, ext]);

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  };

  return (
    <div
      ref={cardRef}
      className={`card p-4 card-lift animate-scale-in ${
      isGenerating ? 'border-2 border-green-accent/50 animate-pulse-border' : ''
    }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
        {/* Image Preview */}
        <div className="relative group">
          <button
            onClick={onDelete}
            className="absolute top-2 right-2 z-10 bg-error hover:bg-error/80 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <div className="aspect-square bg-dark-surface rounded-lg overflow-hidden border border-green-accent/20 group/image">
            {['png','jpg','jpeg','webp','svg'].includes(ext) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getPreviewUrl()} alt={file.name} className="w-full h-full object-cover transition-transform duration-300 group-hover/image:scale-110" />
            ) : ['mp4','mov','m4v','webm'].includes(ext) ? (
              <video className="w-full h-full object-cover" src={getPreviewUrl()} controls preload="metadata" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-green-accent/20 text-sm font-bold uppercase text-green-bright">
                {ext} vector
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary truncate">{file.name}</div>
              <div className="text-xs text-text-tertiary">
                {file.originalSize && file.originalSize > 0 && file.size > 0 && file.originalSize !== file.size ? (
                  <>
                    <span className="line-through text-text-tertiary/50">
                      {formatSize(file.originalSize)}
                    </span>
                    {' â†’ '}
                    <span className="text-green-bright font-semibold">
                      {formatSize(file.size)}
                    </span>
                    <span className="ml-1 text-green-400">
                      ({Math.round((1 - file.size / file.originalSize) * 100)}% smaller)
                    </span>
                  </>
                ) : (
                  formatSize(file.size)
                )}
                {' • .'}{file.ext}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {qualityScore && !isActualError && (
                <div 
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all hover:scale-105 ${getQualityColor(qualityScore.score)}`}
                  title={`Quality: ${qualityScore.score}/100. ${qualityScore.strengths.length > 0 ? 'Strengths: ' + qualityScore.strengths.join(', ') : ''} ${qualityScore.issues.length > 0 ? 'Issues: ' + qualityScore.issues.join(', ') : ''}`}
                >
                  {qualityScore.score}/100
                </div>
              )}
              {statusBadge && (
                <div className={`${statusBadge} transition-all hover:scale-105`}>
                  {isActualError ? 'Error' : 'Complete'}
                </div>
              )}
            </div>
          </div>
          
        </div>

        {/* Metadata Section */}
        <div className="space-y-3">
          {/* Show prompt if available, otherwise show title/keywords */}
          {row?.generatedPrompt ? (
            /* Prompt Mode Display */
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label text-text-secondary">Generated Prompt</label>
                <div className="flex items-center gap-2">
                  {retryInfo && (
                    <RetryIndicator
                      attempt={retryInfo.attempt}
                      maxAttempts={retryInfo.maxAttempts}
                      errorType={retryInfo.errorType as 'overloaded' | 'rate-limit' | 'server-error' | undefined}
                      className="text-xs"
                    />
                  )}
                  {row && !isGenerating && !retryInfo && <span className="text-xs text-text-tertiary">{row.generatedPrompt.length} chars</span>}
                  {isGenerating && !retryInfo && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-bright animate-pulse">{row ? 'Regenerating...' : 'Generating...'}</span>
                      {workerId !== undefined && (
                        <span className="text-xs px-2 py-0.5 bg-green-accent/20 text-green-bright rounded border border-green-accent/30 font-semibold">
                          API{workerId + 1}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {isGenerating || retryInfo ? (
                <div className="textarea min-h-[150px] flex items-center justify-center bg-dark-surface/30 border border-green-accent/20 rounded-lg">
                  <div className="flex items-center gap-2 text-text-tertiary">
                    {retryInfo ? (
                      <>
                        <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                        <RetryIndicator
                          attempt={retryInfo.attempt}
                          maxAttempts={retryInfo.maxAttempts}
                          errorType={retryInfo.errorType as 'overloaded' | 'rate-limit' | 'server-error' | undefined}
                          className="text-sm"
                        />
                      </>
                    ) : (
                      <>
                        <div className="w-4 h-4 border-2 border-green-accent border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm">{row ? 'Regenerating prompt...' : 'Generating prompt...'}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <textarea
                  className="textarea min-h-[150px] bg-green-500/10 border-green-500/30"
                  value={row.generatedPrompt}
                  readOnly
                  placeholder="Prompt will appear here..."
                />
              )}
              {row && (
                <div className="flex gap-2 mt-2">
                  <CopyBtn label="Copy Prompt" text={row.generatedPrompt} />
                </div>
              )}
            </div>
          ) : (
            /* Metadata Mode Display */
            <>
              {/* Title Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label text-text-secondary">Title</label>
                  <div className="flex items-center gap-2">
                    {retryInfo && (
                      <RetryIndicator
                        attempt={retryInfo.attempt}
                        maxAttempts={retryInfo.maxAttempts}
                        errorType={retryInfo.errorType as 'overloaded' | 'rate-limit' | 'server-error' | undefined}
                        className="text-xs"
                      />
                    )}
                    {row && !isGenerating && !retryInfo && <span className="text-xs text-text-tertiary">{title.length} chars</span>}
                    {isGenerating && !retryInfo && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-green-bright animate-pulse">{row ? 'Regenerating...' : 'Generating...'}</span>
                        {workerId !== undefined && (
                          <span className="text-xs px-2 py-0.5 bg-green-accent/20 text-green-bright rounded border border-green-accent/30 font-semibold">
                            API{workerId + 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {isGenerating || retryInfo ? (
                  <div className="textarea min-h-[80px] flex items-center justify-center bg-dark-surface/30 border border-green-accent/20 rounded-lg">
                    <div className="flex items-center gap-2 text-text-tertiary">
                      {retryInfo ? (
                        <>
                          <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                          <RetryIndicator
                            attempt={retryInfo.attempt}
                            maxAttempts={retryInfo.maxAttempts}
                            errorType={retryInfo.errorType as 'overloaded' | 'rate-limit' | 'server-error' | undefined}
                            className="text-sm"
                          />
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 border-2 border-green-accent border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm">{row ? 'Regenerating title...' : 'Generating title...'}</span>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <textarea
                    className={`textarea min-h-[80px] transition-all duration-300 ${
                      titleAnimated && row?.title 
                        ? 'animate-fade-in-up' 
                        : ''
                    }`}
                    value={row ? title : ''}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={row ? "Title appears here..." : "Waiting to generate..."}
                    disabled={!row}
                    style={{
                      animation: titleAnimated && row?.title ? 'fadeInUp 0.5s ease-out' : undefined
                    }}
                  />
                )}
                {row && (
                  <div className="flex gap-2 mt-2">
                    <CopyBtn label="Copy Title" text={title} />
                  </div>
                )}
              </div>

              {/* Keywords Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label text-text-secondary">
                    Keywords ({row ? row.keywords.length : 0})
                  </label>
                  {isGenerating && !row && (
                    <span className="text-xs text-green-bright animate-pulse">Generating...</span>
                  )}
                </div>
                {isGenerating ? (
                  <div className="min-h-[60px] p-3 border border-green-accent/20 rounded-lg bg-dark-surface/30 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-text-tertiary">
                      <div className="w-4 h-4 border-2 border-green-accent border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-sm">{row ? 'Regenerating keywords...' : 'Generating keywords...'}</span>
                    </div>
                  </div>
                ) : row && row.keywords.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2 mb-2 min-h-[60px] p-3 border border-green-accent/20 rounded-lg bg-dark-surface/30">
                      {revealedKeywords.map((kw, i) => (
                        <span
                          key={`${kw}-${i}`}
                          className="keyword-tag animate-fade-in-scale"
                          style={{
                            animation: `fadeInScale 0.3s ease-out ${i * 0.08}s both`
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                      {/* Show placeholder for keywords not yet revealed */}
                      {row.keywords.length > revealedKeywords.length && (
                        <span className="keyword-tag opacity-30 border-dashed">
                          ...
                        </span>
                      )}
                    </div>
                    {revealedKeywords.length === row.keywords.length && (
                      <CopyBtn label="Copy Keywords" text={row.keywords.join('; ')} />
                    )}
                  </>
                ) : (
                  <div className="min-h-[60px] p-3 border border-green-accent/20 rounded-lg bg-dark-surface/30 text-text-tertiary text-sm flex items-center justify-center">
                    Keywords will appear here...
                  </div>
                )}
              </div>
            </>
          )}
          
          {/* Generate/Regenerate Button - Bottom Right */}
          {onRegenerate && (
            <div className="flex justify-end mt-4">
              <button
                className={`btn text-sm flex items-center gap-1.5 ripple-effect ${isGenerating || generationDisabled ? 'opacity-75 cursor-not-allowed' : ''}`}
                onClick={() => !isGenerating && !generationDisabled && onRegenerate(file.name)}
                disabled={isGenerating || generationDisabled}
                title={
                  generationDisabled
                    ? 'Text Prompt is preview-only. Switch to Metadata tab to generate.'
                    : row?.error 
                      ? "Retry this failed file (API quota may have been exceeded)" 
                      : row 
                        ? "Regenerate metadata for this file (use if you're not satisfied with results)" 
                        : "Process this single file (use when you want to test one file first)"
                }
              >
                {isGenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{row ? 'Regenerating...' : 'Generating...'}</span>
                  </>
                ) : (
                  <>
                    <span className="text-base">✨</span>
                    <span>{isActualError ? 'Retry' : row ? 'Regenerate' : 'Generate'}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ label, text }: { label: string; text: string }) {
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (canCopy) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  return (
    <button
      className={`btn btn-ghost text-sm flex items-center gap-1 ripple-effect ${canCopy ? '' : 'btn-disabled'}`}
      onClick={handleCopy}
      disabled={!canCopy}
      title={`Copy ${label}`}
    >
      <span className={copied ? 'animate-bounce-in' : ''}>{copied ? '✓' : '📋'}</span>
      {copied ? 'Copied!' : label}
    </button>
  );
}



