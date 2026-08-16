import React, { useCallback, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getAllActionLogs, clearAllActionLogs } from "./db/queries.js";
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

function isPast8PM(timestamp) {
  if (!timestamp) return false;
  return new Date(timestamp).getHours() >= 20;
}

export default function GateLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [selectedDate, setSelectedDate] = useState("");
  const [late8PMOnly, setLate8PMOnly] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 8;

  const { isOnline, pendingCount } = useNetwork();

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Load logs from Dexie                                                    │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const reloadLogs = useCallback(async () => {
    const rows = await getAllActionLogs();
    setLogs(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    reloadLogs();
    const interval = setInterval(reloadLogs, 5000);
    return () => clearInterval(interval);
  }, [reloadLogs]);

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Clear Logs                                                              │
     └─────────────────────────────────────────────────────────────────────────┘ */
  async function handleClearLogs() {
    if (window.confirm("Are you sure you want to clear all movement logs?")) {
      await clearAllActionLogs();
      setLogs([]);
      setPage(1);
    }
  }

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ Filter Logic                                                            │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        log.studentName?.toLowerCase().includes(q) ||
        log.rollNo?.toLowerCase().includes(q) ||
        log.hostel?.toLowerCase().includes(q) ||
        log.remark?.toLowerCase().includes(q);

      const matchesAction =
        actionFilter === "All" ||
        log.action?.toUpperCase() === actionFilter.toUpperCase();

      const matchesType =
        typeFilter === "All" ||
        (log.outpassType || "Local").toLowerCase() === typeFilter.toLowerCase();

      const matchesDate =
        !selectedDate || (log.timestamp && log.timestamp.startsWith(selectedDate));

      const matches8PM = !late8PMOnly || isPast8PM(log.timestamp);

      return matchesSearch && matchesAction && matchesType && matchesDate && matches8PM;
    });
  }, [logs, search, actionFilter, typeFilter, selectedDate, late8PMOnly]);

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredLogs.slice(start, start + limit);
  }, [filteredLogs, page, limit]);

  const handleFilterChange = (setter, val) => {
    setter(val);
    setPage(1);
  };

  /* ┌─────────────────────────────────────────────────────────────────────────┐
     │ PDF Export                                                              │
     └─────────────────────────────────────────────────────────────────────────┘ */
  const downloadPDFReport = () => {
    const doc = new jsPDF("landscape");
    doc.setFontSize(16);
    doc.setTextColor("#6d0f16");
    doc.text("Gate Movement Audit Logs Report", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor("#777");
    const dateText = selectedDate || "All Dates";
    const filterText = late8PMOnly ? " (Filtered: > 8:00 PM Only)" : "";
    doc.text(`Filter Date: ${dateText}${filterText} | Total Records: ${filteredLogs.length}`, 14, 22);

    autoTable(doc, {
      head: [["Student Name", "Roll No", "Hostel / Room", "Action", "Pass Type", "8 PM Check", "Sync Status", "Guard Remark", "Timestamp"]],
      body: filteredLogs.map((log) => [
        log.studentName || "-",
        log.rollNo || "-",
        `${log.hostel || "-"}${log.room ? ` / ${log.room}` : ""}`,
        (log.action || "-").toUpperCase(),
        log.outpassType || "Local",
        isPast8PM(log.timestamp) ? "LATE (> 8 PM)" : "Normal",
        log.sync_status || "PENDING",
        log.remark || "-",
        formatDate(log.timestamp),
      ]),
      startY: 28,
      theme: "striped",
      headStyles: { fillColor: [109, 15, 22], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    const fileDate = selectedDate || "All_Dates";
    doc.save(`Gate_Audit_Logs_${fileDate}.pdf`);
  };

  return (
    <div className="font-sans space-y-6 pb-24 text-gray-800 bg-gray-50 min-h-screen px-4 py-8">

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#6d0f16] tracking-tight flex items-center gap-3">
            Audit Logs
            <span className="flex h-3 w-3 relative ml-2 mt-1">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400 opacity-75' : 'bg-amber-400 opacity-75'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></span>
            </span>
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 font-medium tracking-wide">
            Historical audit logs of student exits and campus returns
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <button
            onClick={downloadPDFReport}
            disabled={filteredLogs.length === 0}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase tracking-widest"
          >
            Download PDF
          </button>
          <button
            onClick={handleClearLogs}
            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer uppercase tracking-widest"
          >
            Clear Logs
          </button>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative w-full group">
            <input
              type="text"
              placeholder="Search log by student name, roll, hostel or remark..."
              value={search}
              onChange={(e) => handleFilterChange(setSearch, e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 pl-12 text-sm font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 transition-all shadow-sm placeholder-gray-400"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg group-focus-within:text-blue-500 transition-colors"></span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleFilterChange(setSelectedDate, e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-3 text-sm font-bold text-gray-800 outline-none focus:border-[#6d0f16] transition-colors"
            />
            <button
              onClick={() => handleFilterChange(setSelectedDate, "")}
              className="text-xs text-[#6d0f16] hover:text-[#560c12] font-bold underline shrink-0 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mr-1">Action:</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
              {["All", "exit", "enter"].map((act) => (
                <button
                  key={act}
                  onClick={() => handleFilterChange(setActionFilter, act)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                    actionFilter === act
                      ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {act === "exit" ? "Exit" : act === "enter" ? "Returned" : "All Actions"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleFilterChange(setLate8PMOnly, !late8PMOnly)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                late8PMOnly
                  ? "bg-red-600 text-white border-red-700 shadow-sm"
                  : "bg-gray-100 text-gray-500 border-gray-200 hover:text-gray-700"
              }`}
            >
              <span>Late &gt; 8:00 PM</span>
            </button>

            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mx-1">Type:</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-1 shadow-inner border border-gray-200">
              {["All", "Local", "Outstation"].map((t) => (
                <button
                  key={t}
                  onClick={() => handleFilterChange(setTypeFilter, t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                    typeFilter === t
                      ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900">Audit Records</h2>
          <span className="text-xs font-bold text-gray-500">{filteredLogs.length} Records Found</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
            No matching audit logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200">
                <tr>
                  <th className="p-4 pl-6">Student</th>
                  <th className="p-4">Roll No</th>
                  <th className="p-4">Hostel / Room</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">Pass Type</th>
                  <th className="p-4">8 PM Check</th>
                  <th className="p-4">Sync</th>
                  <th className="p-4">Guard Remark</th>
                  <th className="p-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedLogs.map((log) => {
                  const isExit = log.action?.toLowerCase() === "exit";
                  const isOutstation = (log.outpassType || "").toLowerCase() === "outstation";
                  const isLatePast8PM = isPast8PM(log.timestamp);
                  const isPending = log.sync_status === "PENDING" || log.sync_status === "SYNCING";
                  const isFailed = log.sync_status === "FAILED";

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-gray-50 transition ${
                        isLatePast8PM ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="p-4 pl-6 font-bold text-gray-900">{log.studentName || "-"}</td>
                      <td className="p-4 text-xs font-medium text-gray-500">{log.rollNo || "-"}</td>
                      <td className="p-4 text-xs font-medium text-gray-500">
                        {log.hostel || "-"} {log.room ? ` / ${log.room}` : ""}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            isExit
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200"
                          }`}
                        >
                          {isExit ? "EXIT" : "RETURNED"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                            isOutstation
                              ? "bg-purple-50 text-purple-600 border-purple-200"
                              : "bg-teal-50 text-teal-600 border-teal-200"
                          }`}
                        >
                          {isOutstation ? "Outstation" : "Local"}
                        </span>
                      </td>
                      <td className="p-4">
                        {isLatePast8PM ? (
                          <span className="bg-red-50 text-red-600 border border-red-200 text-[11px] px-2 py-1 rounded-md font-bold flex items-center gap-1 w-fit">
                            &gt; 8:00 PM
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs font-medium">Normal</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isPending
                              ? "bg-orange-50 text-orange-600 border-orange-200"
                              : isFailed
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200"
                          }`}
                        >
                           {isPending ? "Pending" : isFailed ? "Failed" : "Synced"}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500 italic max-w-xs truncate">
                        "{log.remark || "No remark"}"
                      </td>
                      <td className="p-4 text-xs font-bold text-gray-700">
                        {formatDate(log.timestamp)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PAGINATION */}
      {totalItems > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 font-medium gap-4">
          <p className="font-bold tracking-wide text-xs">
            PAGE <span className="text-gray-900 text-sm px-1">{page}</span> OF {''}
            <span className="text-gray-900 text-sm px-1">{totalPages}</span> <span className="text-gray-400">({totalItems} records)</span>
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
      )}
    </div>
  );
}
