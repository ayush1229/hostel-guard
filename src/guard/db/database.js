/**
 * guard/db/database.js
 *
 * Local-first IndexedDB schema for the Guard Terminal.
 * Uses Dexie.js as the IDB wrapper.
 *
 * Tables:
 *  - outpasses       : approved outpass records pulled from server
 *  - action_logs     : offline queue of guard gate actions (PENDING → synced)
 */

import Dexie from 'dexie';

export const guardDb = new Dexie('GuardTerminalDB');

guardDb.version(1).stores({
  /**
   * Mirrors the server-side approved outpass records.
   * Primary key: id (server outpass integer ID)
   * Indexed fields for fast filtering in UI.
   */
  outpasses: 'id, roll_no, name, std_status, outpass_type, hostel, outp_status',

  /**
   * Offline action queue — every guard gate action is written here first.
   * Primary key: id (locally generated UUID via crypto.randomUUID())
   * sync_status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'
   */
  action_logs:
    'id, outpass_id, action, timestamp, sync_status',
});

export default guardDb;
