// ═══════════════════════════════════════════════════════
// MAYANK'S DASHBOARD — CLOVIA STORE TRACKER API
// Google Apps Script backend for Google Sheets
// ═══════════════════════════════════════════════════════

const SHEET_ID = '1aKYn6sGbGTlg7cd80OG5S4imSP_A5Ln715f56y5irtw'; // ← from Phase 1
const ss = SpreadsheetApp.openById(SHEET_ID);

// Main entry point — handles all POST requests from the web app
function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const { action, token, payload } = req;

    if (action === 'login') return json(login(payload));

    const user = verifyToken(token);
    if (!user) return json({ success: false, error: 'Invalid or expired session' });

    switch (action) {
      case 'getStores':        return json(getStores(user));
      case 'saveStore':        return json(saveStore(payload, user));
      case 'deleteStore':      return json(deleteStore(payload.storeCode, user));
      case 'bulkUpsertStores': return json(bulkUpsertStores(payload.stores, user));
      case 'getUsers':         return json(getUsers(user));
      case 'saveUser':         return json(saveUser(payload, user));
      case 'deleteUser':       return json(deleteUser(payload.userId, user));
      case 'getSalary':        return json(getSalary(user));
      case 'saveSalary':       return json(saveSalary(payload, user));
      case 'getDashboard':     return json(getDashboard(user));
      default: return json({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'Mayank Dashboard API live' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── AUTH ──────────────────────────────────────────────
function login({ userId, pin }) {
  const users = sheetToObjects('Users');
  const u = users.find(x => x.userId === userId && String(x.pin) === String(pin) && x.active === 'Yes');
  if (!u) return { success: false, error: 'Invalid credentials' };

  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put(token, JSON.stringify({ userId: u.userId, role: u.role, name: u.name }), 7200);

  return { success: true, token, user: { userId: u.userId, name: u.name, role: u.role } };
}

function verifyToken(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get(token);
  if (!raw) return null;
  cache.put(token, raw, 7200);
  return JSON.parse(raw);
}

// ─── STORES ────────────────────────────────────────────
function getStores(user) {
  let stores = sheetToObjects('Stores');
  if (user.role === 'cm') stores = stores.filter(s => s.clusterId === user.userId);

  if (user.role === 'admin' || user.role === 'hr') {
    const salary = sheetToObjects('Salary');
    stores = stores.map(s => {
      const sal = salary.find(x => x.storeCode === s.storeCode) || {};
      return { ...s, smSalary: sal.smSalary || '', csaSalaryPerHead: sal.csaSalaryPerHead || '', salaryBudget: sal.salaryBudget || '' };
    });
  }

  return { success: true, data: stores };
}

function saveStore(store, user) {
  if (user.role === 'cm' && store.clusterId !== user.userId) {
    return { success: false, error: 'CMs can only edit their own stores' };
  }

  const sheet = ss.getSheetByName('Stores');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();

  const codeCol = headers.indexOf('storeCode');
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][codeCol] === store.storeCode) { rowIdx = i + 1; break; }
  }

  store.lastUpdated = new Date().toISOString();
  store.updatedBy = user.userId;

  const row = headers.map(h => store[h] !== undefined ? store[h] : '');

  if (rowIdx === -1) {
    sheet.appendRow(row);
    logAudit(user.userId, 'CREATE', store.storeCode, '', '', JSON.stringify(store));
  } else {
    sheet.getRange(rowIdx, 1, 1, headers.length).setValues([row]);
    logAudit(user.userId, 'UPDATE', store.storeCode, '', '', JSON.stringify(store));
  }

  if (user.role === 'admin' && (store.smSalary !== undefined || store.csaSalaryPerHead !== undefined)) {
    saveSalary({
      storeCode: store.storeCode,
      smSalary: store.smSalary,
      csaSalaryPerHead: store.csaSalaryPerHead,
      salaryBudget: store.salaryBudget
    }, user);
  }

  return { success: true };
}

function deleteStore(storeCode, user) {
  if (user.role !== 'admin') return { success: false, error: 'Only admin can delete' };

  const sheet = ss.getSheetByName('Stores');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === storeCode) sheet.deleteRow(i + 1);
  }
  logAudit(user.userId, 'DELETE', storeCode, '', '', '');
  return { success: true };
}

function bulkUpsertStores(stores, user) {
  let added = 0, updated = 0;
  stores.forEach(s => {
    if (user.role === 'cm' && s.clusterId !== user.userId) return;
    const result = saveStore(s, user);
    if (result.success) updated++;
  });
  return { success: true, added, updated };
}

// ─── USERS ─────────────────────────────────────────────
function getUsers(user) {
  if (user.role !== 'admin') return { success: false, error: 'Unauthorized' };
  const users = sheetToObjects('Users').map(u => ({ ...u, pin: '••••' }));
  return { success: true, data: users };
}

function saveUser(u, user) {
  if (user.role !== 'admin') return { success: false, error: 'Unauthorized' };
  const sheet = ss.getSheetByName('Users');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === u.userId) { rowIdx = i + 1; break; }
  }

  const row = headers.map(h => u[h] !== undefined ? u[h] : '');
  if (rowIdx === -1) sheet.appendRow(row);
  else sheet.getRange(rowIdx, 1, 1, headers.length).setValues([row]);

  logAudit(user.userId, rowIdx === -1 ? 'USER_CREATE' : 'USER_UPDATE', u.userId, '', '', '');
  return { success: true };
}

function deleteUser(userId, user) {
  if (user.role !== 'admin') return { success: false, error: 'Unauthorized' };
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === userId) sheet.deleteRow(i + 1);
  }
  logAudit(user.userId, 'USER_DELETE', userId, '', '', '');
  return { success: true };
}

// ─── SALARY ────────────────────────────────────────────
function getSalary(user) {
  if (user.role !== 'admin' && user.role !== 'hr') return { success: false, error: 'Unauthorized' };
  return { success: true, data: sheetToObjects('Salary') };
}

function saveSalary(s, user) {
  if (user.role !== 'admin') return { success: false, error: 'Unauthorized' };
  const sheet = ss.getSheetByName('Salary');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === s.storeCode) { rowIdx = i + 1; break; }
  }

  s.lastUpdated = new Date().toISOString();
  const row = headers.map(h => s[h] !== undefined ? s[h] : '');
  if (rowIdx === -1) sheet.appendRow(row);
  else sheet.getRange(rowIdx, 1, 1, headers.length).setValues([row]);

  return { success: true };
}

// ─── DASHBOARD ─────────────────────────────────────────
function getDashboard(user) {
  const storesResp = getStores(user);
  const stores = storesResp.data;

  const breaches = stores.filter(s => hasBreach(s)).length;
  const totalTarget = stores.reduce((a, s) => a + (Number(s.salesTarget) || 0), 0);
  const totalAchieved = stores.reduce((a, s) => a + (Number(s.salesAchieved) || 0), 0);

  return {
    success: true,
    data: {
      total: stores.length,
      breaches,
      compliant: stores.length - breaches,
      totalTarget,
      totalAchieved,
      achievementPct: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0
    }
  };
}

function hasBreach(s) {
  const sqft = Number(s.sqft), rev = Number(s.revenue) / 100000;
  if (!sqft || !rev) return false;
  const sz = sqft < 500 ? 'S' : sqft <= 1000 ? 'M' : 'L';
  const mat = { S:[2,2,2,3], M:[2,2,3,3], L:[2,3,3,4] };
  const idx = rev <= 3 ? 0 : rev <= 5 ? 1 : rev <= 10 ? 2 : 3;
  let req = mat[sz][idx] + (rev > 10 ? Math.floor((rev - 10) / 5) : 0);
  return s.smPresent !== 'Yes' || Number(s.csaCount) !== req;
}

// ─── HELPERS ───────────────────────────────────────────
function sheetToObjects(sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function logAudit(userId, action, storeCode, field, oldValue, newValue) {
  const sheet = ss.getSheetByName('AuditLog');
  sheet.appendRow([new Date(), userId, action, storeCode, field, oldValue, newValue]);
}
