'use client';

import { useMemo } from 'react';
import type { Row } from '@/lib/csv';
import { scoreTitleQuality } from '@/lib/util';

export default function Preview({ row, platform }: { row: Row; platform: 'adobe' | 'freepik' | 'shutterstock' }) {
  const validation = useMemo(() => {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Title validation
    if (!row.title || row.title.trim().length === 0) {
      issues.push('Title is empty');
    } else {
      const maxLen = 200;
      if (row.title.length > maxLen) {
        issues.push(`Title exceeds ${maxLen} character limit (${row.title.length} chars)`);
      }
      if (row.title.length < 10) {
        warnings.push('Title is quite short (less than 10 characters)');
      }
    }
    
    // Description validation
    if (!row.description || row.description.trim().length === 0) {
      issues.push('Description is empty');
    } else if (row.description.length > 150) {
      issues.push(`Description exceeds 150 character limit (${row.description.length} chars)`);
    }
    
    // Keywords validation
    if (!row.keywords || !Array.isArray(row.keywords)) {
      issues.push('Keywords is not an array');
    } else {
      if (row.keywords.length === 0) {
        issues.push('No keywords provided');
      }
      if (row.keywords.length < 10) {
        warnings.push(`Only ${row.keywords.length} keywords (recommended: 30-50)`);
      }
      
      // Check for duplicates
      const lowerKeywords = row.keywords.map(k => k.toLowerCase());
      const duplicates = lowerKeywords.filter((k, i) => lowerKeywords.indexOf(k) !== i);
      if (duplicates.length > 0) {
        issues.push(`Duplicate keywords: ${[...new Set(duplicates)].join(', ')}`);
      }
      
      // Check for banned words
      const banned = ['professional', 'high quality', 'stock', 'commercial', 'royalty free'];
      const bannedFound = row.keywords.filter(k => banned.some(b => k.toLowerCase().includes(b)));
      if (bannedFound.length > 0) {
        issues.push(`Banned keywords found: ${bannedFound.join(', ')}`);
      }
    }
    
    // Quality scoring
    const qualityScore = scoreTitleQuality(
      row.title || '',
      row.filename || '',
      200,
      true, // Assume image was provided
      platform
    );
    
    return { issues, warnings, qualityScore };
  }, [row, platform]);
  
  const isValid = validation.issues.length === 0;
  const hasWarnings = validation.warnings.length > 0;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-text-primary">Preview & Validation</h3>
        <div className={`px-3 py-1 rounded-lg text-xs font-medium ${
          isValid ? 'badge-success' : 'badge-error'
        }`}>
          {isValid ? 'Valid' : `${validation.issues.length} Issue(s)`}
        </div>
      </div>
      
      {/* Title Preview */}
      <div>
        <div className="text-sm font-medium mb-2 text-text-secondary">Title</div>
        <div className="p-3 bg-dark-surface/50 rounded-lg border border-green-accent/20">
          <div className="text-sm text-text-primary">{row.title || '(empty)'}</div>
          <div className="text-xs text-text-tertiary mt-2">
            {row.title?.length || 0} characters
            {row.title && row.title.length > 200 && (
              <span className="text-error ml-2">(Exceeds 200 char limit)</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Description Preview */}
      <div>
        <div className="text-sm font-medium mb-2 text-text-secondary">Description</div>
        <div className="p-3 bg-dark-surface/50 rounded-lg border border-green-accent/20">
          <div className="text-sm text-text-primary">{row.description || '(empty)'}</div>
          <div className="text-xs text-text-tertiary mt-2">
            {row.description?.length || 0} characters
            {row.description && row.description.length > 150 && (
              <span className="text-error ml-2">(Exceeds 150 char limit)</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Keywords Preview */}
      <div>
        <div className="text-sm font-medium mb-2 text-text-secondary">Keywords ({row.keywords?.length || 0})</div>
        <div className="p-3 bg-dark-surface/50 rounded-lg border border-green-accent/20">
          <div className="flex flex-wrap gap-2">
            {row.keywords?.slice(0, 20).map((kw, i) => (
              <span key={i} className="keyword-tag">
                {kw}
              </span>
            ))}
            {row.keywords && row.keywords.length > 20 && (
              <span className="text-xs text-text-tertiary">+{row.keywords.length - 20} more</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Quality Score */}
      <div>
        <div className="text-sm font-medium mb-2 text-text-secondary">Quality Score</div>
        <div className="p-3 bg-dark-surface/50 rounded-lg border border-green-accent/20">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className={`text-3xl font-bold ${
                validation.qualityScore.score >= 70 ? 'text-success' : 
                validation.qualityScore.score >= 50 ? 'text-warning' : 'text-error'
              }`}>
                {validation.qualityScore.score}/100
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                {validation.qualityScore.strengths.length > 0 && (
                  <div className="text-success">
                    ✓ {validation.qualityScore.strengths.join(', ')}
                  </div>
                )}
              </div>
            </div>
            <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center"
              style={{
                borderColor: validation.qualityScore.score >= 70 ? '#10b981' : validation.qualityScore.score >= 50 ? '#f59e0b' : '#ef4444',
                borderTopColor: 'transparent',
                transform: `rotate(${(validation.qualityScore.score / 100) * 360 - 90}deg)`
              }}
            >
              <div className="text-xs font-medium">{validation.qualityScore.score}%</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Issues */}
      {validation.issues.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2 text-error">Issues</div>
          <div className="p-3 bg-error/10 rounded-lg border border-error/30">
            <ul className="text-xs space-y-1.5">
              {validation.issues.map((issue, i) => (
                <li key={i} className="text-error">• {issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2 text-warning">Warnings</div>
          <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
            <ul className="text-xs space-y-1.5">
              {validation.warnings.map((warning, i) => (
                <li key={i} className="text-warning">• {warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      
      {/* Platform-specific rules */}
      <div>
        <div className="text-sm font-medium mb-2 text-text-secondary">Platform Rules</div>
        <div className="p-3 bg-dark-surface/30 rounded-lg border border-green-accent/20">
          <div className="text-xs text-text-tertiary space-y-1">
            {platform === 'adobe' && (
              <>
                <div>• Title can be up to 200 characters</div>
                <div>• Title words should be in keywords</div>
                <div>• Use factual phrases, not sentences</div>
                <div>• Include background if white/isolated</div>
              </>
            )}
            {platform === 'shutterstock' && (
              <>
                <div>• Title can be up to 200 characters</div>
                <div>• Use rich synonyms but avoid repetition</div>
                <div>• Include specific details and context</div>
              </>
            )}
            {platform === 'freepik' && (
              <>
                <div>• Optimized for vectors/illustrations</div>
                <div>• Include concise style tokens</div>
                <div>• Focus on design elements</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

