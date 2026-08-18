import { load as loadFingerprint } from '@fingerprintjs/fingerprintjs';

/**
 * Extract WebGL GPU Renderer and Vendor (Instant & Synchronous)
 */
function getWebGLInfo() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'Generic', renderer: 'Standard Graphics' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { vendor: 'Generic', renderer: 'WebGL Renderer' };

    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown Vendor';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown Renderer';

    return { vendor, renderer };
  } catch {
    return { vendor: 'Standard', renderer: 'Standard Graphics' };
  }
}

/**
 * Generate Canvas 2D Hash (Instant & Synchronous)
 */
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'canvas-standard';

    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial', sans-serif";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('CampusGuard-Secure🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('HostelGateTerminal', 4, 17);

    return canvas.toDataURL();
  } catch {
    return 'canvas-fallback';
  }
}

/**
 * Fast synchronous hash generator
 */
function fastHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'fp_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Detect simple human-readable OS and Browser summary
 */
function getReadableDeviceInfo(webgl, screenSpecs) {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  let os = 'Unknown OS';
  if (/android/i.test(ua)) os = 'Android Device';
  else if (/iPad|iPhone|iPod/.test(ua)) os = 'iOS Device (iPhone/iPad)';
  else if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
  else if (/Edg/i.test(ua)) browser = 'Edge';
  else if (/Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';

  const rawRenderer = webgl?.renderer || 'Standard Graphics';
  const cleanRenderer = rawRenderer
    .replace(/ANGLE \(/, '')
    .replace(/\)/, '')
    .split(',')[0]
    .trim();

  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
  const ram = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? `${navigator.deviceMemory}GB` : 'Standard';
  const screenStr = `${screenSpecs.width}x${screenSpecs.height} (${screenSpecs.pixelRatio}x)`;

  return {
    os,
    browser,
    gpu: cleanRenderer,
    cores,
    ram,
    screen: screenStr,
    summary: `${os} (${browser}) • ${cleanRenderer}`
  };
}

let cachedFingerprint = null;

/**
 * Main Function: Extract Full Device Fingerprint and Metadata
 */
export async function getDeviceFingerprint(forceRefresh = false) {
  if (cachedFingerprint && !forceRefresh) {
    return cachedFingerprint;
  }

  const webgl = getWebGLInfo();
  const canvasHash = getCanvasFingerprint();

  const screenSpecs = {
    width: typeof window !== 'undefined' ? (window.screen?.width || 1920) : 1920,
    height: typeof window !== 'undefined' ? (window.screen?.height || 1080) : 1080,
    colorDepth: typeof window !== 'undefined' ? (window.screen?.colorDepth || 24) : 24,
    pixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
  };

  const hardwareSpecs = {
    cores: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    memory: typeof navigator !== 'undefined' ? (navigator.deviceMemory || 'unknown') : 'unknown',
    touchPoints: typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0,
    language: typeof navigator !== 'undefined' ? (navigator.language || 'en') : 'en',
    timeZone: typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : 'UTC',
    platform: typeof navigator !== 'undefined' ? (navigator.platform || 'unknown') : 'unknown',
  };

  let fpVisitorId = 'native-' + hardwareSpecs.cores + 'c-' + screenSpecs.width;

  try {
    const fpPromise = Promise.race([
      loadFingerprint().then(agent => agent.get()).then(res => res.visitorId),
      new Promise(resolve => setTimeout(() => resolve(null), 200))
    ]);
    const result = await fpPromise;
    if (result) fpVisitorId = result;
  } catch (e) {
    // Continue with native fallback
  }

  const compositePayload = JSON.stringify({
    fpVisitorId,
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    canvasSig: (canvasHash || '').slice(-64),
    cores: hardwareSpecs.cores,
    memory: hardwareSpecs.memory,
    screen: `${screenSpecs.width}x${screenSpecs.height}x${screenSpecs.colorDepth}`,
    touch: hardwareSpecs.touchPoints,
    platform: hardwareSpecs.platform,
    timeZone: hardwareSpecs.timeZone
  });

  const compositeHash = fastHash(compositePayload);
  const readable = getReadableDeviceInfo(webgl, screenSpecs);

  cachedFingerprint = {
    fingerprintHash: compositeHash,
    visitorId: fpVisitorId,
    deviceInfo: {
      ...readable,
      hardwareSpecs,
      screenDetails: screenSpecs,
      webglDetails: webgl
    }
  };

  return cachedFingerprint;
}
