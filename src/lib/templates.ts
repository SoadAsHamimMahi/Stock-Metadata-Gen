// Template system for saving/loading metadata generation presets

import type { FormState } from './types';
import { getJSON, setJSON } from './util';

export interface Template {
  id: string;
  name: string;
  description?: string;
  formState: FormState;
  createdAt: number;
  updatedAt: number;
}

const TEMPLATES_STORAGE_KEY = 'smg_templates';

/**
 * Get all saved templates
 */
export function getTemplates(): Template[] {
  return getJSON<Template[]>(TEMPLATES_STORAGE_KEY, []);
}

/**
 * Save a template
 */
export function saveTemplate(template: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Template {
  const templates = getTemplates();
  const now = Date.now();
  const newTemplate: Template = {
    ...template,
    id: `template_${now}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: now,
    updatedAt: now
  };
  templates.push(newTemplate);
  setJSON(TEMPLATES_STORAGE_KEY, templates);
  return newTemplate;
}

/**
 * Update an existing template
 */
export function updateTemplate(id: string, updates: Partial<Omit<Template, 'id' | 'createdAt'>>): Template | null {
  const templates = getTemplates();
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) return null;
  
  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: Date.now()
  };
  setJSON(TEMPLATES_STORAGE_KEY, templates);
  return templates[index];
}

/**
 * Delete a template
 */
export function deleteTemplate(id: string): boolean {
  const templates = getTemplates();
  const filtered = templates.filter(t => t.id !== id);
  if (filtered.length === templates.length) return false;
  setJSON(TEMPLATES_STORAGE_KEY, filtered);
  return true;
}

/**
 * Get a template by ID
 */
export function getTemplate(id: string): Template | null {
  const templates = getTemplates();
  return templates.find(t => t.id === id) || null;
}

/**
 * Create default templates
 */
export function createDefaultTemplates(): Template[] {
  const defaults: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Adobe Stock Optimized',
      description: 'Optimized settings for Adobe Stock with 70-char titles and keyword prioritization',
      formState: {
        platform: 'adobe',
        model: { provider: 'gemini', preview: false },
        titleLen: 70,
        descLen: 150,
        keywordCount: 41,
        assetType: 'auto',
        prefix: '',
        suffix: '',
        negativeTitle: [],
        negativeKeywords: [],
        singleMode: false,
        videoHints: { style: [], tech: [] },
        isolatedOnTransparentBackground: false,
        isolatedOnWhiteBackground: false,
        isVector: false,
        isIllustration: false
      }
    },
    {
      name: 'Shutterstock Standard',
      description: 'Standard settings for Shutterstock with longer titles',
      formState: {
        platform: 'shutterstock',
        model: { provider: 'gemini', preview: false },
        titleLen: 120,
        descLen: 150,
        keywordCount: 50,
        assetType: 'auto',
        prefix: '',
        suffix: '',
        negativeTitle: [],
        negativeKeywords: [],
        singleMode: false,
        videoHints: { style: [], tech: [] },
        isolatedOnTransparentBackground: false,
        isolatedOnWhiteBackground: false,
        isVector: false,
        isIllustration: false
      }
    },
    {
      name: 'Freepik Vector',
      description: 'Optimized for vector illustrations on Freepik',
      formState: {
        platform: 'freepik',
        model: { provider: 'gemini', preview: false },
        titleLen: 100,
        descLen: 150,
        keywordCount: 30,
        assetType: 'vector',
        prefix: '',
        suffix: '',
        negativeTitle: [],
        negativeKeywords: [],
        singleMode: false,
        videoHints: { style: [], tech: [] },
        isolatedOnTransparentBackground: false,
        isolatedOnWhiteBackground: false,
        isVector: false,
        isIllustration: false
      }
    }
  ];
  
  // Only create if templates don't exist
  const existing = getTemplates();
  if (existing.length === 0) {
    const created = defaults.map(t => saveTemplate(t));
    return created;
  }
  
  return existing;
}

