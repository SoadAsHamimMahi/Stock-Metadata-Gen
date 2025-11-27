'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface UserStats {
  totalGenerations: number;
  memberSince: string | null;
  lastGenerationDate: string | null;
  displayName: string;
  email: string;
  photoURL?: string;
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Use Firestore directly (client-side)
      const { getUserStats } = await import('@/lib/firestore');
      const userStats = await getUserStats(user.uid);
      
      if (userStats) {
        setStats({
          totalGenerations: userStats.totalGenerations || 0,
          memberSince: userStats.memberSince?.toDate?.()?.toISOString() || null,
          lastGenerationDate: userStats.lastGenerationDate?.toDate?.()?.toISOString() || null,
          displayName: userStats.displayName,
          email: userStats.email,
          photoURL: userStats.photoURL
        });
      } else {
        // User not found in Firestore yet, use Firebase Auth data
        setStats({
          totalGenerations: 0,
          memberSince: user.metadata.creationTime || null,
          lastGenerationDate: null,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          photoURL: user.photoURL || undefined
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
      // Fallback to Firebase Auth data
      if (user) {
        setStats({
          totalGenerations: 0,
          memberSince: user.metadata.creationTime || null,
          lastGenerationDate: null,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          photoURL: user.photoURL || undefined
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (open && user) {
      fetchStats();
    }
  }, [open, user, fetchStats]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return 'N/A';
    }
  };

  const getUserInitials = () => {
    if (!user) return 'U';
    if (user.displayName) {
      const names = user.displayName.split(' ');
      if (names.length >= 2) {
        return (names[0][0] + names[1][0]).toUpperCase();
      }
      return names[0][0].toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const getUserDisplayName = () => {
    if (!user) return 'User';
    return user.displayName || user.email?.split('@')[0] || 'User';
  };

  const getUserEmail = () => {
    if (!user) return '';
    return user.email || '';
  };

  const getUserPhotoURL = () => {
    return stats?.photoURL || user?.photoURL || null;
  };

  if (!open || !mounted) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-dark-elevated rounded-lg w-full max-w-md overflow-hidden shadow-green-glow-lg animate-scale-in border border-green-accent/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b border-green-accent/20">
          <h2 className="text-xl font-bold text-text-primary">Profile</h2>
          <button 
            className="text-text-tertiary hover:text-text-primary text-2xl leading-none transition-colors"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin text-green-accent text-2xl">⏳</div>
            </div>
          ) : (
            <>
              {/* Profile Picture */}
              <div className="flex justify-center mb-6">
                {getUserPhotoURL() ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden shadow-green-glow ring-4 ring-green-accent/30 relative">
                    <Image
                      src={getUserPhotoURL()!}
                      alt={getUserDisplayName()}
                      width={96}
                      height={96}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-3xl font-bold text-white shadow-green-glow ring-4 ring-green-accent/30">
                    {getUserInitials()}
                  </div>
                )}
              </div>

              {/* User Name */}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-text-primary mb-1">
                  {getUserDisplayName()}
                </h3>
              </div>

              {/* Info Cards */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Email Card */}
                <div className="bg-dark-surface/50 rounded-lg p-4 border border-green-accent/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-accent text-lg">✉️</span>
                    <span className="text-sm text-text-tertiary">Email</span>
                  </div>
                  <div className="text-sm text-text-primary font-medium truncate" title={getUserEmail()}>
                    {getUserEmail() || 'N/A'}
                  </div>
                </div>

                {/* Member Since Card */}
                <div className="bg-dark-surface/50 rounded-lg p-4 border border-green-accent/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-green-accent text-lg">📅</span>
                    <span className="text-sm text-text-tertiary">Member Since</span>
                  </div>
                  <div className="text-sm text-text-primary font-medium">
                    {formatDate(stats?.memberSince || null)}
                  </div>
                </div>
              </div>

              {/* Stats Card */}
              <div className="bg-dark-surface/50 rounded-lg p-4 border border-green-accent/20 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-accent text-lg">📊</span>
                  <span className="text-sm text-text-tertiary">Lifetime Total Generations</span>
                </div>
                <div className="text-3xl font-bold text-green-bright">
                  {stats?.totalGenerations || 0}
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => onOpenChange(false)}
                className="w-full btn"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

