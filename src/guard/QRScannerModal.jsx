import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [manualInput, setManualInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const html5QrCodeRef = useRef(null);
  const scannerContainerId = "qr-reader-container";

  // Initialize and list cameras when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg("");
    let isMounted = true;

    async function initCamera() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back/environment camera if available
          const backCam = devices.find((d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("environment") ||
            d.label.toLowerCase().includes("rear")
          );
          const camId = backCam ? backCam.id : devices[0].id;
          setSelectedCameraId(camId);
          startScanner(camId);
        } else {
          setErrorMsg("No camera found on this device. You can enter or scan using barcode scanner below.");
        }
      } catch (err) {
        console.warn("Camera init error:", err);
        setErrorMsg("Camera access permission denied or unavailable. Use manual ID/Barcode entry.");
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async (cameraId) => {
    try {
      if (html5QrCodeRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        cameraId,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDecodedText(decodedText);
        },
        (errorMessage) => {
          // Ignore frequent frame-read failure ticks
        }
      );
      setIsScanning(true);
      setErrorMsg("");
    } catch (err) {
      console.warn("Camera start failed:", err);
      setIsScanning(false);
      setErrorMsg("Failed to start camera. Please ensure permissions are granted.");
    }
  };

  const stopScanner = async () => {
    try {
      if (html5QrCodeRef.current && isScanning) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }
    } catch (err) {
      // Ignore stop errors on unmount
    } finally {
      html5QrCodeRef.current = null;
      setIsScanning(false);
    }
  };

  const handleDecodedText = async (text) => {
    if (!text) return;
    try {
      // Play confirmation beep using Web Audio API
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880; // A5 tone
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      } catch (e) {}

      await stopScanner();
      onScanSuccess(text);
    } catch (err) {
      setErrorMsg("Error processing scanned data: " + err.message);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleDecodedText(manualInput.trim());
  };

  const handleCameraChange = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (newId) {
      await startScanner(newId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col relative">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6d0f16]/10 text-[#6d0f16] flex items-center justify-center text-xl font-bold">
              📷
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Scan Outpass QR / Barcode
              </h2>
              <p className="text-xs font-medium text-gray-500">
                Point camera at student's QR pass or enter ID
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center text-sm font-bold transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="p-5 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-gray-900 border-2 border-gray-200 flex items-center justify-center min-h-[260px] shadow-inner">
            <div id={scannerContainerId} className="w-full h-full" />
            
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white/70 space-y-3 bg-gray-900/90 z-10">
                <span className="text-3xl">📷</span>
                <p className="text-xs font-medium">Camera standby</p>
                {cameras.length > 0 && (
                  <button
                    onClick={() => startScanner(selectedCameraId || cameras[0].id)}
                    className="px-4 py-2 bg-[#6d0f16] text-white text-xs font-bold rounded-xl hover:bg-[#560c12] transition cursor-pointer"
                  >
                    Start Camera
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Camera switcher if multiple */}
          {cameras.length > 1 && (
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-gray-600">
              <span>Switch Camera:</span>
              <select
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-700 outline-none"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Camera ${c.id.substring(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2">
              <span>⚠️</span>
              <p>{errorMsg}</p>
            </div>
          )}

          {/* Manual Text / Barcode Entry */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              Or Manual Search / USB Barcode Scanner
            </p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste Outpass ID or Roll Number..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                autoFocus
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs font-medium text-gray-800 outline-none focus:bg-white focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16]/50 shadow-sm"
              />
              <button
                type="submit"
                className="bg-[#6d0f16] hover:bg-[#560c12] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
              >
                Look up
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
