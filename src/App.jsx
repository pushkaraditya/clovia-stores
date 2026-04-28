import { useEffect, useState, useCallback } from 'react';
import { apiCall, API_URL, subscribeBusy } from './api.js';

const STORE_FIELDS = [
  'storeCode', 'storeName', 'location', 'state', 'clusterId', 'sqft',
  'revenue', 'smPresent', 'smName', 'csaCount', 'salesTarget', 'salesAchieved',
];
const SALARY_FIELDS = ['smSalary', 'csaSalaryPerHead', 'salaryBudget'];

function hasBreach(s) {
  const sqft = Number(s.sqft);
  const rev = Number(s.revenue) / 100000;
  if (!sqft || !rev) return false;
  const sz = sqft < 500 ? 'S' : sqft <= 1000 ? 'M' : 'L';
  const mat = { S: [2, 2, 2, 3], M: [2, 2, 3, 3], L: [2, 3, 3, 4] };
  const idx = rev <= 3 ? 0 : rev <= 5 ? 1 : rev <= 10 ? 2 : 3;
  const req = mat[sz][idx] + (rev > 10 ? Math.floor((rev - 10) / 5) : 0);
  return s.smPresent !== 'Yes' || Number(s.csaCount) !== req;
}

function toCSV(rows, fields) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = fields.join(',');
  const body = rows.map((r) => fields.map((f) => escape(r[f])).join(',')).join('\n');
  return head + '\n' + body;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === ',') { cells.push(cur); cur = ''; }
        else if (ch === '"') inQ = true;
        else cur += ch;
      }
    }
    cells.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
}

function downloadFile(name, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('clovia_token') || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('clovia_user') || 'null'); }
    catch { return null; }
  });
  const [view, setView] = useState('dashboard');
  const [error, setError] = useState('');

  const logout = () => {
    localStorage.removeItem('clovia_token');
    localStorage.removeItem('clovia_user');
    setToken(null);
    setUser(null);
  };

  const onLogin = (tk, u) => {
    localStorage.setItem('clovia_token', tk);
    localStorage.setItem('clovia_user', JSON.stringify(u));
    setToken(tk);
    setUser(u);
    setView('dashboard');
  };

  if (!API_URL || API_URL.startsWith('PASTE_')) {
    return (
      <div className="app">
        <div className="card">
          <h2>Setup required</h2>
          <p>Edit <code>src/api.js</code> and set <code>API_URL</code> to your Apps Script Web App URL. See <code>README.md</code>.</p>
        </div>
      </div>
    );
  }

  if (!token || !user) return (
    <>
      <BusyOverlay />
      <Login onLogin={onLogin} error={error} setError={setError} />
    </>
  );

  return (
    <div className="app">
      <BusyOverlay />
      <div className="header">
        <h1>Mayank's Dashboard</h1>
        <div className="row">
          <span className="who">{user.name} ({user.role})</span>
          <button className="ghost" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="tabs">
        <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
        <button className={view === 'stores' ? 'active' : ''} onClick={() => setView('stores')}>Stores</button>
        {(user.role === 'admin' || user.role === 'hr') && (
          <button className={view === 'salary' ? 'active' : ''} onClick={() => setView('salary')}>Salary</button>
        )}
        {user.role === 'admin' && (
          <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}>Users</button>
        )}
      </div>

      {view === 'dashboard' && <Dashboard token={token} user={user} onAuthFail={logout} />}
      {view === 'stores' && <Stores token={token} user={user} onAuthFail={logout} />}
      {view === 'salary' && <Salary token={token} onAuthFail={logout} />}
      {view === 'users' && <Users token={token} onAuthFail={logout} />}
    </div>
  );
}

function BusyOverlay() {
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeBusy(setBusy), []);
  if (!busy) return null;
  return (
    <div className="busy-overlay" aria-busy="true" aria-live="polite">
      <div className="busy-card">
        <div className="spinner" />
        <div>Working…</div>
      </div>
    </div>
  );
}

function Login({ onLogin, error, setError }) {
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const r = await apiCall('login', { userId, pin });
    setBusy(false);
    if (r.success) onLogin(r.token, r.user);
    else setError(r.error || 'Login failed');
  };

  return (
    <div className="login-wrap">
      <div className="card">
        <h1>Mayank's Dashboard</h1>
        <div className="subtitle">Clovia Store Tracker</div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>User ID</label>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} autoFocus required />
          </div>
          <div className="field">
            <label>PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} required />
          </div>
          <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function useApi(token, onAuthFail) {
  return useCallback(async (action, payload) => {
    const r = await apiCall(action, payload, token);
    if (r.error && /session|invalid/i.test(r.error)) onAuthFail();
    return r;
  }, [token, onAuthFail]);
}

function Dashboard({ token, onAuthFail }) {
  const call = useApi(token, onAuthFail);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    call('getDashboard').then((r) => {
      if (r.success) setData(r.data);
      else setErr(r.error);
    });
  }, [call]);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="card">Loading…</div>;

  return (
    <div className="tiles">
      <div className="tile"><div className="label">Total Stores</div><div className="value">{data.total}</div></div>
      <div className="tile alert"><div className="label">Breaches</div><div className="value">{data.breaches}</div></div>
      <div className="tile ok"><div className="label">Compliant</div><div className="value">{data.compliant}</div></div>
      <div className="tile"><div className="label">Sales Target</div><div className="value">₹{Number(data.totalTarget).toLocaleString('en-IN')}</div></div>
      <div className="tile"><div className="label">Sales Achieved</div><div className="value">₹{Number(data.totalAchieved).toLocaleString('en-IN')}</div></div>
      <div className="tile"><div className="label">Achievement</div><div className="value">{data.achievementPct}%</div></div>
    </div>
  );
}

function Stores({ token, user, onAuthFail }) {
  const call = useApi(token, onAuthFail);
  const [stores, setStores] = useState([]);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const r = await call('getStores');
    if (r.success) setStores(r.data || []);
    else setErr(r.error);
  }, [call]);

  useEffect(() => { load(); }, [load]);

  const save = async (s) => {
    const r = await call('saveStore', s);
    if (r.success) { setMsg('Saved'); setEditing(null); load(); }
    else setErr(r.error);
  };

  const remove = async (code) => {
    if (!confirm(`Delete store ${code}?`)) return;
    const r = await call('deleteStore', { storeCode: code });
    if (r.success) load();
    else setErr(r.error);
  };

  const onCSV = async (file) => {
    const text = await file.text();
    const rows = parseCSV(text);
    const r = await call('bulkUpsertStores', { stores: rows });
    if (r.success) { setMsg(`Imported ${r.updated} stores`); load(); }
    else setErr(r.error);
  };

  const exportCSV = () => {
    const fields = user.role === 'admin' || user.role === 'hr'
      ? [...STORE_FIELDS, ...SALARY_FIELDS, 'lastUpdated', 'updatedBy']
      : [...STORE_FIELDS, 'lastUpdated', 'updatedBy'];
    downloadFile('stores.csv', toCSV(stores, fields));
  };

  return (
    <div>
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="primary" onClick={() => setEditing({})}>+ Add Store</button>
          <button className="ghost" onClick={exportCSV}>Export CSV</button>
          <label className="ghost" style={{ cursor: 'pointer' }}>
            Import CSV
            <input type="file" accept=".csv" hidden onChange={(e) => e.target.files[0] && onCSV(e.target.files[0])} />
          </label>
          <div className="spacer" />
          <button className="ghost" onClick={load}>Refresh</button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Location</th><th>Cluster</th>
                <th>SqFt</th><th>Revenue</th><th>SM</th><th>CSAs</th>
                <th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeCode}>
                  <td>{s.storeCode}</td>
                  <td>{s.storeName}</td>
                  <td>{s.location}, {s.state}</td>
                  <td>{s.clusterId}</td>
                  <td>{s.sqft}</td>
                  <td>₹{Number(s.revenue || 0).toLocaleString('en-IN')}</td>
                  <td>{s.smPresent === 'Yes' ? s.smName || '✓' : '—'}</td>
                  <td>{s.csaCount}</td>
                  <td>{hasBreach(s) ? <span className="badge breach">Breach</span> : <span className="badge ok">OK</span>}</td>
                  <td>
                    <button className="ghost" onClick={() => setEditing(s)}>Edit</button>
                    {user.role === 'admin' && <button className="danger" onClick={() => remove(s.storeCode)} style={{ marginLeft: 4 }}>Del</button>}
                  </td>
                </tr>
              ))}
              {stores.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#888' }}>No stores yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <StoreModal store={editing} role={user.role} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StoreModal({ store, role, onSave, onClose }) {
  const [s, setS] = useState({ smPresent: 'Yes', ...store });
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{store.storeCode ? 'Edit Store' : 'New Store'}</h2>
        <div className="grid2">
          <Field label="Store Code"><input value={s.storeCode || ''} onChange={(e) => set('storeCode', e.target.value)} disabled={!!store.storeCode} /></Field>
          <Field label="Store Name"><input value={s.storeName || ''} onChange={(e) => set('storeName', e.target.value)} /></Field>
          <Field label="Location"><input value={s.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="State"><input value={s.state || ''} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="Cluster ID"><input value={s.clusterId || ''} onChange={(e) => set('clusterId', e.target.value)} /></Field>
          <Field label="Sq Ft"><input type="number" value={s.sqft || ''} onChange={(e) => set('sqft', e.target.value)} /></Field>
          <Field label="Revenue (₹)"><input type="number" value={s.revenue || ''} onChange={(e) => set('revenue', e.target.value)} /></Field>
          <Field label="SM Present">
            <select value={s.smPresent || 'No'} onChange={(e) => set('smPresent', e.target.value)}>
              <option>Yes</option><option>No</option>
            </select>
          </Field>
          <Field label="SM Name"><input value={s.smName || ''} onChange={(e) => set('smName', e.target.value)} /></Field>
          <Field label="CSA Count"><input type="number" value={s.csaCount || ''} onChange={(e) => set('csaCount', e.target.value)} /></Field>
          <Field label="Sales Target"><input type="number" value={s.salesTarget || ''} onChange={(e) => set('salesTarget', e.target.value)} /></Field>
          <Field label="Sales Achieved"><input type="number" value={s.salesAchieved || ''} onChange={(e) => set('salesAchieved', e.target.value)} /></Field>
          {role === 'admin' && <>
            <Field label="SM Salary"><input type="number" value={s.smSalary || ''} onChange={(e) => set('smSalary', e.target.value)} /></Field>
            <Field label="CSA Salary / head"><input type="number" value={s.csaSalaryPerHead || ''} onChange={(e) => set('csaSalaryPerHead', e.target.value)} /></Field>
            <Field label="Salary Budget"><input type="number" value={s.salaryBudget || ''} onChange={(e) => set('salaryBudget', e.target.value)} /></Field>
          </>}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(s)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

function Salary({ token, onAuthFail }) {
  const call = useApi(token, onAuthFail);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => {
    call('getSalary').then((r) => r.success ? setRows(r.data || []) : setErr(r.error));
  }, [call]);
  if (err) return <div className="error">{err}</div>;
  return (
    <div className="card">
      <table>
        <thead><tr><th>Store</th><th>SM Salary</th><th>CSA / head</th><th>Budget</th><th>Updated</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.storeCode}>
              <td>{r.storeCode}</td>
              <td>₹{Number(r.smSalary || 0).toLocaleString('en-IN')}</td>
              <td>₹{Number(r.csaSalaryPerHead || 0).toLocaleString('en-IN')}</td>
              <td>₹{Number(r.salaryBudget || 0).toLocaleString('en-IN')}</td>
              <td>{r.lastUpdated}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>No salary data yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Users({ token, onAuthFail }) {
  const call = useApi(token, onAuthFail);
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    call('getUsers').then((r) => r.success ? setUsers(r.data || []) : setErr(r.error));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const save = async (u) => {
    const r = await call('saveUser', u);
    if (r.success) { setEditing(null); load(); }
    else setErr(r.error);
  };
  const remove = async (id) => {
    if (!confirm(`Delete user ${id}?`)) return;
    const r = await call('deleteUser', { userId: id });
    if (r.success) load();
    else setErr(r.error);
  };

  return (
    <div>
      {err && <div className="error">{err}</div>}
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="primary" onClick={() => setEditing({ active: 'Yes', role: 'cm' })}>+ Add User</button>
        </div>
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId}>
                <td>{u.userId}</td><td>{u.name}</td><td>{u.email}</td>
                <td>{u.role}</td><td>{u.active}</td>
                <td>
                  <button className="ghost" onClick={() => setEditing(u)}>Edit</button>
                  <button className="danger" onClick={() => remove(u.userId)} style={{ marginLeft: 4 }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserModal user={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function UserModal({ user, onSave, onClose }) {
  const [u, setU] = useState(user);
  const set = (k, v) => setU((p) => ({ ...p, [k]: v }));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{user.userId ? 'Edit User' : 'New User'}</h2>
        <div className="grid2">
          <Field label="User ID"><input value={u.userId || ''} onChange={(e) => set('userId', e.target.value)} disabled={!!user.userId} /></Field>
          <Field label="Name"><input value={u.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Email"><input value={u.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><input value={u.phone || ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Role">
            <select value={u.role || 'cm'} onChange={(e) => set('role', e.target.value)}>
              <option value="cm">cm</option><option value="hr">hr</option><option value="admin">admin</option>
            </select>
          </Field>
          <Field label="PIN (4 digits)"><input value={u.pin || ''} onChange={(e) => set('pin', e.target.value)} /></Field>
          <Field label="Active">
            <select value={u.active || 'Yes'} onChange={(e) => set('active', e.target.value)}>
              <option>Yes</option><option>No</option>
            </select>
          </Field>
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(u)}>Save</button>
        </div>
      </div>
    </div>
  );
}
