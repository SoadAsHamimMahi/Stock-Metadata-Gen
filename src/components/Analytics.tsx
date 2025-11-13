'use client';

import { useState, useEffect } from 'react';
import { getAnalyticsSummary, clearAnalytics, type AnalyticsEvent } from '@/lib/analytics';
import { getJSON } from '@/lib/util';

export default function Analytics() {
  const [summary, setSummary] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (showModal) {
      setSummary(getAnalyticsSummary());
    }
  }, [showModal]);

  const handleClear = () => {
    if (confirm('Clear all analytics data? This cannot be undone.')) {
      clearAnalytics();
      setSummary(getAnalyticsSummary());
    }
  };

  if (!summary) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm bg-ink/5 hover:bg-ink/10 rounded border border-ink/20"
      >
        Analytics
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="bg-paper rounded-lg shadow-xl max-w-4xl w-full m-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleClear}
                    className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Clear Data
                  </button>
                  <button onClick={() => setShowModal(false)} className="text-ink/60 hover:text-ink">✕</button>
                </div>
              </div>

              {/* Overall Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded border border-blue-200">
                  <div className="text-sm text-blue-600 font-medium">Total Generations</div>
                  <div className="text-2xl font-bold text-blue-900">{summary.total.generations}</div>
                </div>
                <div className="p-4 bg-green-50 rounded border border-green-200">
                  <div className="text-sm text-green-600 font-medium">Success Rate</div>
                  <div className="text-2xl font-bold text-green-900">{summary.total.successRate}%</div>
                </div>
                <div className="p-4 bg-purple-50 rounded border border-purple-200">
                  <div className="text-sm text-purple-600 font-medium">Avg Quality Score</div>
                  <div className="text-2xl font-bold text-purple-900">{summary.total.avgQualityScore}/100</div>
                </div>
                <div className="p-4 bg-orange-50 rounded border border-orange-200">
                  <div className="text-sm text-orange-600 font-medium">Total Errors</div>
                  <div className="text-2xl font-bold text-orange-900">{summary.total.errors}</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Recent Activity</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-ink/5 rounded">
                    <div className="text-sm text-ink/60">Last 24 Hours</div>
                    <div className="text-xl font-bold">{summary.recent.last24h}</div>
                  </div>
                  <div className="p-3 bg-ink/5 rounded">
                    <div className="text-sm text-ink/60">Last 7 Days</div>
                    <div className="text-xl font-bold">{summary.recent.last7d}</div>
                  </div>
                  <div className="p-3 bg-ink/5 rounded">
                    <div className="text-sm text-ink/60">Last 30 Days</div>
                    <div className="text-xl font-bold">{summary.recent.last30d}</div>
                  </div>
                </div>
              </div>

              {/* Platform Distribution */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Platform Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(summary.distribution.platforms).map(([platform, count]: [string, any]) => (
                    <div key={platform} className="flex items-center gap-3">
                      <div className="w-24 text-sm capitalize">{platform}</div>
                      <div className="flex-1 bg-ink/10 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full flex items-center justify-end pr-2 text-white text-xs"
                          style={{ width: `${(count / summary.total.generations) * 100}%` }}
                        >
                          {count > 0 && `${count}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Distribution */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3">Model Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(summary.distribution.models).map(([model, count]: [string, any]) => (
                    <div key={model} className="flex items-center gap-3">
                      <div className="w-24 text-sm capitalize">{model}</div>
                      <div className="flex-1 bg-ink/10 rounded-full h-6 relative overflow-hidden">
                        <div
                          className="bg-purple-600 h-full rounded-full flex items-center justify-end pr-2 text-white text-xs"
                          style={{ width: `${(count / summary.total.generations) * 100}%` }}
                        >
                          {count > 0 && `${count}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Average Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-ink/5 rounded">
                  <div className="text-sm text-ink/60 mb-1">Average Title Length</div>
                  <div className="text-xl font-bold">{summary.total.avgTitleLength} chars</div>
                </div>
                <div className="p-4 bg-ink/5 rounded">
                  <div className="text-sm text-ink/60 mb-1">Average Keyword Count</div>
                  <div className="text-xl font-bold">{summary.total.avgKeywordCount} keywords</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

