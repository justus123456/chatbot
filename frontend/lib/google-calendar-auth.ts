const connectedKey = "smartcampus-google-calendar-connected";
const tokenKey = "smartcampus-google-calendar-token";
const tokenExpiryKey = "smartcampus-google-calendar-token-expires-at";
const legacySessionTokenKey = "smartcampus-google-calendar-token";

export function isGoogleCalendarConnected() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(connectedKey) === "true";
}

export function getStoredGoogleCalendarToken() {
  if (typeof window === "undefined") return "";
  const token = window.localStorage.getItem(tokenKey) || "";
  const expiresAt = Number(window.localStorage.getItem(tokenExpiryKey) || 0);
  if (!token || !expiresAt || expiresAt < Date.now() + 60_000) {
    window.localStorage.removeItem(tokenKey);
    window.localStorage.removeItem(tokenExpiryKey);
    return "";
  }
  return token;
}

export function storeGoogleCalendarToken(accessToken: string, expiresIn = 3600) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(connectedKey, "true");
  window.localStorage.setItem(tokenKey, accessToken);
  window.localStorage.setItem(tokenExpiryKey, String(Date.now() + expiresIn * 1000));
  window.sessionStorage.removeItem(legacySessionTokenKey);
}

export function disconnectGoogleCalendar() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(connectedKey);
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(tokenExpiryKey);
  window.sessionStorage.removeItem(legacySessionTokenKey);
}
