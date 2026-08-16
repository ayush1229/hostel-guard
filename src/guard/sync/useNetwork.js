/**
 * guard/sync/useNetwork.js
 *
 * React hook to detect and subscribe to the browser's online/offline state.
 * Returns { isOnline, pendingCount } to drive UI indicators.
 */

import { useCallback, useEffect, useState } from 'react';
import { getPendingLogs } from '../db/queries.js';

/**
 * @returns {{ isOnline: boolean, pendingCount: number }}
 */
export function useNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    const logs = await getPendingLogs();
    setPendingCount(logs.length);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Poll pending count every 5 seconds to keep badge accurate
  useEffect(() => {
    // Run initial fetch on next tick to avoid React's synchronous setState warning
    setTimeout(() => refreshPending(), 0);
    const interval = setInterval(refreshPending, 5000);
    return () => clearInterval(interval);
  }, [refreshPending]);

  return { isOnline, pendingCount };
}
