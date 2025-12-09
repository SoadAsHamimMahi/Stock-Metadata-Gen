'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Image from 'next/image';
import KeyModal from './KeyModal';
import { getDecryptedJSON } from '@/lib/util';
import logo from '@/image/logo.jpeg';
import { useGuardedAction } from '@/hooks/useGuardedAction';
import LoginModal from '@/components/LoginModal';
import { useAuth } from '@/contexts/AuthContext';
import ProfileModal from '@/components/ProfileModal';
import LeaderboardModal from '@/components/LeaderboardModal';

type HeaderProps = {
  onExportCSV?: () => void;
  hasRows?: boolean;
  geminiModel?: string;
  onModelChanged?: (provider: 'gemini' | 'mistral' | 'groq', model: any) => void;
};

export default function Header({ onExportCSV, hasRows = false, geminiModel, onModelChanged }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [bearer, setBearer] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [leaderboardModalOpen, setLeaderboardModalOpen] = useState(false);
  const { executeGuarded, loginModalOpen, setLoginModalOpen, reason, handleLoginSuccess } = useGuardedAction();
  const { user, logout } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    (async () => {
      const enc = await getDecryptedJSON<{ bearer?: string } | null>('smg_keys_enc', null);
      setBearer(enc?.bearer || '');
    })();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };

    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userDropdownOpen]);

  // Get user profile picture URL
  const getUserPhotoURL = () => {
    if (!user) return null;
    return user.photoURL || null;
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user) return 'SA';
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

  // Get user display name
  const getUserDisplayName = () => {
    if (!user) return 'Soad As Hamim Mahi';
    return user.displayName || user.email?.split('@')[0] || 'User';
  };

  // Get user email
  const getUserEmail = () => {
    if (!user) return 'soadashamimmahi@gmail.com';
    return user.email || '';
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUserDropdownOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-xl shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300 animate-pulse-glow">
            <Image
              src={logo}
              alt="StockCSV logo"
              width={36}
              height={36}
              className="rounded-lg object-cover"
              priority
            />
          </div>
          <div>
            <div className="text-4xl font-extrabold tracking-tight text-white font-space-grotesk leading-tight">StockCSV</div>
            <div className="text-sm text-text-secondary font-medium tracking-wide font-space-grotesk">AI-Powered Stock Metadata Generator</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="btn btn-ghost text-base font-semibold hover:shadow-green-glow transition-all duration-300" 
            onClick={() => setLeaderboardModalOpen(true)}
          >
            Leaderboard
          </button>
          <button 
            className="btn btn-ghost text-base font-semibold hover:shadow-green-glow transition-all duration-300" 
            onClick={() => executeGuarded(() => setOpen(true), 'Please sign in to manage your API secrets.')}
          >
            API Secrets
          </button>
          {onExportCSV && (
            <button 
              className={`btn text-base font-bold ${hasRows ? '' : 'btn-disabled'}`}
              onClick={onExportCSV}
              disabled={!hasRows}
            >
              Export CSV
            </button>
          )}
          {/* User Profile Dropdown - Only show when logged in */}
          {user ? (
            <div className="relative ml-2 pl-2 border-l border-green-accent/30" ref={dropdownRef}>
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                {getUserPhotoURL() ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300 ring-2 ring-green-accent/30 relative">
                    <Image
                      src={getUserPhotoURL()!}
                      alt={getUserDisplayName()}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-sm font-bold text-white shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300">
                    {getUserInitials()}
                  </div>
                )}
                <span className="text-base text-text-primary font-semibold">{getUserDisplayName()}</span>
              </button>

              {/* Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-dark-elevated rounded-lg border border-green-accent/20 shadow-green-glow-lg overflow-hidden z-50 animate-scale-in">
                  {/* User Info Header */}
                  <div className="flex items-center justify-between p-4 border-b border-green-accent/20">
                    <div className="flex items-center gap-3 flex-1">
                      {getUserPhotoURL() ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden shadow-green-glow ring-2 ring-green-accent/30 relative">
                          <Image
                            src={getUserPhotoURL()!}
                            alt={getUserDisplayName()}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-sm font-bold text-white shadow-green-glow">
                          {getUserInitials()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold text-text-primary truncate">
                          {getUserDisplayName()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* User Details */}
                  <div className="p-4 border-b border-green-accent/20">
                    <div className="text-lg font-semibold text-text-primary mb-1">
                      {getUserDisplayName()}
                    </div>
                    <div className="text-sm text-text-secondary truncate">
                      {getUserEmail()}
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => {
                        setProfileModalOpen(true);
                        setUserDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-text-primary hover:bg-dark-surface/50 transition-colors text-left group"
                    >
                      <svg 
                        className="w-5 h-5 text-text-tertiary group-hover:text-text-primary transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                        />
                      </svg>
                      <span className="font-medium">Profile</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-text-primary hover:bg-dark-surface/50 transition-colors text-left group"
                    >
                      <svg 
                        className="w-5 h-5 text-text-tertiary group-hover:text-text-primary transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" 
                        />
                      </svg>
                      <span className="font-medium">Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="ml-2 pl-2 border-l border-green-accent/30">
              <button
                onClick={() => executeGuarded(() => {}, 'Please sign in to access your account.')}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-accent to-teal-accent flex items-center justify-center text-sm font-bold text-white shadow-green-glow hover:shadow-green-glow-lg transition-all duration-300">
                  👤
                </div>
                <span className="text-base text-text-primary font-semibold">Sign In</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <KeyModal 
        open={open} 
        onOpenChange={setOpen}
        onModelChanged={onModelChanged}
      />
      <LoginModal 
        open={loginModalOpen} 
        onOpenChange={setLoginModalOpen}
        reason={reason}
        onLoginSuccess={handleLoginSuccess}
      />
      <ProfileModal 
        open={profileModalOpen} 
        onOpenChange={setProfileModalOpen}
      />
      <LeaderboardModal 
        open={leaderboardModalOpen} 
        onOpenChange={setLeaderboardModalOpen}
      />
    </>
  );
}


