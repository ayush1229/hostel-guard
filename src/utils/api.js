const BASE_URL =
  (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");

export async function apiFetch(
  endpoint,
  options = {}
) {

  const token =
    localStorage.getItem("token");

  const role =
    localStorage.getItem("role");

  const response =
    await fetch(
      `${BASE_URL}${endpoint}`,
      {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type":
            "application/json",
          role: role || "",
          ...(options.headers || {}),
        },
      }
    );

  /* ================= AUTO LOGOUT DISABLED FOR GUARD ================= */

  const text =
    await response.text();

  let data = {};

  try {

    data = text
      ? JSON.parse(text)
      : {};

  } catch {

    throw new Error(
      "Invalid server response"
    );
  }

  if (!response.ok) {

    const err = new Error(
      data.message ||
      data.error ||
      "Request failed"
    );
    err.data = data;
    throw err;
  }

  return data;
}