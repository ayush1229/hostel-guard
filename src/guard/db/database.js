/**
 * guard/db/database.js
 *
 * Local-first IndexedDB schema for the Guard Terminal.
 * Uses Dexie.js as the IDB wrapper.
 *
 * Tables:
 *  - outpasses            : approved outpass records for main gate (pulled from server)
 *  - action_logs          : offline queue of main gate actions (PENDING → synced)
 *  - hostel_outpasses     : approved outpass records for hostel gate
 *  - hostel_action_logs   : offline queue of hostel gate actions (PENDING → synced)
 */

import Dexie from 'dexie';

export const guardDb = new Dexie('GuardTerminalDB');

guardDb.version(1).stores({
  outpasses: 'id, roll_no, name, std_status, outpass_type, hostel, outp_status',
  action_logs: 'id, outpass_id, action, timestamp, sync_status',
});

// Version 2: adds hostel gate tables — existing tables unchanged
guardDb.version(2).stores({
  outpasses: 'id, roll_no, name, std_status, outpass_type, hostel, outp_status',
  action_logs: 'id, outpass_id, action, timestamp, sync_status',
  hostel_outpasses:
    'id, roll_no, name, hostel_std_status, outpass_type, hostel, hostel_id, outp_status',
  hostel_action_logs:
    'id, outpass_id, action, timestamp, sync_status',
});

export default guardDb;
