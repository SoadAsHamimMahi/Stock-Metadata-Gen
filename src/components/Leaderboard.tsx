'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

interface LeaderboardEntry {
  userId: string;
  count: number;
  displayName: string;
  photoURL?: string;
}

interface LeaderboardProps {
  period: 'weekly' | 'monthly';
}

export default function Leaderboard({ period }: LeaderboardProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`🔍 Fetching ${period} leaderboard...`);
      
      // Use Firestore directly (client-side)
      const { getLeaderboard } = await import('@/lib/firestore');
      const leaderboard = await getLeaderboard(period);
      
      console.log(`✅ Leaderboard loaded: ${leaderboard.length} entries`, leaderboard);
      setEntries(leaderboard || []);
    } catch (err: any) {
      console.error('❌ Error fetching leaderboard:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        stack: err.stack
      });
      setError(`Failed to load leaderboard: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchLeaderboard();
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const getUserInitials = (name: string) => {
    const names = name.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin text-green-accent text-2xl">⏳</div>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-error mb-4">{error}</p>
        <button onClick={fetchLeaderboard} className="btn btn-secondary">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">
          <p>No data available yet. Be the first to generate images!</p>
        </div>
      ) : (
        entries.map((entry, index) => {
          const rank = index + 1;
          const isCurrentUser = user?.uid === entry.userId;
          const rankIcon = getRankIcon(rank);
          
          return (
            <div
              key={entry.userId}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                isCurrentUser
                  ? 'bg-green-accent/10 border-green-accent/40 shadow-green-glow'
                  : 'bg-dark-surface/50 border-green-accent/20 hover:border-green-accent/40'
              }`}
            >
              {/* Rank */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-dark-elevated border border-green-accent/30">
                {rankIcon ? (
                  <span className="text-2xl">{rankIcon}</span>
                ) : (
                  <span className="text-lg font-bold text-text-primary">#{rank}</span>
                )}
              </div>

              {/* Avatar */}
              {entry.photoURL ? (
                <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-green-accent/30 relative">
                  <Image
                    src={entry.photoURL}
                    alt={entry.displayName}
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-sm font-bold text-white ring-2 ring-green-accent/30">
                  {getUserInitials(entry.displayName)}
                </div>
              )}

              {/* Name and Count */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-semibold truncate ${isCurrentUser ? 'text-green-bright' : 'text-text-primary'}`}>
                    {entry.displayName}
                  </p>
                  {isCurrentUser && (
                    <span className="text-xs bg-green-accent/20 text-green-bright px-2 py-0.5 rounded border border-green-accent/30">
                      You
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-secondary">
                  {entry.count} {entry.count === 1 ? 'generation' : 'generations'}
                </p>
              </div>

              {/* Count Badge */}
              <div className="px-4 py-2 bg-green-accent/20 rounded-lg border border-green-accent/30">
                <span className="text-lg font-bold text-green-bright">{entry.count}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

