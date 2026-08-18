import React from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function GuardLayout() {
  return (
    <div className="h-screen w-screen flex bg-white overflow-hidden font-sans text-gray-800 antialiased">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm shrink-0 h-full z-20">

        {/* LOGO HEADER */}
        <div className="px-6 py-8 border-b border-gray-100 shrink-0">
          <h1 className="text-xl font-extrabold tracking-tight text-[#6d0f16]">
            Guard Panel
          </h1>
          <p className="text-xs text-gray-400 mt-1 font-medium uppercase tracking-widest">
            Campus Gate Security
          </p>
        </div>

        {/* NAVIGATION LINKS */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem to="/scan" label="📷 Scan Barcode / QR" />
          <NavItem to="/dashboard" label="Gate Terminal" />
          <NavItem to="/logs" label="Movement Logs" />
          <NavItem to="/dayscholar" label="Day Scholar" />
        </nav>

        {/* FOOTER */}
        <div className="px-4 py-5 border-t border-gray-100 shrink-0 space-y-3">
          <div className="rounded-2xl p-4 text-xs flex items-center justify-between border border-emerald-100 bg-emerald-50/50">
            <div>
              <p className="text-emerald-700 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                {localStorage.getItem('guard_device_name') || 'Terminal Bound'}
              </p>
              <p className="font-bold text-gray-800 mt-0.5 text-sm">
                {localStorage.getItem('guard_gate_location') || 'Main Gate'}
              </p>
            </div>
            <div className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">

        {/* TOP HEADER */}
        <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              Hostel Movement Verification
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                🔒 Device Verified
              </span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-medium">
              Real-time student outpass tracking &amp; logs • {localStorage.getItem('guard_gate_location') || 'Main Gate'}
            </p>
          </div>

          <div className="flex items-center gap-3 border border-gray-100 bg-gray-50 py-2 px-4 rounded-2xl shadow-sm">
            <div className="text-right">
              <p className="font-bold text-sm text-gray-800">
                {localStorage.getItem('guard_phone') ? `Guard (${localStorage.getItem('guard_phone')})` : 'Security Guard'}
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
        <main className="flex-1 overflow-y-auto bg-gray-50 p-8 z-0 relative">
          <div className="max-w-7xl mx-auto min-h-full flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
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