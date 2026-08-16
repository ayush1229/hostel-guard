import React, { useState, useEffect, useMemo } from "react";
import { apiFetch } from "../utils/api";

export default function DayScholar() {
  const [scholars, setScholars] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("directory"); // 'directory' | 'logs'
  const [actionLoading, setActionLoading] = useState(null); // id of scholar being actioned

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [scholarsData, logsData] = await Promise.all([
        apiFetch("/api/guard/dayscholar"),
        apiFetch("/api/guard/dayscholar/logs")
      ]);

      setScholars(Array.isArray(scholarsData) ? scholarsData : []);
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error(err);
      setError("Unable to load day scholar data. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(scholarId, direction) {
    setActionLoading(scholarId);
    try {
      await apiFetch("/api/guard/dayscholar/log", {
        method: "POST",
        body: JSON.stringify({
          scholar_id: scholarId,
          direction: direction
        })
      });

      // Refresh logs after action
      const logsData = await apiFetch("/api/guard/dayscholar/logs");
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error(err);
      alert("Error marking " + direction + ": " + err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const filteredScholars = useMemo(() => {
    return scholars.filter((s) => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.roll_no.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [scholars, searchQuery]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => 
      l.scholar_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      l.scholar_roll_no?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [logs, searchQuery]);

  return (
    <div className="font-sans space-y-6 pb-24 text-gray-800 bg-gray-50 min-h-screen px-4 py-8">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#6d0f16] tracking-tight flex items-center gap-3">
            Day Scholar Terminal
          </h1>
          <p className="text-gray-500 text-sm mt-1.5 font-medium tracking-wide">
            Manage entries and exits for non-residential students
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="relative group">
            <input
              type="text"
              placeholder="Search name or roll no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-white border border-gray-200 rounded-xl px-4 py-2.5 pl-10 text-sm font-medium text-gray-800 outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 shadow-sm placeholder-gray-400 transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 border border-red-200 p-4 rounded-xl text-sm font-bold tracking-wide flex items-center gap-3 shadow-sm">
          {error}
        </div>
      )}

      {/* TABS */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('directory')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 cursor-pointer ${
            activeTab === 'directory'
              ? 'border-[#6d0f16] text-[#6d0f16]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Scholars Directory ({scholars.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 px-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 cursor-pointer ${
            activeTab === 'logs'
              ? 'border-[#6d0f16] text-[#6d0f16]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Recent Logs ({logs.length})
        </button>
      </div>

      {/* CONTENT */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 shadow-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-10 h-10 border-4 border-[#6d0f16] border-t-transparent rounded-full animate-spin" />
          <p className="font-bold tracking-wider uppercase text-xs">Loading data...</p>
        </div>
      ) : activeTab === 'directory' ? (
        filteredScholars.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-400 text-sm font-bold tracking-widest uppercase shadow-sm">
            No scholars found matching criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredScholars.map(scholar => {
              const lastLog = logs.find(l => l.day_scholar_id === scholar.id);
              const isInCampus = lastLog ? lastLog.direction === 'ENTRY' : false;
              const isProcessing = actionLoading === scholar.id;
              
              return (
                <div key={scholar.id} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] relative overflow-hidden group hover:border-gray-200 transition-colors flex flex-col justify-center hover:shadow-md transition-all flex flex-col justify-between h-full">
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{scholar.name}</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">{scholar.roll_no}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest border ${
                        isInCampus 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {isInCampus ? 'INSIDE' : 'OUTSIDE'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <p><span className="font-bold text-gray-500 uppercase tracking-widest text-[9px] mr-2">Dept:</span> {scholar.degree_type || '-'}</p>
                      <p><span className="font-bold text-gray-500 uppercase tracking-widest text-[9px] mr-2">Phone:</span> {scholar.phone || '-'}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => handleAction(scholar.id, isInCampus ? 'EXIT' : 'ENTRY')}
                    disabled={isProcessing}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer ${
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
                      <span>Mark Entry</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* LOGS TAB */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900">Recent Logs</h2>
            <span className="text-xs font-bold text-gray-500">{filteredLogs.length} Records</span>
          </div>
          
          {filteredLogs.length === 0 ? (
            <div className="p-16 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
              No recent logs.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-500 font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-4 pl-6">Student</th>
                    <th className="p-4">Action</th>
                    <th className="p-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLogs.map(log => {
                    const isExit = log.direction === 'EXIT';
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition">
                        <td className="p-4 pl-6">
                          <p className="font-bold text-gray-900">{log.scholar_name}</p>
                          <p className="text-xs text-gray-500">{log.scholar_roll_no}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            isExit
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-emerald-50 text-emerald-600 border-emerald-200"
                          }`}>
                            {isExit ? "EXIT" : "ENTRY"}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-bold text-gray-700">
                          {new Date(log.timestamp).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'medium'
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
