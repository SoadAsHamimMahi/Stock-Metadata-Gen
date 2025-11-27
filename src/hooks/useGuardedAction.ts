'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function useGuardedAction() {
  const { user, loading } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [reason, setReason] = useState<string | undefined>();

  const executeGuarded = useCallback(
    (action: () => void | Promise<void>, reasonText?: string) => {
      if (loading) {
        // Still loading auth state, wait
        return;
      }

      if (!user) {
        // Not authenticated - open login modal
        setPendingAction(() => action);
        setReason(reasonText);
        setLoginModalOpen(true);
      } else {
        // Authenticated - execute action
        const result = action();
        // Handle async actions
        if (result && typeof (result as any).then === 'function') {
          (result as Promise<any>).catch((error) => {
            console.error('Error executing guarded action:', error);
          });
        }
      }
    },
    [user, loading]
  );

  const handleLoginSuccess = useCallback(() => {
    // After successful login, execute the pending action
    if (pendingAction) {
      const result = pendingAction();
      // Handle async actions
      if (result && typeof (result as any).then === 'function') {
        (result as Promise<any>).catch((error) => {
          console.error('Error executing pending action after login:', error);
        });
      }
      setPendingAction(null);
    }
  }, [pendingAction]);

  return {
    executeGuarded,
    loginModalOpen,
    setLoginModalOpen,
    reason,
    handleLoginSuccess,
  };
}

