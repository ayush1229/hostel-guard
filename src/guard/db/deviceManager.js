import { getDeviceFingerprint } from '../../utils/fingerprint.js';

const STORAGE_KEYS = {
  DEVICE_ID: 'guard_device_id',
  DEVICE_TOKEN: 'guard_device_token',
  DEVICE_NAME: 'guard_device_name',
  GATE: 'guard_gate_location',
  PHONE: 'guard_phone',
  FINGERPRINT_HASH: 'guard_fingerprint_hash',
  STATUS: 'guard_device_status'
};

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

export const deviceManager = {
  /**
   * Check if device has stored credentials locally
   */
  isDeviceConfigured() {
    return Boolean(
      localStorage.getItem(STORAGE_KEYS.DEVICE_ID) &&
      localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN)
    );
  },

  /**
   * Get all stored device info
   */
  getDeviceInfo() {
    return {
      deviceId: localStorage.getItem(STORAGE_KEYS.DEVICE_ID),
      deviceToken: localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN),
      deviceName: localStorage.getItem(STORAGE_KEYS.DEVICE_NAME) || 'Guard Terminal',
      gate: localStorage.getItem(STORAGE_KEYS.GATE) || 'Main Gate',
      phone: localStorage.getItem(STORAGE_KEYS.PHONE) || '',
      fingerprintHash: localStorage.getItem(STORAGE_KEYS.FINGERPRINT_HASH) || '',
      status: localStorage.getItem(STORAGE_KEYS.STATUS) || 'PENDING_ACTIVATION'
    };
  },

  /**
   * Get HTTP headers for guard requests
   */
  async getAuthHeaders() {
    const { deviceId, deviceToken } = this.getDeviceInfo();
    const fp = await getDeviceFingerprint();

    return {
      'x-device-id': deviceId || '',
      'x-device-token': deviceToken || '',
      'x-device-fingerprint': fp.fingerprintHash || ''
    };
  },

  /**
   * Save successful activation payload
   */
  saveDeviceCredentials({ device_id, device_token, device_name, gate, phone, status, fingerprint_hash }) {
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, device_id);
    localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, device_token);
    if (device_name) localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, device_name);
    if (gate) localStorage.setItem(STORAGE_KEYS.GATE, gate);
    if (phone) localStorage.setItem(STORAGE_KEYS.PHONE, phone);
    if (status) localStorage.setItem(STORAGE_KEYS.STATUS, status);
    if (fingerprint_hash) localStorage.setItem(STORAGE_KEYS.FINGERPRINT_HASH, fingerprint_hash);
  },

  /**
   * Clear device binding (logout / reset)
   */
  clearDeviceBinding() {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  },

  /**
   * Activate device with Phone + Activation Code
   */
  async activateDevice(phone, activationCode) {
    const fp = await getDeviceFingerprint();

    const response = await fetch(`${BASE_URL}/api/guard/device/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: phone.trim(),
        activation_code: activationCode.trim().toUpperCase(),
        fingerprint_hash: fp.fingerprintHash,
        device_info: fp.deviceInfo
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || data.error || 'Failed to activate device');
    }

    const payload = data.data || data;
    this.saveDeviceCredentials({
      device_id: payload.device_id,
      device_token: payload.device_token,
      device_name: payload.device_name,
      gate: payload.gate,
      phone: payload.phone,
      status: payload.status || 'ACTIVE',
      fingerprint_hash: fp.fingerprintHash
    });

    return payload;
  },

  /**
   * Verify device status with server
   */
  async verifyWithServer() {
    const { deviceId, deviceToken } = this.getDeviceInfo();
    if (!deviceId || !deviceToken) {
      return { isValid: false, reason: 'NO_CREDENTIALS', message: 'Terminal is not activated' };
    }

    const fp = await getDeviceFingerprint();

    try {
      const response = await fetch(`${BASE_URL}/api/guard/device/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          device_token: deviceToken,
          fingerprint_hash: fp.fingerprintHash
        })
      });

      const data = await response.json();
      const payload = data.data || data;

      if (payload.isValid) {
        if (payload.device_name) localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, payload.device_name);
        if (payload.gate) localStorage.setItem(STORAGE_KEYS.GATE, payload.gate);
        localStorage.setItem(STORAGE_KEYS.STATUS, payload.status || 'ACTIVE');
      }

      return payload;
    } catch (err) {
      console.warn('Server verification offline/failed:', err.message);
      // If offline, allow optimistic operation if credentials exist
      return {
        isValid: true,
        offline: true,
        message: 'Offline mode active'
      };
    }
  }
};

export default deviceManager;
