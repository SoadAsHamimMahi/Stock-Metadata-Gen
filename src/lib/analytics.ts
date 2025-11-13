// Analytics tracking and metrics

import { getJSON, setJSON } from './util';

export interface AnalyticsEvent {
  id: string;
  timestamp: number;
  type: 'generation' | 'error' | 'export' | 'template_used';
  data: {
    platform?: string;
    fileCount?: number;
    successCount?: number;
    errorCount?: number;
    avgQualityScore?: number;
    avgTitleLength?: number;
    avgKeywordCount?: number;
    model?: string;
    templateId?: string;
  };
}

const ANALYTICS_STORAGE_KEY = 'smg_analytics';
const MAX_EVENTS = 1000; // Keep last 1000 events

/**
 * Track an analytics event
 */
export function trackEvent(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>): void {
  const events = getJSON<AnalyticsEvent[]>(ANALYTICS_STORAGE_KEY, []);
  const newEvent: AnalyticsEvent = {
    ...event,
    id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now()
  };
  
  events.push(newEvent);
  
  // Keep only last MAX_EVENTS
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
  
  setJSON(ANALYTICS_STORAGE_KEY, events);
}

/**
 * Get analytics summary
 */
export function getAnalyticsSummary() {
  const events = getJSON<AnalyticsEvent[]>(ANALYTICS_STORAGE_KEY, []);
  const now = Date.now();
  const last24h = events.filter(e => now - e.timestamp < 24 * 60 * 60 * 1000);
  const last7d = events.filter(e => now - e.timestamp < 7 * 24 * 60 * 60 * 1000);
  const last30d = events.filter(e => now - e.timestamp < 30 * 24 * 60 * 60 * 1000);
  
  const generations = events.filter(e => e.type === 'generation');
  const errors = events.filter(e => e.type === 'error');
  
  const totalGenerations = generations.length;
  const totalErrors = errors.length;
  const successRate = totalGenerations > 0 
    ? ((totalGenerations - totalErrors) / totalGenerations * 100).toFixed(1)
    : '0';
  
  const avgQualityScore = generations.length > 0
    ? (generations.reduce((sum, e) => sum + (e.data.avgQualityScore || 0), 0) / generations.length).toFixed(1)
    : '0';
  
  const avgTitleLength = generations.length > 0
    ? Math.round(generations.reduce((sum, e) => sum + (e.data.avgTitleLength || 0), 0) / generations.length)
    : 0;
  
  const avgKeywordCount = generations.length > 0
    ? Math.round(generations.reduce((sum, e) => sum + (e.data.avgKeywordCount || 0), 0) / generations.length)
    : 0;
  
  // Platform distribution
  const platformCounts: Record<string, number> = {};
  generations.forEach(e => {
    const platform = e.data.platform || 'unknown';
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });
  
  // Model distribution
  const modelCounts: Record<string, number> = {};
  generations.forEach(e => {
    const model = e.data.model || 'unknown';
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  });
  
  // Most common errors
  const errorTypes: Record<string, number> = {};
  errors.forEach(e => {
    const errorMsg = e.data.errorCount?.toString() || 'unknown';
    errorTypes[errorMsg] = (errorTypes[errorMsg] || 0) + 1;
  });
  
  return {
    total: {
      generations: totalGenerations,
      errors: totalErrors,
      successRate: parseFloat(successRate),
      avgQualityScore: parseFloat(avgQualityScore),
      avgTitleLength,
      avgKeywordCount
    },
    recent: {
      last24h: last24h.length,
      last7d: last7d.length,
      last30d: last30d.length
    },
    distribution: {
      platforms: platformCounts,
      models: modelCounts,
      errors: errorTypes
    }
  };
}

/**
 * Clear analytics data
 */
export function clearAnalytics(): void {
  setJSON(ANALYTICS_STORAGE_KEY, []);
}

