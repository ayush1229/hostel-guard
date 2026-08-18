/**
 * guard/sync/hostelSyncEngine.js
 *
 * Offline-first sync engine for the Hostel Guard Terminal.
 * Mirrors syncEngine.js but targets /api/guard/hostel-* endpoints
 * and uses hostel_outpasses / hostel_action_logs Dexie tables.
 */

import { apiFetch } from '../../utils/api.js';
import {
  replaceHostelOutpassCache,
  upsertHostelOutpassCache,
  getPendingHostelLogs,
  markHostelLogsSyncing,
  markHostelLogsSynced,
  markHostelLogFailed,
} from '../db/queries.js';

const SYNC_INTERVAL_MS = 30_000;
const LAST_HOSTEL_SYNC_KEY = 'hostel_guard_last_sync_at';

let _onHostelOutpassesUpdated = null;
let _syncIntervalId = null;
let _initialized = false;
let _isFlushing = false;

// ─── Pull Hostel Outpasses ──────────────────────────────────

export async function pullHostelOutpasses() {
  if (!navigator.onLine) return;
  try {
    const lastSync = localStorage.getItem(LAST_HOSTEL_SYNC_KEY);
    const url = lastSync
      ? `/api/guard/hostel-monitor?updated_since=${encodeURIComponent(lastSync)}`
      : '/api/guard/hostel-monitor';

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
      await upsertHostelOutpassCache(rawList);
    } else {
      const activeApproved = rawList.filter(
        (o) => o.outp_status === 'Approved' && (o.is_active === true || o.is_active === 'true' || o.is_active === 1)
      );
      await replaceHostelOutpassCache(activeApproved);
    }

    localStorage.setItem(LAST_HOSTEL_SYNC_KEY, serverTime);
    _onHostelOutpassesUpdated?.();
  } catch (err) {
    console.warn('[HostelSyncEngine] pullHostelOutpasses failed:', err.message);
  }
}

// ─── Flush Hostel Queue ─────────────────────────────────────

export async function flushHostelOfflineQueue() {
  if (!navigator.onLine) return;
  if (_isFlushing) return;

  const pendingLogs = await getPendingHostelLogs();
  if (pendingLogs.length === 0) return;

  _isFlushing = true;

  try {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < pendingLogs.length; i += CHUNK_SIZE) {
      const chunk = pendingLogs.slice(i, i + CHUNK_SIZE);
      const chunkIds = chunk.map((l) => l.id);

      await markHostelLogsSyncing(chunkIds);

      const response = await apiFetch('/api/guard/hostel-sync-logs', {
        method: 'POST',
        body: JSON.stringify({ logs: chunk }),
      });

      const responseData = response?.data || response;
      const syncedIds = responseData?.synced_ids || chunkIds;
      const failedIds = responseData?.failed_ids || [];

      if (syncedIds.length > 0) {
        await markHostelLogsSynced(syncedIds);
      }
      if (failedIds.length > 0) {
        for (const id of failedIds) await markHostelLogFailed(id);
      }
    }
  } catch (err) {
    console.warn('[HostelSyncEngine] flushHostelOfflineQueue failed:', err.message);
    const allIds = pendingLogs.map((l) => l.id);
    for (const id of allIds) await markHostelLogFailed(id);
  } finally {
    _isFlushing = false;
  }
}

// ─── Flush then Pull ───────────────────────────────────────

export async function hostelFlushThenPull() {
  await flushHostelOfflineQueue();

  const remaining = await getPendingHostelLogs();
  if (remaining.length > 0) {
    console.warn(`[HostelSyncEngine] ${remaining.length} log(s) still unsynced — skipping pull.`);
    _onHostelOutpassesUpdated?.();
    return;
  }

  await pullHostelOutpasses();
}

// ─── Init / Teardown ───────────────────────────────────────

export function initHostelSyncEngine(onHostelOutpassesUpdated) {
  _onHostelOutpassesUpdated = onHostelOutpassesUpdated;

  if (_initialized) {
    if (!_syncIntervalId) {
      hostelFlushThenPull();
      _syncIntervalId = setInterval(hostelFlushThenPull, SYNC_INTERVAL_MS);
    }
    return;
  }

  _initialized = true;
  hostelFlushThenPull();
  _syncIntervalId = setInterval(hostelFlushThenPull, SYNC_INTERVAL_MS);

  window.addEventListener('online', () => {
    console.log('[HostelSyncEngine] Back online — flushing + pulling.');
    hostelFlushThenPull();
  });

  console.log('[HostelSyncEngine] Initialized.');
}

export function destroyHostelSyncEngine() {
  clearInterval(_syncIntervalId);
  _syncIntervalId = null;
  _onHostelOutpassesUpdated = null;
  console.log('[HostelSyncEngine] Destroyed.');
}

export { flushHostelOfflineQueue as flushHostelQueue };
