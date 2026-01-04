'use client';

import { useEffect } from 'react';
import app from '@/lib/firebase';

export default function FirebaseAnalyticsInit() {
  useEffect(() => {
    let cancelled = false;

    // Analytics must run client-side only. We also keep this as a dynamic import to avoid SSR issues.
    (async () => {
      try {
        const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
        if (!measurementId) return;

        const { isSupported, getAnalytics, logEvent } = await import('firebase/analytics');
        const supported = await isSupported();
        if (!supported || cancelled) return;

        const analytics = getAnalytics(app);
        // Minimal sanity event so Realtime shows activity.
        logEvent(analytics, 'app_open');
      } catch {
        // Intentionally swallow to avoid breaking the app if analytics is blocked by the browser.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}


