/**
 * guard/sync/syncEngine.js
 *
 * Background sync engine for the Guard Terminal offline-first architecture.
 *
 * Responsibilities:
 *  1. Pull approved outpasses from server → populate local Dexie cache
 *  2. Push PENDING action_logs to server → delete on success
 *
 * This module is framework-agnostic and runs outside of React.
 * It is started once from GuardLayout.jsx via initSyncEngine().
 */

import { apiFetch } from '../../utils/api.js';
import {
  replaceOutpassCache,
  upsertOutpassCache,
  getPendingLogs,
  markLogsSyncing,
  markLogsSynced,
  markLogFailed,
} from '../db/queries.js';

// ─── Config ────────────────────────────────────────────────
const SYNC_INTERVAL_MS = 30_000;   // flush queue every 30 s
const LAST_SYNC_KEY = 'guard_last_sync_at';

let _onOutpassesUpdated = null;    // callback to refresh React state
let _syncIntervalId = null;
let _initialized = false;
let _isFlushing = false;           // concurrency lock — prevents duplicate POSTs

// ─── Pull Outpasses from Server ────────────────────────────

/**
 * Fetch approved/updated outpasses from server (using delta sync if available),
 * update Dexie cache, then notify React via callback.
 */
export async function pullOutpasses() {
  if (!navigator.onLine) return;
  try {
    const lastSync = localStorage.getItem(LAST_SYNC_KEY);
    const url = lastSync
      ? `/api/guard/monitor?updated_since=${encodeURIComponent(lastSync)}`
      : '/api/guard/monitor';

    const result = await apiFetch(url);

    const isDelta = Boolean(result?.data?.delta || result?.delta);
    const serverTime = result?.data?.server_time || result?.server_time || new Date().toISOString();

    const rawList = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
      ? result.data
      : Array.isArray(result?.data?.outpasses)
      ? result.data.outpasses
      : Array.isArray(result?.outpasses)
      ? result.outpasses
      : [];

    if (isDelta) {
      await upsertOutpassCache(rawList);
    } else {
      const activeAndApproved = rawList.filter((o) => o.outp_status === 'Approved' && (o.is_active === true || o.is_active === 'true' || o.is_active === 1));
      await replaceOutpassCache(activeAndApproved);
    }

    localStorage.setItem(LAST_SYNC_KEY, serverTime);
    _onOutpassesUpdated?.();
  } catch (err) {
    console.warn('[SyncEngine] pullOutpasses failed:', err.message);
  }
}

// ─── Push Offline Queue to Server ──────────────────────────

/**
 * Flush all PENDING/FAILED action_logs to the server.
 * On success, delete the synced logs from local DB.
 * On failure, mark them FAILED so they can retry next cycle.
 *
 * Protected by _isFlushing lock to prevent duplicate concurrent POST requests
 * (e.g. React StrictMode double-mount or simultaneous interval + online event).
 */
export async function flushOfflineQueue() {
  if (!navigator.onLine) return;
  if (_isFlushing) {
    console.log('[SyncEngine] Flush already in progress — skipping duplicate call.');
    return;
  }

  const pendingLogs = await getPendingLogs();
  if (pendingLogs.length === 0) return;

  _isFlushing = true;

  try {
    const CHUNK_SIZE = 500;
    
    // Process logs in chunks to avoid hitting server payload limits (100kb)
    for (let i = 0; i < pendingLogs.length; i += CHUNK_SIZE) {
      const chunk = pendingLogs.slice(i, i + CHUNK_SIZE);
      const chunkIds = chunk.map((l) => l.id);

      // Optimistically mark as SYNCING to prevent double-send
      await markLogsSyncing(chunkIds);

      const response = await apiFetch('/api/guard/sync-logs', {
        method: 'POST',
        body: JSON.stringify({ logs: chunk }),
      });

      // Server returns an ApiResponse object: { data: { synced_ids: [...] } }
      const responseData = response?.data || response;
      const syncedIds = responseData?.synced_ids || chunkIds;
      const failedIds = responseData?.failed_ids || [];

      if (syncedIds.length > 0) {
        await markLogsSynced(syncedIds);
        console.log(`[SyncEngine] Synced ${syncedIds.length} action log(s) (chunk ${i / CHUNK_SIZE + 1}).`);
      }

      if (failedIds.length > 0) {
        for (const id of failedIds) {
          await markLogFailed(id);
        }
        console.warn(`[SyncEngine] Server rejected ${failedIds.length} log(s) in chunk.`);
      }
    }
  } catch (err) {
    console.warn('[SyncEngine] flushOfflineQueue failed, marking remaining as FAILED:', err.message);
    // Mark them FAILED so the next cycle picks them up again.
    // (Already-synced logs from previous chunks in this run were deleted, so this only affects unsynced ones.)
    const allIds = pendingLogs.map((l) => l.id);
    for (const id of allIds) {
      await markLogFailed(id);
    }
  } finally {
    _isFlushing = false;
  }
}

// ─── Init / Teardown ───────────────────────────────────────

/**
 * Flush pending logs first, THEN pull fresh data from server.
 *
 * CRITICAL ORDERING RULE:
 * We must NOT pull if there are still unsynced local actions.
 * If the flush fails (e.g. server temporarily down), the server state is stale
 * (it doesn't yet know about offline guard actions like "Mark Return").
 * Pulling stale server data would overwrite the locally-modified Dexie records,
 * making it appear as though the guard's offline actions never happened.
 *
 * Only pull once the queue is fully empty and the server reflects local reality.
 */
export async function flushThenPull() {
  await flushOfflineQueue();

  // After attempting to flush, check if any logs still remain.
  // If yes → flush failed (server was unreachable). The server state is stale.
  // Do NOT pull: just refresh React from whatever Dexie already has.
  const remaining = await getPendingLogs();
  if (remaining.length > 0) {
    console.warn(
      `[SyncEngine] ${remaining.length} log(s) still unsynced — skipping pull to preserve local state.`
    );
    _onOutpassesUpdated?.(); // re-render from local Dexie (which IS correct)
    return;
  }

  // Queue is empty → server is up to date → safe to pull fresh state.
  await pullOutpasses();
}

/**
 * Start the sync engine. Safe to call multiple times (idempotent).
 * @param {Function} onOutpassesUpdated - React callback to re-read Dexie
 */
export function initSyncEngine(onOutpassesUpdated) {
  _onOutpassesUpdated = onOutpassesUpdated;

  if (_initialized) {
    // Component remounted (e.g., navigated back)
    // Restart interval if it was cleared
    if (!_syncIntervalId) {
      flushThenPull();
      _syncIntervalId = setInterval(flushThenPull, SYNC_INTERVAL_MS);
    }
    return;
  }

  _initialized = true;
  _onOutpassesUpdated = onOutpassesUpdated;

  // On startup: flush any leftover offline logs from a previous session FIRST,
  // then pull fresh state. This prevents stale server data overwriting
  // locally-modified Dexie records that haven't been synced yet.
  flushThenPull();

  // Every 30s: flush pending logs AND pull updated outpasses if queue is clear.
  // Using flushThenPull (not just flushOfflineQueue) ensures the UI auto-updates
  // after a successful background sync without requiring a manual page refresh.
  _syncIntervalId = setInterval(flushThenPull, SYNC_INTERVAL_MS);

  // When coming back online after a true network drop: flush then pull.
  window.addEventListener('online', () => {
    console.log('[SyncEngine] Back online — flushing queue then pulling outpasses.');
    flushThenPull();
  });

  console.log('[SyncEngine] Initialized.');
}


/**
 * Stop the sync engine (called on unmount of GuardLayout).
 *
 * NOTE: We intentionally do NOT reset _initialized here.
 * React StrictMode unmounts and remounts components in development, which
 * calls destroySyncEngine then initSyncEngine in quick succession.
 * If _initialized were reset, initSyncEngine would treat the remount as a
 * first-time init and fire a second flushThenPull concurrently with the first,
 * causing duplicate POST /sync-logs requests.
 *
 * The _isFlushing lock handles genuine same-session races, and the server's
 * idempotency check handles cross-session duplicates (e.g. rapid page refreshes).
 */
export function destroySyncEngine() {
  clearInterval(_syncIntervalId);
  _syncIntervalId = null;
  _onOutpassesUpdated = null;
  // _initialized intentionally NOT reset — see note above
  console.log('[SyncEngine] Destroyed.');
}
