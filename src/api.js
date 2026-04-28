// ─── Mayank's Dashboard — API client ───────────────────
// Replace API_URL with the Apps Script Web App URL after you deploy
// the backend (Phase 2 of README.md).
export const API_URL = 'https://script.google.com/macros/s/AKfycbzuY9DZiOM37ahJ1emtfMPAQYKHYE5EbRA7lEfjofX6Kbqxp09vHFepGAcUdvmvHHkYHA/exec';

export async function apiCall(action, payload = {}, token = null) {
  if (!API_URL || API_URL.startsWith('PASTE_')) {
    return { success: false, error: 'API_URL not configured. Edit src/api.js.' };
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      // Apps Script web apps reject application/json preflights — use text/plain.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, payload }),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}
