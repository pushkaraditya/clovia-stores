// ─── Mayank's Dashboard — API client ───────────────────
// Replace API_URL with the Apps Script Web App URL after you deploy
// the backend (Phase 2 of README.md).
export const API_URL = 'https://script.google.com/macros/s/AKfycbzuY9DZiOM37ahJ1emtfMPAQYKHYE5EbRA7lEfjofX6Kbqxp09vHFepGAcUdvmvHHkYHA/exec';

let inflight = 0;
const listeners = new Set();
export function subscribeBusy(fn) {
  listeners.add(fn);
  fn(inflight > 0);
  return () => listeners.delete(fn);
}
function setBusy(delta) {
  inflight += delta;
  const busy = inflight > 0;
  listeners.forEach((fn) => fn(busy));
}

export async function apiCall(action, payload = {}, token = null) {
  if (!API_URL || API_URL.startsWith('PASTE_')) {
    return { success: false, error: 'API_URL not configured. Edit src/api.js.' };
  }
  setBusy(1);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, payload }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    setBusy(-1);
  }
}
