// Smart defaults - auto-detect optimal settings based on file type and content

import type { FormState } from './types';

/**
 * Detect optimal settings based on file extension and platform
 */
export function getSmartDefaults(
  files: Array<{ name: string; ext?: string }>,
  platform: 'general' | 'adobe' | 'shutterstock'
): Partial<FormState> {
  if (files.length === 0) return {};
  
  // Analyze file types
  const extensions = files.map(f => (f.ext || f.name.split('.').pop() || '').toLowerCase());
  const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
  const vectorExts = ['svg', 'eps', 'ai'];
  const videoExts = ['mp4', 'mov', 'm4v', 'webm'];
  
  const hasImages = extensions.some(ext => imageExts.includes(ext));
  const hasVectors = extensions.some(ext => vectorExts.includes(ext));
  const hasVideos = extensions.some(ext => videoExts.includes(ext));
  
  // Detect asset type
  let assetType: FormState['assetType'] = 'auto';
  if (hasVectors) {
    assetType = 'vector';
  } else if (hasVideos) {
    assetType = 'video';
  } else if (hasImages) {
    assetType = 'photo';
  }
  
  // Platform-specific defaults
  const defaults: Partial<FormState> = {
    assetType
  };
  
  if (platform === 'adobe') {
    defaults.titleLen = 70;
    defaults.keywordMode = 'fixed';
    defaults.keywordCount = 30;
    defaults.model = { provider: 'groq', preview: false };
  } else if (platform === 'shutterstock') {
    defaults.titleLen = 120;
    defaults.keywordMode = 'fixed';
    defaults.keywordCount = 49;
    defaults.model = { provider: 'groq', preview: false };
  } else if (platform === 'general') {
    defaults.titleLen = 100;
    defaults.keywordMode = 'fixed';
    defaults.keywordCount = 35;
    defaults.model = { provider: 'groq', preview: false };
  }
  
  // Asset type specific adjustments
  const currentAssetType = defaults.assetType;
  if (currentAssetType === 'vector' || currentAssetType === 'illustration' || currentAssetType === '3d' || currentAssetType === 'icon') {
    defaults.keywordCount = Math.min((defaults.keywordCount || 30), 30);
  } else if (currentAssetType === 'video') {
    defaults.keywordCount = Math.max((defaults.keywordCount || 30), 40);
  }
  
  return defaults;
}

/**
 * Suggest optimal settings based on historical performance
 */
export function getOptimalSettings(
  platform: 'general' | 'adobe' | 'shutterstock',
  assetType: FormState['assetType']
): Partial<FormState> {
  // These are based on best practices and can be adjusted based on analytics
  const suggestions: Record<string, Partial<FormState>> = {
    'adobe-photo': {
      titleLen: 70,
      keywordCount: 30,
      model: { provider: 'groq', preview: false }
    },
    'adobe-vector': {
      titleLen: 70,
      keywordCount: 35,
      model: { provider: 'groq', preview: false }
    },
    'shutterstock-photo': {
      titleLen: 120,
      keywordCount: 49,
      model: { provider: 'groq', preview: false }
    },
    'general-vector': {
      titleLen: 100,
      keywordCount: 35,
      model: { provider: 'groq', preview: false }
    }
  };
  
  const key = `${platform}-${assetType}`;
  return suggestions[key] || {};
}

