# Mayank's Dashboard

Clovia Store Tracker — React/Vite frontend + Google Sheets backend (via Apps Script).
Repo deploys to GitHub Pages at `/clovia-stores/`.

## Architecture
- **Frontend** (this folder) — React + Vite, deployed to GitHub Pages
- **Backend** (`apps-script/Code.gs`) — Google Apps Script Web App, talks to a Google Sheet
- **Database** — a Google Sheet with 4 tabs (Stores, Salary, Users, AuditLog)

---

## Phase 1 — Google Sheet (do this first, in your browser)

1. Go to https://sheets.google.com → **+ Blank**, rename to **"Clovia Store Master DB"**
2. From the URL, copy the **Sheet ID** (`https://docs.google.com/spreadsheets/d/THIS_PART/edit`) — save it
3. Create 4 tabs (rename existing + add new): `Stores`, `Salary`, `Users`, `AuditLog`
4. Paste these headers into row 1 of each tab (tab-separated, paste straight into A1):

   **Stores:**
   ```
   storeCode	storeName	location	state	clusterId	sqft	revenue	smPresent	smName	csaCount	salesTarget	salesAchieved	lastUpdated	updatedBy
   ```
   **Salary:**
   ```
   storeCode	smSalary	csaSalaryPerHead	salaryBudget	lastUpdated
   ```
   **Users:**
   ```
   userId	name	email	phone	role	pin	active
   ```
   Then add the seed admin in row 2:
   ```
   admin	Your Name	your.email@clovia.com	9876543210	admin	1234	Yes
   ```
   **AuditLog:**
   ```
   timestamp	userId	action	storeCode	field	oldValue	newValue
   ```

## Phase 2 — Apps Script backend

1. In your sheet → **Extensions → Apps Script**
2. Delete the boilerplate, paste the contents of `apps-script/Code.gs`
3. At the top, replace `PASTE_YOUR_SHEET_ID_HERE` with your Sheet ID from Phase 1
4. **Save** (Ctrl/Cmd+S), rename project to **"Mayank Dashboard API"**
5. **Deploy → New deployment → ⚙ Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (auth is enforced inside the script via tokens)
6. **Authorize**, then **copy the Web App URL** (`https://script.google.com/macros/s/.../exec`)

Smoke-test in Chrome devtools (F12 → Console):
```js
fetch('YOUR_API_URL', {
  method: 'POST',
  body: JSON.stringify({ action: 'login', payload: { userId: 'admin', pin: '1234' } })
}).then(r => r.json()).then(console.log)
```
Expect `{success: true, token: "...", user: {...}}`.

## Phase 3 — Wire the frontend

1. Open `src/api.js`
2. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the Web App URL from Phase 2
3. Run locally:
   ```bash
   npm run dev
   ```
   Open the printed URL → log in with `admin` / `1234`.

## Phase 4 — Deploy to GitHub Pages

1. Create a **public** GitHub repo named `clovia-stores`
2. From this folder:
   ```bash
   git init
   git remote add origin https://github.com/<your-username>/clovia-stores.git
   git add . && git commit -m "Initial commit"
   git branch -M main
   git push -u origin main
   npm run deploy
   ```
3. In the GitHub repo → **Settings → Pages** → Source: branch `gh-pages`, folder `/ (root)` → Save
4. After 2–3 minutes the site is live at `https://<your-username>.github.io/clovia-stores/`

## Phase 5 — Onboard CMs

Add each CM to the **Users** tab (`role=cm`, `active=Yes`, 4-digit PIN, `userId` matching the `clusterId` they own in the Stores tab).

## Updating later
```bash
# edit code
npm run deploy
```
Goes live in ~2–3 minutes.

## Troubleshooting
| Problem | Fix |
|---|---|
| "API_URL not configured" banner | Set the URL in `src/api.js` |
| Login fails | Check Users tab has `active=Yes`, PIN matches |
| CORS error | Apps Script must be deployed with **Anyone** access |
| GitHub Pages 404 | Wait 5 min, confirm repo is **Public**, branch is `gh-pages` |
| `vite.config.js` `base` mismatch | Must equal `/<repo-name>/` (currently `/clovia-stores/`) |
