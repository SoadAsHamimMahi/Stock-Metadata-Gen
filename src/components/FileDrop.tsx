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
  isImageFile 
} from '@/lib/client-file-util';
import RetryIndicator from '@/components/RetryIndicator';

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
  onExportCSV,
  hasRows,
  rows = [],
  onRegenerate,
  onRegenerateAll,
  processingProgress = 0,
  onStopProcessing,
  onRowsUpdate,
  generatingFiles = new Set<string>(),
  retryingFiles = new Map()
}: {
  files: UploadItem[];
  onFilesChange: (f: UploadItem[]) => void;
  onGenerateAll: () => void;
  generating: boolean;
  onExportCSV?: () => void;
  hasRows?: boolean;
  rows?: Row[];
  onRegenerate?: (filename: string) => void;
  onRegenerateAll?: () => void;
  processingProgress?: number;
  onStopProcessing?: () => void;
  onRowsUpdate?: (rows: Row[]) => void;
  generatingFiles?: Set<string>;
  retryingFiles?: Map<string, { attempt: number; maxAttempts: number; errorType?: string }>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing'>('uploading');
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalSize = useMemo(() => {
    return files.reduce((sum, f) => sum + f.size, 0);
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
    await upload(Array.from(dt.files));
  };
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    await upload(Array.from(list));
    // Reset input value using ref (safer than currentTarget which can be null)
    if (inputRef.current) {
      inputRef.current.value = '';
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
        
        // Create UploadItem with File object
        const uploadItem: UploadItem = {
          name: file.name,
          url: previewUrl,
          size: file.size,
          originalSize: file.size, // Will be updated if compression happens later
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
    <div>
      {uploadError && (
        <div className="mb-4 p-3 bg-error/20 border border-error/40 rounded-lg text-error text-sm flex items-center justify-between">
          <span>✗ {uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-error hover:text-error/80 transition-colors">×</button>
        </div>
      )}
      
      {/* Upload Progress Bar */}
      {uploading && (
        <div className="mb-4 p-4 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
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
      {files.length > 0 && (
        <div className="mb-4 text-sm text-text-secondary p-3 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
          <span className="font-bold text-green-bright">{files.length}</span> file{files.length !== 1 ? 's' : ''} uploaded | Total: <span className="font-semibold">{formatSize(totalSize)}</span>
        </div>
      )}

      {/* Upload Zone - Always visible */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-300 mb-6 ${
          files.length > 0 
            ? 'p-4' // Smaller when files exist
            : 'p-12' // Larger when empty
        } ${
          dragOver
            ? 'border-green-bright bg-green-accent/10 shadow-green-glow-lg'
            : 'border-green-accent/30 bg-dark-elevated/30 hover:border-green-accent/50 hover:bg-dark-elevated/50 hover:shadow-green-glow'
        }`}
      >
        {files.length === 0 ? (
          <>
            <div className="text-4xl mb-4 animate-float">📁</div>
            <div className="text-lg font-bold text-text-primary mb-2">Drag & drop files here</div>
            <div className="text-sm text-text-secondary mb-1">or click to select</div>
              <div className="text-xs text-text-tertiary mt-2">
              Supports PNG, JPG, JPEG, WEBP, SVG, EPS, AI, MP4, MOV, M4V, WEBM
            </div>
            <div className="text-xs text-text-tertiary">Max 50MB per file</div>
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
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.svg,.eps,.ai,.mp4,.mov,.m4v,.webm"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {/* Action Bar */}
      {files.length > 0 && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button 
            className="btn btn-secondary text-sm"
            onClick={clearAll}
            disabled={files.length === 0}
          >
            Clear All
          </button>
          <button 
            className={`btn text-base px-6 py-3 flex items-center gap-2 ${(!files.length || generating) ? 'btn-disabled' : ''}`}
            onClick={onGenerateAll}
            disabled={!files.length || generating}
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
            const canRegenerate = filesWithResults.length > 0 && !generating;
            return (
              <button
                className={`btn btn-secondary text-sm flex items-center gap-1 ${!canRegenerate ? 'btn-disabled' : ''}`}
                onClick={onRegenerateAll}
                disabled={!canRegenerate}
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
            >
              <span>📥</span>
              Export CSV
            </button>
          )}
          {onRowsUpdate && hasRows && rows.length > 0 && (
            <BulkEditor 
              rows={rows} 
              onUpdate={onRowsUpdate}
            />
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.svg,.eps,.ai,.mp4,.mov,.m4v,.webm"
            onChange={onPick}
            className="hidden"
          />
        </div>
      )}

      {/* Progress Bar */}
      {generating && processingProgress > 0 && (
        <div className="mb-4 p-4 bg-dark-elevated/50 rounded-lg border border-green-accent/20">
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
            <ProgressIndicator progress={processingProgress} size="md" showPercentage={false} />
          </div>
          <div className="text-xs text-text-secondary text-center font-medium">
            {files.length} file{files.length !== 1 ? 's' : ''} • {processingProgress}% complete
            {retryingFiles.size > 0 && (
              <span className="ml-2 text-yellow-400 animate-pulse">
                • {retryingFiles.size} retrying{retryingFiles.size !== 1 ? '' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-4">
          {files.map((f, index) => {
            const row = rows.find(r => r.filename === f.name);
            const isGenerating = generatingFiles.has(f.name);
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
                  retryInfo={retryingFiles.get(f.name)}
                />
              </div>
            );
          })}
        </div>
      )}
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
  retryInfo
}: {
  file: UploadItem;
  row?: Row;
  formatSize: (bytes: number) => string;
  onDelete: () => void;
  onRegenerate?: (filename: string) => void;
  isGenerating?: boolean;
  retryInfo?: { attempt: number; maxAttempts: number; errorType?: string };
}) {
  const [title, setTitle] = useState(row?.title || '');
  const [revealedKeywords, setRevealedKeywords] = useState<string[]>([]);
  const [titleAnimated, setTitleAnimated] = useState(false);
  const ext = (file.ext || (file.name ? file.name.split('.').pop() : '') || '').toLowerCase();

  // Track previous title to detect when it first appears
  const prevTitleRef = useRef<string>('');
  
  // Reset animation state when regenerating starts
  useEffect(() => {
    if (isGenerating && row) {
      setTitleAnimated(false);
      prevTitleRef.current = '';
    }
  }, [isGenerating, row]);
  
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
  }, [row?.title, titleAnimated]);

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
  }, [row?.keywords, isGenerating]);

  const getPreviewUrl = () => file.url;

  const statusBadge = row 
    ? row.error 
      ? 'badge-error' 
      : 'badge-success'
    : '';

  // Calculate quality score for display
  const qualityScore = useMemo(() => {
    if (!row || !row.title || row.error) return null;
    const platformLower = row.platform.toLowerCase() as 'adobe' | 'freepik' | 'shutterstock';
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
    <div className={`card p-4 card-lift animate-scale-in ${
      isGenerating ? 'border-2 border-green-accent/50 animate-pulse-border' : ''
    }`}>
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
                {file.originalSize && file.originalSize !== file.size ? (
                  <>
                    <span className="line-through text-text-tertiary/50">
                      {formatSize(file.originalSize)}
                    </span>
                    {' → '}
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
              {qualityScore && !row?.error && (
                <div 
                  className={`px-2 py-1 rounded text-xs font-bold border transition-all hover:scale-105 ${getQualityColor(qualityScore.score)}`}
                  title={`Quality: ${qualityScore.score}/100. ${qualityScore.strengths.length > 0 ? 'Strengths: ' + qualityScore.strengths.join(', ') : ''} ${qualityScore.issues.length > 0 ? 'Issues: ' + qualityScore.issues.join(', ') : ''}`}
                >
                  {qualityScore.score}/100
                </div>
              )}
              {statusBadge && (
                <div className={`${statusBadge} transition-all hover:scale-105`}>
                  {row?.error ? 'Error' : 'Complete'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metadata Section */}
        <div className="space-y-3">
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
                  <span className="text-xs text-green-bright animate-pulse">{row ? 'Regenerating...' : 'Generating...'}</span>
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
                {onRegenerate && (
                  <button
                    className={`btn btn-secondary text-sm flex items-center gap-1 ripple-effect ${isGenerating ? 'opacity-75 cursor-not-allowed' : ''}`}
                    onClick={() => !isGenerating && onRegenerate(file.name)}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-green-accent border-t-transparent rounded-full animate-spin"></div>
                        <span>Regenerating...</span>
                      </>
                    ) : (
                      <>
                        <span className="animate-spin-slow">✨</span>
                        <span>Regenerate</span>
                      </>
                    )}
                  </button>
                )}
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


