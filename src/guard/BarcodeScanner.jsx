import React, { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { apiFetch } from "../utils/api";

export default function BarcodeScanner() {
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [actionMode, setActionMode] = useState("auto"); // 'auto' | 'exit' | 'enter'
  const [cameraActive, setCameraActive] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const [cameraError, setCameraError] = useState(null);

  const html5QrCodeRef = useRef(null);
  const scannerContainerId = "guard-qr-reader";
  const lastScannedCodeRef = useRef("");
  const lastScannedTimeRef = useRef(0);
  const manualInputRef = useRef(null);

  // Web Audio feedback sound
  const playFeedbackSound = (type = "success") => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.25);
      } else {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.setValueAtTime(160, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      }
    } catch (e) {}
  };

  // Main scan execution function
  const processScan = async (outpassId) => {
    const cleanId = String(outpassId || "").trim();
    if (!cleanId || isProcessing) return;

    // Debounce duplicate scans within 3 seconds
    const now = Date.now();
    if (lastScannedCodeRef.current === cleanId && now - lastScannedTimeRef.current < 3000) {
      return;
    }
    lastScannedCodeRef.current = cleanId;
    lastScannedTimeRef.current = now;

    setIsProcessing(true);
    setErrorMsg(null);

    const gate = localStorage.getItem("guard_gate_location") || "Main Gate";

    try {
      const response = await apiFetch("/api/guard/scan", {
        method: "POST",
        body: JSON.stringify({
          outpass_id: cleanId,
          gate,
          action: actionMode,
        }),
      });

      const data = response.data || response;
      setScanResult(data);
      playFeedbackSound("success");

      // Add to recent scans list
      setRecentScans((prev) => [
        { ...data, timestamp: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);

      setManualCode("");
    } catch (err) {
      console.error("Scan processing error:", err);
      const message = err.message || "Failed to process outpass barcode";
      setErrorMsg(message);
      setScanResult(null);
      playFeedbackSound("error");
    } finally {
      setIsProcessing(false);
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
    }
  };

  // Hardware scanner listener: capture rapid barcode keystrokes
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      if (
        document.activeElement &&
        document.activeElement.tagName === "INPUT" &&
        document.activeElement !== manualInputRef.current
      ) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 150) {
        buffer = "";
      }
      lastKeyTime = currentTime;

      if (e.key === "Enter") {
        if (buffer.length >= 8) {
          e.preventDefault();
          processScan(buffer);
          buffer = "";
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionMode, isProcessing]);

  // Start Camera QR Scanner
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(scannerContainerId);
      }

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCodeRef.current.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          processScan(decodedText);
        },
        () => {}
      );
      setCameraActive(true);
    } catch (err) {
      console.error("Camera start error:", err);
      setCameraError(
        err.message || "Unable to access camera. Please grant camera permission or use a USB barcode scanner."
      );
      setCameraActive(false);
    }
  };

  // Stop Camera Scanner
  const stopCamera = async () => {
    if (html5QrCodeRef.current && cameraActive) {
      try {
        await html5QrCodeRef.current.stop();
        setCameraActive(false);
      } catch (err) {
        console.error("Failed to stop camera:", err);
      }
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) {
      processScan(manualCode);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[#6d0f16]/10 text-[#6d0f16]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Gate Barcode / QR Scanner</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Scan digital student outpasses using physical barcode scanners or your camera
              </p>
            </div>
          </div>
        </div>

        {/* Action Mode Toggle */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActionMode("auto")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              actionMode === "auto"
                ? "bg-[#6d0f16] text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            ? Auto Detect
          </button>
          <button
            type="button"
            onClick={() => setActionMode("exit")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              actionMode === "exit"
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            ?? Force Exit
          </button>
          <button
            type="button"
            onClick={() => setActionMode("enter")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              actionMode === "enter"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            ?? Force Return
          </button>
        </div>
      </div>

      {/* SCANNING & RESULT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: SCANNER CONTROLS */}
        <div className="lg:col-span-5 space-y-6">
          {/* CAMERA VIEWFINDER CARD */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`}></span>
                Live Camera Scanner
              </h3>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-1.5 bg-[#6d0f16] hover:bg-[#85131b] text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Turn Camera ON
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Turn Camera OFF
                </button>
              )}
            </div>

            {/* VIEWFINDER ELEMENT */}
            <div className="w-full bg-gray-900 rounded-2xl overflow-hidden min-h-[260px] flex items-center justify-center relative border border-gray-800 shadow-inner">
              <div id={scannerContainerId} className="w-full h-full"></div>
              {!cameraActive && (
                <div className="text-center p-6 text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-40 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-xs font-semibold text-gray-300">Camera is idle</p>
                  <p className="text-[11px] text-gray-500 mt-1 max-w-xs mx-auto">
                    Click "Turn Camera ON" or simply aim your USB Barcode Scanner gun at any outpass code.
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <p className="mt-3 text-xs font-medium text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 w-full text-center">
                {cameraError}
              </p>
            )}
          </div>

          {/* USB SCANNER / MANUAL INPUT FALLBACK */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-sm text-gray-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6d0f16]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Manual or USB Scanner Input
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Physical USB guns type into this field automatically upon scan. You can also paste an Outpass UUID.
            </p>

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="relative">
                <input
                  ref={manualInputRef}
                  type="text"
                  placeholder="Scan barcode or paste Outpass UUID..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  disabled={isProcessing}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-900 font-mono placeholder-gray-400 outline-none focus:border-[#6d0f16] focus:bg-white focus:ring-2 focus:ring-[#6d0f16]/10 transition"
                  autoFocus
                />
                {manualCode && (
                  <button
                    type="button"
                    onClick={() => setManualCode("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded cursor-pointer"
                  >
                    ?
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isProcessing || !manualCode.trim()}
                className="w-full bg-[#6d0f16] hover:bg-[#85131b] text-white py-3 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Processing Scan...
                  </>
                ) : (
                  "Verify & Log Entry"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: VERIFICATION RESULT & SCAN HISTORY */}
        <div className="lg:col-span-7 space-y-6">
          {/* RESULT STATUS BANNER */}
          {errorMsg && (
            <div className="p-6 rounded-3xl bg-red-50 border-2 border-red-200 text-red-900 shadow-md animate-in zoom-in-95 duration-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center font-bold text-2xl shrink-0 shadow-sm">
                  ?
                </div>
                <div className="flex-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-200 text-red-800 mb-1">
                    Scan Rejected
                  </span>
                  <h3 className="text-lg font-bold text-red-900">Verification Blocked</h3>
                  <p className="text-sm text-red-700 mt-1 font-medium">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}

          {scanResult && (
            <div
              className={`p-6 rounded-3xl border-2 shadow-lg animate-in zoom-in-95 duration-200 ${
                scanResult.action === "EXIT"
                  ? "bg-gradient-to-br from-red-50 to-orange-50/50 border-red-300"
                  : "bg-gradient-to-br from-emerald-50 to-teal-50/50 border-emerald-300"
              }`}
            >
              {/* STATUS HEADER */}
              <div className="flex items-center justify-between pb-5 border-b border-gray-200/80">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center font-black text-2xl shadow-md ${
                      scanResult.action === "EXIT" ? "bg-red-600" : "bg-emerald-600"
                    }`}
                  >
                    {scanResult.action === "EXIT" ? "OUT" : "IN"}
                  </div>
                  <div>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest ${
                        scanResult.action === "EXIT"
                          ? "bg-red-100 text-red-800 border border-red-200"
                          : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                      }`}
                    >
                      {scanResult.action === "EXIT" ? "?? Campus Exit Logged" : "?? Campus Return Logged"}
                    </span>
                    <h3 className="text-2xl font-black text-gray-900 mt-0.5">
                      {scanResult.student_name}
                    </h3>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gate Location</p>
                  <p className="text-sm font-extrabold text-gray-800">
                    {localStorage.getItem("guard_gate_location") || "Main Gate"}
                  </p>
                </div>
              </div>

              {/* DETAILS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mt-5">
                <ResultItem label="Roll Number" value={scanResult.roll_no} highlight />
                <ResultItem label="Hostel" value={scanResult.hostel} />
                <ResultItem label="Room No" value={scanResult.room || "N/A"} />
                <ResultItem label="Department" value={scanResult.department || "N/A"} />
                <ResultItem label="Outpass Type" value={scanResult.outpass_type || "Local"} />
                <ResultItem label="Phone" value={scanResult.phone || "-"} />
                <ResultItem
                  label="Place of Visit"
                  value={scanResult.place_of_visit || "-"}
                  colSpan="sm:col-span-2"
                />
                <ResultItem label="Purpose" value={scanResult.purpose || "-"} />
              </div>

              {/* FOOTER NOTICE */}
              <div className="mt-5 pt-4 border-t border-gray-200/60 flex items-center justify-between text-xs text-gray-500 font-medium">
                <span className="font-mono">Pass ID: {scanResult.outpass_id}</span>
                <span className="text-emerald-700 font-bold">? Synced to Database</span>
              </div>
            </div>
          )}

          {!scanResult && !errorMsg && (
            <div className="bg-white border border-dashed border-gray-300 rounded-3xl p-12 text-center text-gray-400 flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-16 h-16 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center mb-4 text-gray-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="font-bold text-gray-700 text-base">Awaiting Barcode Scan</h4>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                Point your scanner gun at a student's outpass QR code or turn on the camera to verify entry and exit in real time.
              </p>
            </div>
          )}

          {/* RECENT SCANS LOG */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="font-bold text-sm text-gray-800 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#6d0f16]"></span>
                Recent Scans (Current Session)
              </span>
              <span className="text-xs text-gray-400 font-medium">{recentScans.length} verified</span>
            </h3>

            {recentScans.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-6">No passes scanned yet in this session.</p>
            ) : (
              <div className="space-y-2.5">
                {recentScans.map((scan, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100 hover:bg-gray-100/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          scan.action === "EXIT" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {scan.action}
                      </span>
                      <div>
                        <p className="font-bold text-xs text-gray-900">{scan.student_name}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {scan.roll_no} • {scan.hostel} {scan.room ? `(${scan.room})` : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-gray-400">{scan.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultItem({ label, value, highlight, colSpan = "" }) {
  return (
    <div className={`bg-white/80 border border-gray-200/60 rounded-2xl p-3 shadow-xs ${colSpan}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`font-bold text-xs mt-0.5 truncate ${highlight ? "text-[#6d0f16] font-mono text-sm" : "text-gray-800"}`}>
        {value || "-"}
      </p>
    </div>
  );
}
