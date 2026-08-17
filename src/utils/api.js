const BASE_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export async function apiFetch(
  endpoint,
  options = {}
) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  // Retrieve Guard Device credentials
  const deviceId = localStorage.getItem("guard_device_id") || "";
  const deviceToken = localStorage.getItem("guard_device_token") || "";
  const fingerprintHash = localStorage.getItem("guard_fingerprint_hash") || "";

  const response = await fetch(
    `${BASE_URL}${endpoint}`,
    {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        role: role || "",
        "x-device-id": deviceId,
        "x-device-token": deviceToken,
        "x-device-fingerprint": fingerprintHash,
        ...(options.headers || {}),
      },
    }
  );

  const text = await response.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Invalid server response");
  }

  if (!response.ok) {
    const err = new Error(
      data.message || data.error || "Request failed"
    );
    err.data = data;
    err.status = response.status;

    // Dispatch global event if device is revoked or mismatched
    if (response.status === 403 || response.status === 401) {
      window.dispatchEvent(new CustomEvent("guard-device-auth-error", { detail: data }));
    }

    throw err;
  }

  return data;
}