const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

export async function apiFetch<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new Error(`Could not reach the Flask API at ${API_URL}. Make sure it is running.`);
  }

  if (!response.ok && response.status >= 500) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "The school service is temporarily unavailable.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403 && payload.error === "Forbidden" && payload.role) {
      throw new Error(`Forbidden: this account is logged in as ${payload.role}. Allowed roles: ${(payload.allowed_roles || []).join(", ") || "none"}.`);
    }
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload as T;
}
