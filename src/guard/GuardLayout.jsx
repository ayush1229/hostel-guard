import React, { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const isHostelGate = () =>
  (localStorage.getItem("guard_type") || "MAIN_GATE") === "HOSTEL_GATE";

export default function GuardLayout() {
  const hostelGate = isHostelGate();
  const hostelName = localStorage.getItem("guard_hostel_name") || "Hostel Gate";
  const gateName = hostelGate
    ? hostelName
    : localStorage.getItem("guard_gate_location") || "Main Gate";

  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex bg-white overflow-hidden font-sans text-gray-800 antialiased">

      {/* ── MOBILE BACKDROP ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm h-full
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:relative md:translate-x-0 md:shrink-0
        `}
      >
        {/* LOGO HEADER */}
        <div className="px-6 py-8 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#6d0f16]">
              {hostelGate ? "Hostel Guard" : "Guard Panel"}
            </h1>
            <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-widest">
              {hostelGate ? "Hostel Gate Security" : "Campus Gate Security"}
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="md:hidden text-gray-500 hover:text-gray-800 text-xl leading-none p-1 cursor-pointer"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* NAVIGATION LINKS — adapts to guard type */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {hostelGate ? (
            <>
              <NavItem to="/hostel-dashboard" label="🏠 Hostel Terminal" onNavigate={() => setSidebarOpen(false)} />
              <NavItem to="/hostel-logs" label="📋 Hostel Logs" onNavigate={() => setSidebarOpen(false)} />
            </>
          ) : (
            <>
              <NavItem to="/scan" label="📷 Scan Barcode / QR" onNavigate={() => setSidebarOpen(false)} />
              <NavItem to="/dashboard" label="🚪 Gate Terminal" onNavigate={() => setSidebarOpen(false)} />
              <NavItem to="/logs" label="📋 Movement Logs" onNavigate={() => setSidebarOpen(false)} />
              <NavItem to="/dayscholar" label="🎓 Day Scholar" onNavigate={() => setSidebarOpen(false)} />
            </>
          )}
        </nav>

        {/* FOOTER */}
        <div className="px-4 py-5 border-t border-gray-100 shrink-0 space-y-3">
          <div className={`rounded-2xl p-4 text-xs flex items-center justify-between border ${hostelGate ? "border-blue-100 bg-blue-50/50" : "border-emerald-100 bg-emerald-50/50"}`}>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${hostelGate ? "text-blue-700" : "text-emerald-700"}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${hostelGate ? "bg-blue-600" : "bg-emerald-600"}`} />
                {localStorage.getItem("guard_device_name") || "Terminal Bound"}
              </p>
              <p className="font-bold text-gray-800 mt-0.5 text-sm truncate max-w-[140px]">{gateName}</p>
            </div>
            <div className="flex h-3 w-3 relative shrink-0">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hostelGate ? "bg-blue-400" : "bg-emerald-400"}`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${hostelGate ? "bg-blue-500" : "bg-emerald-500"}`} />
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN VIEWPORT ── */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">

        {/* TOP HEADER */}
        <header className="bg-white border-b border-gray-100 px-4 md:px-8 py-4 flex items-center gap-3 justify-between shrink-0 shadow-sm z-10">

          {/* Hamburger button — mobile only */}
          <button
            className="md:hidden text-2xl text-gray-700 hover:text-gray-900 leading-none shrink-0 cursor-pointer"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            ☰
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="text-base md:text-xl font-bold text-gray-900 tracking-tight flex flex-wrap items-center gap-2">
              {hostelGate ? "Hostel Movement Verification" : "Campus Gate Verification"}
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                🔒 Device Verified
              </span>
              {hostelGate && (
                <span className="bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  🏠 Hostel Gate
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-medium hidden sm:block">
              {hostelGate
                ? `Hostel in/out tracking · ${gateName}`
                : `Real-time student outpass tracking & logs · ${gateName}`}
            </p>
          </div>

          <div className="flex items-center gap-3 border border-gray-100 bg-gray-50 py-2 px-3 md:px-4 rounded-2xl shadow-sm shrink-0">
            <div className="text-right hidden sm:block">
              <p className="font-bold text-sm text-gray-800">
                {localStorage.getItem("guard_phone")
                  ? `Guard (${localStorage.getItem("guard_phone")})`
                  : "Security Guard"}
              </p>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Hardware Bound
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-[#6d0f16] text-white flex items-center justify-center font-black text-base shadow-sm">
              G
            </div>
          </div>
        </header>

        {/* ROUTE OUTLET */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-8 z-0 relative">
          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex items-center px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
          isActive
            ? "bg-[#6d0f16] text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`
      }
    >
      <span className="tracking-wide">{label}</span>
    </NavLink>
  );
}
