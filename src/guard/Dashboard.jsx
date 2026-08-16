import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllOutpasses,
  updateLocalOutpassStatus,
  deleteOutpassFromCache,
  enqueueActionLog,
} from "./db/queries.js";
import { initSyncEngine, destroySyncEngine, flushOfflineQueue } from "./sync/syncEngine.js";
import { useNetwork } from "./sync/useNetwork.js";

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NITH_HOSTELS = [
  { id: 'kailash', name: 'Kailash Boys Hostel' },
  { id: 'himgiri', name: 'Himgiri Boys Hostel' },
  { id: 'udaygiri', name: 'Udaygiri Boys Hostel' },
  { id: 'neelkanth', name: 'Neelkanth Boys Hostel' },
  { id: 'dhauladhar', name: 'Dhauladhar Boys Hostel' },
  { id: 'vindhyachal', name: 'Vindhyachal Boys Hostel' },
  { id: 'shivalik', name: 'Shivalik Boys Hostel' },
  { id: 'satpura', name: 'Satpura Hostel' },
  { id: 'ambika', name: 'Ambika Girls Hostel' },
  { id: 'parvati', name: 'Parvati Girls Hostel' },
  { id: 'mani-mahesh', name: 'Mani-Mahesh Girls Hostel' },
  { id: 'aravali', name: 'Aravali Girls Hostel' },
];

export default function GuardDashboard() {
  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Local-First State                                                       │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ UI State                                                                │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [hostel, setHostel] = useState("All");
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [remarks, setRemarks] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const limit = 9;

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Network Status                                                          │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const { isOnline, pendingCount } = useNetwork();

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Read from Dexie                                                         │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const reloadFromDb = useCallback(async () => {
    const rows = await getAllOutpasses();
    setData(rows);
    setLoading(false);
  }, []);

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Boot: init sync engine + read initial cache                             │
     └─────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    initSyncEngine(reloadFromDb);
    reloadFromDb();
    return () => destroySyncEngine();
  }, [reloadFromDb]);

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Gate Action (Single) — local-first                                      │
     └─────────────────────────────────────────────────────────────────────────┘ */
  async function handleGateAction(record, e) {
    if (e) e.stopPropagation();
    const outpassId = record.id || record.outpass_id;
    const isCurrentlyIn = record.std_status === "In" || !record.std_status;
    const targetAction = isCurrentlyIn ? "exit" : "enter";
    const currentRemark =
      remarks[outpassId] ||
      (isCurrentlyIn ? "Gate exit recorded" : "Returned safely to campus");

    try {
      setProcessingId(outpassId);
      await enqueueActionLog({
        id: crypto.randomUUID(),
        outpass_id: outpassId,
        action: targetAction,
        timestamp: new Date().toISOString(),
        remark: currentRemark,
        gate: "Main Gate",
        studentName: record.name,
        rollNo: record.roll_no,
        hostel: record.hostel,
        room: record.room_number || record.room || "-",
        outpassType: record.outpass_type || record.type || "Local",
        sync_status: "PENDING",
      });

      if (targetAction === "enter") {
        await deleteOutpassFromCache(outpassId);
      } else {
        await updateLocalOutpassStatus(outpassId, "Out");
      }

      if (targetAction === "enter") {
        setData((prev) => prev.filter((item) => (item.id || item.outpass_id) !== outpassId));
      } else {
        setData((prev) =>
          prev.map((item) => {
            const itemId = item.id || item.outpass_id;
            if (itemId === outpassId) return { ...item, std_status: "Out" };
            return item;
          })
        );
      }

      setRemarks((prev) => ({ ...prev, [outpassId]: "" }));
      setSelectedIds((prev) => prev.filter((i) => i !== outpassId));

      if (isOnline) flushOfflineQueue();
    } catch (err) {
      console.error(err);
      alert(err.message || `Failed to record ${targetAction}`);
    } finally {
      setProcessingId(null);
    }
  }

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Bulk Gate Action — local-first                                          │
     └─────────────────────────────────────────────────────────────────────────┘ */
  async function handleBulkGateAction(actionType) {
    if (!selectedIds.length) return;
    try {
      setBulkProcessing(true);
      const targets = data.filter((o) => {
        const id = o.id || o.outpass_id;
        const isCurrentlyIn = o.std_status === "In" || !o.std_status;
        const recordTargetAction = isCurrentlyIn ? "exit" : "enter";
        return selectedIds.includes(id) && recordTargetAction === actionType;
      });

      for (const record of targets) {
        await handleGateAction(record, null);
      }
    } catch (err) {
      console.error("Bulk processing error", err);
      alert(err.message || `Failed to bulk ${actionType}`);
    } finally {
      setBulkProcessing(false);
    }
  }

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Filter & Paginate                                                       │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const filtered = useMemo(() => {
    let list = data;
    if (status !== "All") list = list.filter((o) => o.std_status === status);
    if (typeFilter !== "All")
      list = list.filter((o) => {
        const itemType = (o.outpass_type || o.type || "Local").toLowerCase();
        return itemType === typeFilter.toLowerCase();
      });
    if (hostel !== "All") list = list.filter((o) => o.hostel === hostel);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          String(o.name || '').toLowerCase().includes(q) ||
          String(o.roll_no || '').toLowerCase().includes(q) ||
          String(o.room || '').toLowerCase().includes(q) ||
          String(o.hostel || '').toLowerCase().includes(q) ||
          String(o.place_of_visit || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, status, typeFilter, hostel]);

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  const paginatedList = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filtered.slice(startIndex, startIndex + limit);
  }, [filtered, page, limit]);

  const toggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleExpand = (id, e) => {
    e.stopPropagation();
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleSelectAllPage = () => {
    const pageIds = paginatedList.map((o) => o.id || o.outpass_id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  };

  return (
    <div className="font-sans space-y-6 pb-24 text-gray-800 bg-gray-50 min-h-screen px-4 py-8">

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#6d0f16] tracking-tight flex items-center gap-3">
            Gate Terminal
            <span className="flex h-3 w-3 relative ml-2 mt-1">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></span>
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 font-medium tracking-wide">
            Offline-first · Actions queue locally, sync when online
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-orange-100 text-orange-600 border border-orange-200 shadow-sm animate-pulse">
              {pendingCount} PENDING SYNC
            </div>
          )}

          <div className="bg-white border border-gray-100 rounded-3xl p-6 min-w-[140px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Inside</p>
            <p className="text-4xl font-bold text-[#6d0f16] mb-2">
              {data.filter((d) => d.std_status === 'In' || !d.std_status).length}
            </p>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-6 min-w-[140px] shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Outside</p>
            <p className="text-4xl font-bold text-[#6d0f16] mb-2">
              {data.filter((d) => d.std_status === 'Out').length}
            </p>
          </div>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full group">
            <input
              type="text"
              placeholder="Scan Barcode or Search by name, roll, hostel..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pl-12 text-sm font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 transition-all shadow-sm placeholder-gray-400"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg group-focus-within:text-blue-500 transition-colors"></span>
          </div>

          <select
            value={hostel}
            onChange={(e) => { setHostel(e.target.value); setPage(1); }}
            className="w-full md:w-48 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:border-[#6d0f16] cursor-pointer shadow-sm appearance-none"
            style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem top 50%', backgroundSize: '0.65rem auto' }}
          >
            <option value="All" className="bg-white">All Hostels</option>
            {NITH_HOSTELS.map((h) => (
              <option key={h.id} value={h.name} className="bg-white">{h.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={toggleSelectAllPage}
              className="text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-lg transition cursor-pointer shadow-sm"
            >
              {paginatedList.every((o) => selectedIds.includes(o.id || o.outpass_id)) && paginatedList.length > 0
                ? 'Deselect Page'
                : 'Select Page'}
            </button>

            <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
              {['All', 'In', 'Out'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                    status === s ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
            {['All', 'Local', 'Outstation'].map((t) => (
              <button
                key={t}
                onClick={() => { setTypeFilter(t); setPage(1); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  typeFilter === t ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CARDS GRID */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#6d0f16] border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider uppercase text-xs">Syncing Active Passes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm font-bold tracking-widest uppercase shadow-sm">
          No matching active outpasses
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {paginatedList.map((o) => {
              const targetId = o.id || o.outpass_id;
              const isProcessing = processingId === targetId;
              const isInCampus = o.std_status === 'In' || !o.std_status;
              const isOutstation = (o.outpass_type || o.type || '').toLowerCase() === 'outstation';
              const isSelected = selectedIds.includes(targetId);
              const isExpanded = expandedId === targetId;

              return (
                <div
                  key={targetId}
                  className={`bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative flex flex-col justify-between space-y-4 border ${
                    isSelected
                      ? 'border-[#6d0f16] ring-1 ring-[#6d0f16]/50 bg-[#6d0f16]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* TOP ROW */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="pt-1">
                        <div
                          onClick={(e) => toggleSelect(targetId, e)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#6d0f16] border-[#6d0f16]' : 'bg-white border-gray-300'
                          }`}
                        >
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-gray-900 truncate">{o.name}</h2>
                        <p className="text-[11px] font-bold text-gray-500 truncate tracking-wide mt-1">
                          {o.roll_no || 'No Roll'} • {o.degree_type || 'No Degree'}
                        </p>
                        <p className="text-[10px] font-bold text-[#6d0f16] truncate tracking-widest uppercase mt-0.5">
                          {o.hostel} ({o.room || '-'})
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                          isInCampus
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {isInCampus ? 'INSIDE' : 'OUTSIDE'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                          isOutstation
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-teal-50 text-teal-700 border-teal-200'
                        }`}
                      >
                        {isOutstation ? 'Outstation' : 'Local'}
                      </span>
                    </div>
                  </div>

                  {/* SUMMARY INFO */}
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-xs space-y-1.5">
                    <div className="flex justify-between text-gray-600">
                      <span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Destination</span>
                      <span className="font-bold truncate max-w-[160px] text-gray-900">{o.place_of_visit || '-'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span className="text-gray-500 font-bold uppercase text-[10px] tracking-widest">Return By</span>
                      <span className="font-bold text-gray-900 truncate">{formatDate(o.arrival_datetime)}</span>
                    </div>
                  </div>

                  {/* EXPANDED DETAILS */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Detail label="Phone" value={o.phone} />
                        <Detail label="Parent" value={o.parent_contact} />
                        <Detail label="Purpose" value={o.purpose} />
                        <Detail label="Departure" value={formatDate(o.departure_datetime)} />
                      </div>
                      <input
                        type="text"
                        placeholder="Add internal guard remark optional..."
                        value={remarks[targetId] || ''}
                        onChange={(e) =>
                          setRemarks((prev) => ({ ...prev, [targetId]: e.target.value }))
                        }
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 placeholder-gray-400"
                      />
                    </div>
                  )}

                  {/* ACTION BAR */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={(e) => toggleExpand(targetId, e)}
                      className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 font-bold text-xs transition cursor-pointer shrink-0"
                    >
                      {isExpanded ? 'Less ▆' : 'Details ╼'}
                    </button>

                    <button
                      onClick={(e) => handleGateAction(o, e)}
                      disabled={isProcessing}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
                        isInCampus
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {isProcessing ? (
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : isInCampus ? (
                        <span>Mark Exit</span>
                      ) : (
                        <span>Mark Return</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PAGINATION */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between text-sm text-gray-600 font-medium gap-4">
            <p className="font-bold tracking-wide text-xs">
              PAGE <span className="text-gray-900 text-sm px-1">{page}</span> OF {' '}
              <span className="text-gray-900 text-sm px-1">{totalPages}</span> <span className="text-gray-500">({totalItems} PASSES)</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-gray-100 transition cursor-pointer uppercase tracking-widest"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-gray-100 transition cursor-pointer uppercase tracking-widest"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING BULK ACTION BAR */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white px-6 py-4 rounded-2xl shadow-xl z-40 flex flex-col sm:flex-row items-center gap-5 border border-gray-200">
          <span className="text-sm font-bold text-gray-800 tracking-widest uppercase bg-gray-100 px-3 py-1 rounded-md">{selectedIds.length} Selected</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBulkGateAction('exit')}
              disabled={bulkProcessing}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-50"
            >
              Mark Exit
            </button>
            <button
              onClick={() => handleBulkGateAction('enter')}
              disabled={bulkProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-50"
            >
              Mark Return
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs font-bold text-gray-500 hover:text-gray-800 underline ml-2 cursor-pointer uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
      <p className="text-[9px] font-bold uppercase text-gray-500 tracking-widest">{label}</p>
      <p className="font-bold text-gray-800 truncate mt-1 text-xs">{value || '-'}</p>
    </div>
  );
}
