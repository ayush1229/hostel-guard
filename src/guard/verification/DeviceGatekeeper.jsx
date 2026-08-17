import React, { useState, useEffect } from 'react';
import { ShieldCheck, Smartphone, KeyRound, Lock, RefreshCw, AlertCircle } from 'lucide-react';
import { deviceManager } from '../db/deviceManager';
import { getDeviceFingerprint } from '../../utils/fingerprint';

export default function DeviceGatekeeper({ children }) {
  const [deviceBound, setDeviceBound] = useState(() => deviceManager.isDeviceConfigured());
  const [serverStatus, setServerStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Form State
  const [phone, setPhone] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    // If configured locally, verify with backend in background
    if (deviceManager.isDeviceConfigured()) {
      setIsVerifying(true);
      deviceManager.verifyWithServer().then(res => {
        setServerStatus(res);
        if (res && res.isValid) {
          setDeviceBound(true);
        } else {
          setDeviceBound(false);
          if (res && res.message) setErrorMessage(res.message);
        }
      }).catch(err => {
        console.warn('Offline mode verification:', err.message);
      }).finally(() => {
        setIsVerifying(false);
      });
    }

    const handleAuthError = (event) => {
      if (event.detail?.message) {
        setErrorMessage(event.detail.message);
        setServerStatus({ isValid: false, reason: 'AUTH_ERROR', message: event.detail.message });
        setDeviceBound(false);
      }
    };

    window.addEventListener('guard-device-auth-error', handleAuthError);
    return () => window.removeEventListener('guard-device-auth-error', handleAuthError);
  }, []);

  async function handleActivation(e) {
    e.preventDefault();
    if (!phone.trim() || !activationCode.trim()) {
      setErrorMessage('Please enter both Phone Number and Activation Code');
      return;
    }

    try {
      setActivating(true);
      setErrorMessage('');
      const res = await deviceManager.activateDevice(phone, activationCode);
      setDeviceBound(true);
      setServerStatus({ isValid: true, ...res });
    } catch (err) {
      setErrorMessage(err.message || 'Activation failed. Please verify your code with Chief Warden.');
    } finally {
      setActivating(false);
    }
  }

  function handleResetBinding() {
    deviceManager.clearDeviceBinding();
    setDeviceBound(false);
    setServerStatus(null);
    setErrorMessage('');
    setActivationCode('');
  }

  // If device is verified and active, render Guard Panel
  if (deviceBound && (!serverStatus || serverStatus.isValid)) {
    return (
      <>
        {children}
      </>
    );
  }

  // Clean White Theme Form Only
  return (
    <div className="min-h-screen w-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 font-sans text-gray-800">
      <div className="bg-white border border-gray-200/90 rounded-3xl p-8 sm:p-10 shadow-xl max-w-md w-full space-y-6">
        
        {/* HEADER */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#6d0f16] text-white flex items-center justify-center mx-auto shadow-md shadow-red-950/20">
            <Lock size={26} />
          </div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">
            Guard Terminal Activation
          </h2>
          <p className="text-xs text-gray-500 font-medium">
            Enter phone number &amp; 6-digit code from Chief Warden
          </p>
        </div>

        {/* ERROR ALERT */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 text-red-800 text-xs">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-900">Authorization Failed</p>
              <p className="mt-0.5 text-red-700">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleActivation} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              Guard Phone Number
            </label>
            <div className="relative">
              <input
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16] transition"
              />
              <Smartphone size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
              6-Digit Activation Code
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="GD-XXXXXX"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 font-mono tracking-widest uppercase focus:bg-white focus:outline-none focus:border-[#6d0f16] focus:ring-1 focus:ring-[#6d0f16] transition"
              />
              <KeyRound size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Generated in Chief Warden portal under "Guard Devices".
            </p>
          </div>

          <button
            type="submit"
            disabled={activating}
            className="w-full bg-[#6d0f16] hover:bg-[#5b0e0e] disabled:bg-gray-300 disabled:text-gray-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-md shadow-red-950/10 transition cursor-pointer"
          >
            {activating ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Verifying Device...
              </>
            ) : (
              <>
                <ShieldCheck size={18} />
                Verify &amp; Bind Terminal
              </>
            )}
          </button>
        </form>

        {deviceManager.isDeviceConfigured() && (
          <div className="border-t border-gray-100 pt-3 text-center">
            <button
              type="button"
              onClick={handleResetBinding}
              className="text-xs text-gray-400 hover:text-red-600 font-medium transition cursor-pointer"
            >
              Clear local pairing &amp; re-enter code
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
