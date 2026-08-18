import React, { useState } from "react";

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HostelStudentVerifyModal({
  record,
  isOpen,
  onClose,
  onAction,
  isProcessing,
}) {
  const [remark, setRemark] = useState("");

  if (!isOpen || !record) return null;

  const targetId = record.id || record.outpass_id;
  const isInsideHostel = record.hostel_std_status === "In" || !record.hostel_std_status;
  const isFirstYear = record.current_year === 1;
  const isAutoExited = record.hostel_std_status === "Out" && record._auto_exit_hostel;
  const isOutstation = (record.outpass_type || record.type || "").toLowerCase() === "outstation";
  const isHome = (record.outpass_type || record.type || "").toLowerCase() === "home";

  const handleConfirmAction = async () => {
    const actionType = isInsideHostel ? "hostel_exit" : "hostel_enter";
    await onAction(record, actionType, remark);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in zoom-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col relative max-h-[90vh]">

        {/* Top Gradient Header */}
        <div className={`text-white p-6 pb-5 relative ${isInsideHostel ? 'bg-gradient-to-r from-[#6d0f16] to-[#8a1822]' : 'bg-gradient-to-r from-emerald-700 to-emerald-600'}`}>
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
          >
            ✕
          </button>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center text-2xl font-black shrink-0 shadow-inner">
              {record.name ? record.name.charAt(0).toUpperCase() : "S"}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black tracking-tight">{record.name}</h2>
                {isFirstYear && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-yellow-400/20 text-yellow-200 border border-yellow-400/40">
                    ⚠ 1st Year
                  </span>
                )}
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    isInsideHostel
                      ? "bg-emerald-400/20 text-emerald-200 border border-emerald-400/40"
                      : "bg-red-400/20 text-red-200 border border-red-400/40"
                  }`}
                >
                  {isInsideHostel ? "● Inside Hostel" : "● Outside Hostel"}
                </span>
              </div>
              <p className="text-xs text-white/80 font-semibold tracking-wide mt-1">
                Roll No: <span className="font-mono font-bold text-white">{record.roll_no || "N/A"}</span> • {record.degree_type || "B.Tech"} ({record.department || "NITH"})
              </p>
            </div>
          </div>
        </div>

        {/* First Year Warning */}
        {isFirstYear && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs font-medium flex items-start gap-2">
            <span className="text-base shrink-0">⚠️</span>
            <div>
              <p className="font-bold">First Year – Full Hostel Check Required</p>
              <p className="mt-0.5">Both hostel exit and hostel return must be manually recorded for 1st year students.</p>
            </div>
          </div>
        )}

        {/* Auto-exit Notice for non-1st-year already outside */}
        {isAutoExited && !isInsideHostel && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium flex items-start gap-2">
            <span className="text-base shrink-0">ℹ️</span>
            <div>
              <p className="font-bold">Hostel Exit Auto-Recorded</p>
              <p className="mt-0.5">Student was outside hostel when outpass was created. Manual hostel return required.</p>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Hostel & Room Badge */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hostel</p>
              <p className="text-xs font-bold text-[#6d0f16] mt-0.5 truncate">{record.hostel || "—"}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Room</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">{record.room_number || record.room || "-"}</p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pass Type</p>
              <p className={`text-xs font-black uppercase mt-0.5 ${isOutstation ? 'text-purple-700' : isHome ? 'text-blue-700' : 'text-teal-700'}`}>
                {record.outpass_type || record.type || "Local"}
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Year</p>
              <p className="text-xs font-bold text-gray-900 mt-0.5">
                {record.current_year ? `Year ${record.current_year}` : "—"}
              </p>
            </div>
          </div>

          {/* Visit & Timing Details */}
          <div className="bg-gradient-to-br from-gray-50 to-amber-50/20 border border-gray-200 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <span>📍</span> Outpass Details & Timing
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-400 font-bold text-[10px] uppercase block">Destination / Place</span>
                <span className="font-bold text-gray-900 text-sm mt-0.5 block">{record.place_of_visit || "Local Area"}</span>
              </div>
              <div>
                <span className="text-gray-400 font-bold text-[10px] uppercase block">Purpose of Visit</span>
                <span className="font-medium text-gray-700 text-xs mt-0.5 block">{record.purpose || "Not Specified"}</span>
              </div>
              <div>
                <span className="text-gray-400 font-bold text-[10px] uppercase block">Scheduled Departure</span>
                <span className="font-bold text-gray-800 mt-0.5 block">{formatDateTime(record.departure_datetime)}</span>
              </div>
              <div>
                <span className="text-gray-400 font-bold text-[10px] uppercase block">Expected Return Deadline</span>
                <span className="font-bold text-[#6d0f16] mt-0.5 block">{formatDateTime(record.arrival_datetime)}</span>
              </div>
            </div>
          </div>

          {/* Contact Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Phone</p>
                <p className="text-xs font-bold text-gray-900 font-mono mt-0.5">{record.phone || "N/A"}</p>
              </div>
              {record.phone && (
                <a href={`tel:${record.phone}`} className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-100 transition">
                  Call
                </a>
              )}
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Parent Contact</p>
                <p className="text-xs font-bold text-gray-900 font-mono mt-0.5">{record.parent_contact || record.parent_number || "N/A"}</p>
              </div>
              {(record.parent_contact || record.parent_number) && (
                <a href={`tel:${record.parent_contact || record.parent_number}`} className="px-3 py-1 bg-white border border-gray-200 text-[#6d0f16] rounded-lg text-xs font-bold hover:bg-gray-100 transition">
                  Call Parent
                </a>
              )}
            </div>
          </div>

          {/* Guard Remark */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 block mb-1.5">
              Guard Remark (Optional)
            </label>
            <input
              type="text"
              placeholder={isInsideHostel ? "e.g. Left hostel with bag" : "e.g. Returned to hostel on time"}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 shadow-inner"
            />
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={handleConfirmAction}
            disabled={isProcessing}
            className={`w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-xs uppercase tracking-widest text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
              isInsideHostel
                ? "bg-red-600 hover:bg-red-700 shadow-red-500/20"
                : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
            }`}
          >
            {isProcessing && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {isInsideHostel ? "🚪 Confirm Hostel EXIT" : "🏠 Confirm Hostel RETURN"}
          </button>
        </div>
      </div>
    </div>
  );
}
