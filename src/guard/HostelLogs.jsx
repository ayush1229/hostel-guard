import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getAllHostelActionLogs, clearAllHostelActionLogs } from "./db/queries.js";
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

export default function HostelLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [selectedDate, setSelectedDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;

  const { isOnline, pendingCount } = useNetwork();

  const reloadLogs = useCallback(async () => {
    const rows = await getAllHostelActionLogs();
    setLogs(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reloadLogs();
    const interval = setInterval(reloadLogs, 5000);
    return () => clearInterval(interval);
  }, [reloadLogs]);

  async function handleClearLogs() {
    if (window.confirm("Clear all hostel movement logs from this device?")) {
      await clearAllHostelActionLogs();
      setLogs([]);
      setPage(1);
    }
  }

  const filtered = useMemo(() => {
    let list = logs;
    if (actionFilter !== "All") {
      list = list.filter((l) => l.action === actionFilter);
    }
    if (selectedDate) {
      list = list.filter((l) => {
        if (!l.timestamp) return false;
        return new Date(l.timestamp).toISOString().slice(0, 10) === selectedDate;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          String(l.studentName || "").toLowerCase().includes(q) ||
          String(l.rollNo || "").toLowerCase().includes(q) ||
          String(l.hostel || "").toLowerCase().includes(q) ||
          String(l.room || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, actionFilter, selectedDate, search]);

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const paginated = useMemo(() => {
    return filtered.slice((page - 1) * limit, page * limit);
  }, [filtered, page, limit]);

  const syncedCount = logs.filter((l) => l.sync_status === "SYNCED").length;
  const pendingLocalCount = logs.filter((l) => l.sync_status === "PENDING" || l.sync_status === "SYNCING").length;
  const failedCount = logs.filter((l) => l.sync_status === "FAILED").length;

  return (
    <div className="font-sans space-y-6 pb-24 text-gray-800 bg-gray-50 min-h-screen px-4 py-8">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#6d0f16] tracking-tight">Hostel Movement Logs</h1>
          <p className="text-gray-500 text-sm mt-1 font-medium">
            {localStorage.getItem("guard_hostel_name") || "Hostel"} · Local device log history
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Stats */}
          <div className="flex gap-2 text-xs font-bold">
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg">
              {syncedCount} Synced
            </span>
            {pendingLocalCount > 0 && (
              <span className="bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1.5 rounded-lg animate-pulse">
                {pendingLocalCount} Pending
              </span>
            )}
            {failedCount > 0 && (
              <span className="bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-lg">
                {failedCount} Failed
              </span>
            )}
          </div>
          <button
            onClick={handleClearLogs}
            className="px-4 py-2 text-xs font-bold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition cursor-pointer"
          >
            Clear Logs
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <input
            type="text"
            placeholder="Search by name, roll, hostel..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 shadow-sm placeholder-gray-400"
          />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Action:</span>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
            {["All", "hostel_exit", "hostel_enter"].map((a) => (
              <button
                key={a}
                onClick={() => { setActionFilter(a); setPage(1); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  actionFilter === a ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {a === "hostel_exit" ? "Hostel Exit" : a === "hostel_enter" ? "Hostel Return" : "All"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* LOGS TABLE */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 shadow-sm flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[#6d0f16] border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider uppercase text-xs">Loading Logs...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm font-bold tracking-widest uppercase shadow-sm">
          No hostel movement logs found
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4">Student</th>
                    <th className="px-5 py-4">Hostel / Room</th>
                    <th className="px-5 py-4">Action</th>
                    <th className="px-5 py-4">Timestamp</th>
                    <th className="px-5 py-4">Remark</th>
                    <th className="px-5 py-4 text-center">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((log) => {
                    const isExit = log.action === "hostel_exit";
                    const syncColor =
                      log.sync_status === "SYNCED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : log.sync_status === "FAILED"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-orange-50 text-orange-700 border-orange-200";

                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold text-gray-900">{log.studentName || "-"}</p>
                          <p className="text-[11px] text-gray-500 font-mono">{log.rollNo || "-"}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-xs font-bold text-[#6d0f16] uppercase tracking-wide">{log.hostel || "-"}</p>
                          <p className="text-[11px] text-gray-500">Room {log.room || "-"}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest border ${
                              isExit
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            {isExit ? "🚪 Hostel Exit" : "🏠 Hostel Return"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-medium text-gray-700">{formatDate(log.timestamp)}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs text-gray-500 italic">{log.remark || "—"}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${syncColor}`}>
                            {log.sync_status || "PENDING"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PAGINATION */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between text-sm gap-4">
            <p className="font-bold tracking-wide text-xs text-gray-600">
              PAGE <span className="text-gray-900">{page}</span> OF <span className="text-gray-900">{totalPages}</span>
              <span className="text-gray-500 ml-1">({totalItems} LOGS)</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-gray-100 transition cursor-pointer uppercase"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="px-4 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-gray-100 transition cursor-pointer uppercase"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
