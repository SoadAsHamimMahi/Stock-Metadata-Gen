'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: string;
  onLoginSuccess?: () => void;
}

export default function LoginModal({ open, onOpenChange, reason, onLoginSuccess }: LoginModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && emailInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setError(null);
      setEmail('');
      setPassword('');
      setIsLogin(true);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await registerWithEmail(email, password);
      }
      // Success - close modal and trigger callback
      onOpenChange(false);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);

    try {
      await loginWithGoogle();
      // Success - close modal and trigger callback
      onOpenChange(false);
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
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
        {/* Header */}
        <div className="p-6 border-b border-green-accent/20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">
              {isLogin ? 'Sign in to continue' : 'Create an account'}
            </h2>
            <button 
              className="text-text-tertiary hover:text-text-primary text-2xl leading-none transition-colors"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {reason && (
            <p className="text-sm text-text-secondary mt-1">
              {reason}
            </p>
          )}
          {!reason && (
            <p className="text-sm text-text-secondary mt-1">
              Log in to upload images and manage your API key.
            </p>
          )}
        </div>

        {/* Form */}
        <div className="p-6">
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                ref={emailInputRef}
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className="input"
                placeholder="you@example.com"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="input pr-10"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-error/20 border border-error/30 rounded-lg px-3 py-2 text-sm text-error">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="btn w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Continue' : 'Create account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-green-accent/20"></div>
            <span className="text-sm text-text-tertiary">or</span>
            <div className="flex-1 h-px bg-green-accent/20"></div>
          </div>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full px-4 py-2.5 rounded-lg border border-green-accent/20 bg-dark-surface/50 hover:bg-dark-surface/70 text-text-primary font-semibold transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:border-green-accent/40"
          >
            {loading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {/* Toggle Login/Signup */}
          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              disabled={loading}
              className="text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {isLogin ? (
                <>
                  No account? <span className="text-green-accent font-semibold">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="text-green-accent font-semibold">Sign in</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

