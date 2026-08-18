import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllHostelOutpasses,
  replaceHostelOutpassCache,
  updateLocalHostelOutpassStatus,
  deleteHostelOutpassFromCache,
  enqueueHostelActionLog,
  findHostelOutpassByIdOrRoll,
} from "./db/queries.js";
import {
  initHostelSyncEngine,
  destroyHostelSyncEngine,
  flushHostelQueue,
} from "./sync/hostelSyncEngine.js";
import { useNetwork } from "./sync/useNetwork.js";
import QRScannerModal from "./QRScannerModal.jsx";
import HostelStudentVerifyModal from "./HostelStudentVerifyModal.jsx";

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

export default function HostelDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isForceSyncing, setIsForceSyncing] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [processingId, setProcessingId] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [remarks, setRemarks] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const limit = 9;

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [verifiedRecord, setVerifiedRecord] = useState(null);

  const { isOnline, pendingCount } = useNetwork();

  const reloadFromDb = useCallback(async () => {
    const rows = await getAllHostelOutpasses();
    setData(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    // On mount: wipe stale cache from any previously paired hostel
    // so that the correct hostel's data is pulled fresh
    const lastSyncHostelId = localStorage.getItem("hostel_guard_last_hostel_id");
    const currentHostelId = localStorage.getItem("guard_hostel_id");
    if (lastSyncHostelId && lastSyncHostelId !== currentHostelId) {
      localStorage.removeItem("hostel_guard_last_sync_at");
    }
    if (currentHostelId) {
      localStorage.setItem("hostel_guard_last_hostel_id", currentHostelId);
    }

    initHostelSyncEngine(reloadFromDb);
    reloadFromDb();
    return () => destroyHostelSyncEngine();
  }, [reloadFromDb]);

  async function handleForceRefresh() {
    if (!isOnline) return;
    try {
      setIsForceSyncing(true);
      localStorage.removeItem("hostel_guard_last_sync_at");
      await replaceHostelOutpassCache([]);
      await flushHostelQueue();
      await reloadFromDb();
    } finally {
      setIsForceSyncing(false);
    }
  }

  /* ── Hostel Gate Action ──────────────────────────────────── */
  async function handleHostelAction(record, e, customRemark) {
    if (e) e.stopPropagation();
    const outpassId = record.id || record.outpass_id;
    const isInsideHostel = record.hostel_std_status === "In" || !record.hostel_std_status;
    const targetAction = isInsideHostel ? "hostel_exit" : "hostel_enter";
    const currentRemark =
      customRemark ||
      remarks[outpassId] ||
      (isInsideHostel ? "Hostel exit recorded" : "Returned to hostel");

    try {
      setProcessingId(outpassId);
      await enqueueHostelActionLog({
        id: crypto.randomUUID(),
        outpass_id: outpassId,
        action: targetAction,
        timestamp: new Date().toISOString(),
        remark: currentRemark,
        gate: localStorage.getItem("guard_gate_location") || "Hostel Gate",
        studentName: record.name,
        rollNo: record.roll_no,
        hostel: record.hostel,
        room: record.room_number || record.room || "-",
        outpassType: record.outpass_type || record.type || "Local",
        sync_status: "PENDING",
      });

      if (targetAction === "hostel_enter") {
        await deleteHostelOutpassFromCache(outpassId);
      } else {
        await updateLocalHostelOutpassStatus(outpassId, "Out");
      }

      if (targetAction === "hostel_enter") {
        setData((prev) => prev.filter((item) => (item.id || item.outpass_id) !== outpassId));
      } else {
        setData((prev) =>
          prev.map((item) => {
            const itemId = item.id || item.outpass_id;
            if (itemId === outpassId) return { ...item, hostel_std_status: "Out" };
            return item;
          })
        );
      }

      setRemarks((prev) => ({ ...prev, [outpassId]: "" }));
      setSelectedIds((prev) => prev.filter((i) => i !== outpassId));
      setVerifiedRecord(null);

      if (isOnline) flushHostelQueue();
    } catch (err) {
      console.error(err);
      alert(err.message || `Failed to record ${targetAction}`);
    } finally {
      setProcessingId(null);
    }
  }

  /* ── QR Scan ─────────────────────────────────────────────── */
  async function handleQRScanSuccess(scannedText) {
    if (!scannedText) return;
    let targetKey = scannedText.trim();

    try {
      if (targetKey.startsWith("{") && targetKey.endsWith("}")) {
        const parsed = JSON.parse(targetKey);
        targetKey = parsed.outpassId || parsed.id || parsed.rollNo || parsed.roll_no || targetKey;
      }
    } catch (_) {}

    const cleanId = targetKey.replace(/^OP-/i, "");

    const found =
      (await findHostelOutpassByIdOrRoll(cleanId)) ||
      (await findHostelOutpassByIdOrRoll(targetKey));

    if (found) {
      setIsScannerOpen(false);
      setVerifiedRecord(found);
      return;
    }

    const inMemoryMatch = data.find(
      (o) =>
        String(o.id) === cleanId ||
        String(o.outpass_id) === cleanId ||
        String(o.roll_no).toLowerCase() === cleanId.toLowerCase()
    );

    if (inMemoryMatch) {
      setIsScannerOpen(false);
      setVerifiedRecord(inMemoryMatch);
      return;
    }

    alert(
      `No active approved outpass found matching "${targetKey}".\nVerify the outpass has been approved by hostel authority.`
    );
  }

  /* ── Bulk Action ─────────────────────────────────────────── */
  async function handleBulkHostelAction(actionType) {
    if (!selectedIds.length) return;
    try {
      setBulkProcessing(true);
      const targets = data.filter((o) => {
        const id = o.id || o.outpass_id;
        const isInsideHostel = o.hostel_std_status === "In" || !o.hostel_std_status;
        const recordTargetAction = isInsideHostel ? "hostel_exit" : "hostel_enter";
        return selectedIds.includes(id) && recordTargetAction === actionType;
      });

      for (const record of targets) {
        await handleHostelAction(record, null);
      }
    } catch (err) {
      alert(err.message || `Failed to bulk ${actionType}`);
    } finally {
      setBulkProcessing(false);
    }
  }

  /* ── Filter & Paginate ───────────────────────────────────── */
  const myHostelId = localStorage.getItem("guard_hostel_id");
  const myHostelName = localStorage.getItem("guard_hostel_name");

  const filtered = useMemo(() => {
    let list = data;
    if (myHostelId) {
      list = list.filter(
        (o) =>
          o.hostel_id === myHostelId ||
          (myHostelName && o.hostel && o.hostel.toLowerCase().includes(myHostelName.toLowerCase()))
      );
    }
    if (statusFilter === "Inside") list = list.filter((o) => o.hostel_std_status === "In" || !o.hostel_std_status);
    if (statusFilter === "Outside") list = list.filter((o) => o.hostel_std_status === "Out");
    if (yearFilter === "1st Year") list = list.filter((o) => o.current_year === 1);
    if (yearFilter === "2nd+ Year") list = list.filter((o) => o.current_year && o.current_year > 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (o) =>
          String(o.name || "").toLowerCase().includes(q) ||
          String(o.roll_no || "").toLowerCase().includes(q) ||
          String(o.room || "").toLowerCase().includes(q) ||
          String(o.hostel || "").toLowerCase().includes(q) ||
          String(o.place_of_visit || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, statusFilter, yearFilter, myHostelId, myHostelName]);

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const paginatedList = useMemo(() => {
    const startIndex = (page - 1) * limit;
    return filtered.slice(startIndex, startIndex + limit);
  }, [filtered, page, limit]);

  const toggleSelect = (id, e) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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

  const hostelName = localStorage.getItem("guard_hostel_name") || "Hostel";

  return (
    <div className="font-sans space-y-6 pb-24 text-gray-800 bg-gray-50 min-h-screen px-4 py-8">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#6d0f16] tracking-tight flex items-center gap-3">
            Hostel Gate Terminal
            <span className="flex h-3 w-3 relative ml-2 mt-1">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? "bg-emerald-400 opacity-75" : "bg-amber-400 opacity-75"}`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"}`} />
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 font-medium tracking-wide">
            {hostelName} · Offline-first · Actions queue locally, sync when online
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* FORCE SYNC */}
          {isOnline && (
            <button
              onClick={handleForceRefresh}
              disabled={isForceSyncing}
              title="Force clear cache and re-pull all outpasses"
              className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <span className={`text-base leading-none ${isForceSyncing ? "animate-spin inline-block" : ""}`}>🔄</span>
              <span className="hidden sm:inline">{isForceSyncing ? "Syncing..." : "Sync"}</span>
            </button>
          )}

          {/* QR SCAN */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider text-white bg-[#6d0f16] hover:bg-[#560c12] active:scale-95 shadow-md shadow-[#6d0f16]/20 transition cursor-pointer"
          >
            <span className="text-base leading-none">📷</span>
            <span>Scan Student QR</span>
          </button>

          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-orange-100 text-orange-600 border border-orange-200 shadow-sm animate-pulse">
              {pendingCount} PENDING SYNC
            </div>
          )}

          {/* Stats */}
          <div className="bg-white border border-gray-100 rounded-3xl p-5 min-w-[120px] shadow-sm flex flex-col justify-center text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">In Hostel</p>
            <p className="text-3xl font-bold text-[#6d0f16]">
              {data.filter((d) => d.hostel_std_status === "In" || !d.hostel_std_status).length}
            </p>
          </div>
          <div className="bg-white border border-gray-100 rounded-3xl p-5 min-w-[120px] shadow-sm flex flex-col justify-center text-center">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Out of Hostel</p>
            <p className="text-3xl font-bold text-[#6d0f16]">
              {data.filter((d) => d.hostel_std_status === "Out").length}
            </p>
          </div>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <input
              type="text"
              placeholder="Search by name, roll, room..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 transition-all shadow-sm placeholder-gray-400"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-gray-100 text-sm">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={toggleSelectAllPage}
              className="text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-4 py-2 rounded-lg transition cursor-pointer shadow-sm"
            >
              {paginatedList.every((o) => selectedIds.includes(o.id || o.outpass_id)) && paginatedList.length > 0
                ? "Deselect Page"
                : "Select Page"}
            </button>

            {/* Status Filter */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
              {["All", "Inside", "Outside"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                    statusFilter === s ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Year Filter */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
            {["All", "1st Year", "2nd+ Year"].map((y) => (
              <button
                key={y}
                onClick={() => { setYearFilter(y); setPage(1); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  yearFilter === y ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CARDS TABLE */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#6d0f16] border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider uppercase text-xs">Syncing Hostel Passes...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm font-bold tracking-widest uppercase shadow-sm">
          No matching active outpasses for this hostel
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── DESKTOP TABLE (md+) ── */}
          <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4 w-12 text-center">
                      <div
                        onClick={toggleSelectAllPage}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors mx-auto ${
                          paginatedList.length > 0 && paginatedList.every((o) => selectedIds.includes(o.id || o.outpass_id))
                            ? "bg-[#6d0f16] border-[#6d0f16]"
                            : "bg-white border-gray-300"
                        }`}
                      >
                        {paginatedList.length > 0 && paginatedList.every((o) => selectedIds.includes(o.id || o.outpass_id)) && (
                          <span className="text-white text-xs">✓</span>
                        )}
                      </div>
                    </th>
                    <th className="px-5 py-4">Student</th>
                    <th className="px-5 py-4 hidden md:table-cell">Room</th>
                    <th className="px-5 py-4 hidden lg:table-cell">Destination</th>
                    <th className="px-5 py-4">Return By</th>
                    <th className="px-5 py-4 text-center">Hostel Status</th>
                    <th className="px-5 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedList.map((o) => {
                    const targetId = o.id || o.outpass_id;
                    const isProcessing = processingId === targetId;
                    const isInsideHostel = o.hostel_std_status === "In" || !o.hostel_std_status;
                    const isFirstYear = o.current_year === 1;
                    const isSelected = selectedIds.includes(targetId);
                    const isExpanded = expandedId === targetId;
                    const isAutoExited = o.hostel_std_status === "Out" && o._auto_exit_hostel;

                    return (
                      <React.Fragment key={targetId}>
                        <tr
                          className={`hover:bg-gray-50 transition-colors cursor-pointer ${isSelected ? "bg-[#6d0f16]/5" : ""}`}
                          onClick={(e) => toggleExpand(targetId, e)}
                        >
                          <td className="px-5 py-4 text-center">
                            <div
                              onClick={(e) => toggleSelect(targetId, e)}
                              className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors mx-auto ${
                                isSelected ? "bg-[#6d0f16] border-[#6d0f16]" : "bg-white border-gray-300"
                              }`}
                            >
                              {isSelected && <span className="text-white text-xs">✓</span>}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div>
                                <h2 className="text-sm font-bold text-gray-900 truncate">{o.name}</h2>
                                <p className="text-[11px] font-bold text-gray-500 truncate tracking-wide mt-0.5">
                                  {o.roll_no || "No Roll"} •{" "}
                                  {isFirstYear ? (
                                    <span className="text-amber-600 font-bold">1st Year ⚠</span>
                                  ) : (
                                    <span>Year {o.current_year || "?"}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 hidden md:table-cell">
                            <p className="text-xs font-bold text-[#6d0f16] truncate tracking-widest uppercase">
                              Room {o.room || o.room_number || "-"}
                            </p>
                          </td>
                          <td className="px-5 py-4 hidden lg:table-cell">
                            <span className="font-semibold truncate max-w-[160px] text-gray-900 inline-block">
                              {o.place_of_visit || "-"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="font-semibold text-gray-900">{formatDate(o.arrival_datetime)}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                                  isInsideHostel
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                                }`}
                              >
                                {isInsideHostel ? "IN HOSTEL" : "OUT OF HOSTEL"}
                              </span>
                              {isAutoExited && !isInsideHostel && (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-600 border-blue-200">
                                  Auto-exit
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); setVerifiedRecord(o); }}
                                className="px-3.5 py-1.5 rounded-lg bg-gray-100 hover:bg-[#6d0f16] hover:text-white border border-gray-200 text-gray-700 font-bold text-[11px] transition cursor-pointer"
                              >
                                Verify & Info
                              </button>
                              <button
                                onClick={(e) => handleHostelAction(o, e)}
                                disabled={isProcessing}
                                className={`px-4 py-1.5 rounded-lg font-bold text-[11px] uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer ${
                                  isInsideHostel
                                    ? "bg-red-600 hover:bg-red-700 text-white"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                }`}
                              >
                                {isProcessing && (
                                  <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                                )}
                                {isInsideHostel ? "Hostel Exit" : "Hostel Return"}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-gray-50/80 border-b border-gray-200">
                            <td colSpan="7" className="px-5 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                                <Detail label="Phone" value={o.phone} />
                                <Detail label="Parent" value={o.parent_contact} />
                                <Detail label="Purpose" value={o.purpose} />
                                <Detail label="Departure" value={formatDate(o.departure_datetime)} />
                              </div>
                              <input
                                type="text"
                                placeholder="Add hostel guard remark (optional)..."
                                value={remarks[targetId] || ""}
                                onChange={(e) => setRemarks((prev) => ({ ...prev, [targetId]: e.target.value }))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 placeholder-gray-400 shadow-inner"
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── MOBILE CARD LIST (< md) ── */}
          <div className="md:hidden space-y-3">
            {paginatedList.map((o) => {
              const targetId = o.id || o.outpass_id;
              const isProcessing = processingId === targetId;
              const isInsideHostel = o.hostel_std_status === "In" || !o.hostel_std_status;
              const isFirstYear = o.current_year === 1;
              const isSelected = selectedIds.includes(targetId);
              const isExpanded = expandedId === targetId;
              const isAutoExited = o.hostel_std_status === "Out" && o._auto_exit_hostel;

              return (
                <div
                  key={targetId}
                  className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-colors ${
                    isSelected ? "border-[#6d0f16]/40 bg-[#6d0f16]/5" : "border-gray-200"
                  }`}
                >
                  {/* Card header row */}
                  <div
                    className="flex items-start gap-3 px-4 pt-4 pb-3 cursor-pointer"
                    onClick={(e) => toggleExpand(targetId, e)}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={(e) => toggleSelect(targetId, e)}
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                        isSelected ? "bg-[#6d0f16] border-[#6d0f16]" : "bg-white border-gray-300"
                      }`}
                    >
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>

                    {/* Student info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-bold text-gray-900 truncate">{o.name}</h2>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border shrink-0 ${
                            isInsideHostel
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          {isInsideHostel ? "IN" : "OUT"}
                        </span>
                        {isAutoExited && !isInsideHostel && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border bg-blue-50 text-blue-600 border-blue-200 shrink-0">
                            Auto-exit
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-gray-500 tracking-wide mt-0.5">
                        {o.roll_no || "No Roll"} •{" "}
                        {isFirstYear ? (
                          <span className="text-amber-600 font-bold">1st Year ⚠</span>
                        ) : (
                          <span>Year {o.current_year || "?"}</span>
                        )}
                        {" "}· Room {o.room || o.room_number || "-"}
                      </p>
                      <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                        Return by: <span className="text-gray-700 font-semibold">{formatDate(o.arrival_datetime)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 px-4 pb-4">
                    <button
                      onClick={(e) => { e.stopPropagation(); setVerifiedRecord(o); }}
                      className="flex-1 px-3 py-2 rounded-xl bg-gray-100 hover:bg-[#6d0f16] hover:text-white border border-gray-200 text-gray-700 font-bold text-xs transition cursor-pointer text-center"
                    >
                      Verify &amp; Info
                    </button>
                    <button
                      onClick={(e) => handleHostelAction(o, e)}
                      disabled={isProcessing}
                      className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer ${
                        isInsideHostel
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                    >
                      {isProcessing && (
                        <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      )}
                      {isInsideHostel ? "Exit" : "Return"}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/80">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <Detail label="Phone" value={o.phone} />
                        <Detail label="Parent" value={o.parent_contact} />
                        <Detail label="Purpose" value={o.purpose} />
                        <Detail label="Departure" value={formatDate(o.departure_datetime)} />
                      </div>
                      <input
                        type="text"
                        placeholder="Add hostel guard remark (optional)..."
                        value={remarks[targetId] || ""}
                        onChange={(e) => setRemarks((prev) => ({ ...prev, [targetId]: e.target.value }))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 placeholder-gray-400 shadow-inner"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* PAGINATION */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between text-sm text-gray-600 font-medium gap-4">
            <p className="font-bold tracking-wide text-xs">
              PAGE <span className="text-gray-900 text-sm px-1">{page}</span> OF{" "}
              <span className="text-gray-900 text-sm px-1">{totalPages}</span>{" "}
              <span className="text-gray-500">({totalItems} PASSES)</span>
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
          <span className="text-sm font-bold text-gray-800 tracking-widest uppercase bg-gray-100 px-3 py-1 rounded-md">
            {selectedIds.length} Selected
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleBulkHostelAction("hostel_exit")}
              disabled={bulkProcessing}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-50"
            >
              Mark Hostel Exit
            </button>
            <button
              onClick={() => handleBulkHostelAction("hostel_enter")}
              disabled={bulkProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-50"
            >
              Mark Hostel Return
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

      {/* QR SCANNER */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleQRScanSuccess}
      />

      {/* HOSTEL VERIFY MODAL */}
      <HostelStudentVerifyModal
        record={verifiedRecord}
        isOpen={Boolean(verifiedRecord)}
        onClose={() => setVerifiedRecord(null)}
        onAction={(rec, act, rem) => handleHostelAction(rec, null, rem)}
        isProcessing={processingId === (verifiedRecord?.id || verifiedRecord?.outpass_id)}
      />
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
      <p className="text-[9px] font-bold uppercase text-gray-500 tracking-widest">{label}</p>
      <p className="font-bold text-gray-800 truncate mt-1 text-xs">{value || "-"}</p>
    </div>
  );
}
