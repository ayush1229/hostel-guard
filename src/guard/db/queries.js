/**
 * guard/db/queries.js
 *
 * Helper functions over Dexie tables.
 * All direct table access is encapsulated here so components
 * never import guardDb directly.
 */

import guardDb from './database.js';

// ─── Outpasses ─────────────────────────────────────────────

/**
 * Replace the entire local outpass cache with a fresh server snapshot.
 * @param {Object[]} outpasses - Array of approved outpass objects
 */
export async function replaceOutpassCache(outpasses) {
  await guardDb.transaction('rw', guardDb.outpasses, async () => {
    await guardDb.outpasses.clear();
    if (outpasses.length > 0) {
      await guardDb.outpasses.bulkPut(outpasses);
    }
  });
}

/**
 * Upsert delta outpasses into local cache.
 * Approved outpasses are added/updated; Revoked/Rejected/Cancelled outpasses are removed.
 * @param {Object[]} outpasses - Array of updated outpass objects from delta sync
 */
export async function upsertOutpassCache(outpasses) {
  if (!outpasses || outpasses.length === 0) return;
  
  const toUpsert = outpasses.filter((o) => o.outp_status === 'Approved');
  const toRemoveIds = outpasses
    .filter((o) => o.outp_status && o.outp_status !== 'Approved')
    .map((o) => o.id || o.outpass_id);

  await guardDb.transaction('rw', guardDb.outpasses, async () => {
    if (toUpsert.length > 0) {
      await guardDb.outpasses.bulkPut(toUpsert);
    }
    if (toRemoveIds.length > 0) {
      await guardDb.outpasses.bulkDelete(toRemoveIds);
    }
  });
}

/**
 * Fetch all outpasses from local cache.
 * @returns {Object[]}
 */
export async function getAllOutpasses() {
  return guardDb.outpasses.toArray();
}

/**
 * Update the local std_status of a single outpass (optimistic UI update).
 * @param {number} outpassId
 * @param {'In'|'Out'} newStatus
 */
export async function updateLocalOutpassStatus(outpassId, newStatus) {
  await guardDb.outpasses.update(outpassId, { std_status: newStatus });
}

/**
 * Remove a completed outpass from the local cache.
 * Called when a student returns (action: 'enter') — the outpass is
 * done and should no longer appear in the active list, even after refresh.
 * @param {number|string} outpassId
 */
export async function deleteOutpassFromCache(outpassId) {
  await guardDb.outpasses.delete(outpassId);
}

// ─── Action Logs (Offline Queue) ───────────────────────────

/**
 * Add a new gate action to the offline queue.
 * @param {Object} log
 * @param {string} log.id           - UUID (crypto.randomUUID())
 * @param {number} log.outpass_id
 * @param {'exit'|'enter'} log.action
 * @param {string} log.timestamp    - ISO string
 * @param {string} log.remark
 * @param {string} log.gate
 * @param {string} log.studentName
 * @param {string} log.rollNo
 * @param {string} log.hostel
 * @param {string} log.room
 * @param {string} log.outpassType
 * @param {'PENDING'} log.sync_status
 */
export async function enqueueActionLog(log) {
  await guardDb.action_logs.add(log);
}

/**
 * Fetch all PENDING or FAILED logs that need to be synced.
 * @returns {Object[]}
 */
export async function getPendingLogs() {
  return guardDb.action_logs
    .where('sync_status')
    .anyOf('PENDING', 'FAILED')
    .toArray();
}

/**
 * Mark a batch of logs as SYNCED so they stay in local history.
 * @param {string[]} ids - UUIDs of synced log entries
 */
export async function markLogsSynced(ids) {
  await guardDb.transaction('rw', guardDb.action_logs, async () => {
    for (const id of ids) {
      await guardDb.action_logs.update(id, { sync_status: 'SYNCED' });
    }
  });
}

/**
 * Mark a log as FAILED so it won't get stuck in SYNCING.
 * @param {string} id
 */
export async function markLogFailed(id) {
  await guardDb.action_logs.update(id, { sync_status: 'FAILED' });
}

/**
 * Mark a batch of logs as SYNCING to prevent double-sending.
 * @param {string[]} ids
 */
export async function markLogsSyncing(ids) {
  await guardDb.transaction('rw', guardDb.action_logs, async () => {
    for (const id of ids) {
      await guardDb.action_logs.update(id, { sync_status: 'SYNCING' });
    }
  });
}

/**
 * Fetch all logs (for display in GateLogs page).
 * Returns combined SYNCED + PENDING — ordered newest first.
 * @returns {Object[]}
 */
export async function getAllActionLogs() {
  const logs = await guardDb.action_logs.toArray();
  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Clear all local action logs (used by "Clear History" button).
 */
export async function clearAllActionLogs() {
  await guardDb.action_logs.clear();
}
