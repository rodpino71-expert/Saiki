# Pantalla de Activación de Licencia (Electron) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen license activation gate to the Saiki Electron app that blocks all use of the app until a valid Lemon Squeezy license key is entered, consuming the already-deployed `/api/activate` and `/api/validate` backend.

**Architecture:** A new small CommonJS module (`src/licencia/`) holds pure, unit-tested logic (Ed25519 token verification tolerant of flattened PEM keys, and the 7-day-revalidate / 14-day-grace window math). `main.js` wires that pure logic to Electron I/O (reading/writing `activation.json`, calling the Netlify backend) behind two new `ipcMain.handle` channels. `preload.js` exposes those channels as `window.licenseAPI`. `index.html` gets a new full-screen overlay (same show/hide pattern as its existing modals) that blocks the app's existing boot call (`loadTasks()`) until activation is confirmed.

**Tech Stack:** Plain Node.js CommonJS (matching `main.js`/`preload.js`), Node's built-in `crypto` and `fetch`, Vitest for the pure-logic unit tests (matching `web/netlify/functions/lib` and `src/dominio` conventions).

**Spec:** `docs/superpowers/specs/2026-08-15-saiki-activation-screen-design.md` (and the app-behavior contract it references in `docs/superpowers/specs/2026-08-08-saiki-license-backend-design.md`, lines 86–102).

## Global Constraints

- Backend base URL: `https://saiki-resilience.netlify.app` (live, already deployed and tested today).
- Public key (not secret, safe to embed as a source constant):
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEA9LgqQ4260n/MbZLTesKxz75O0TQcijn9jleVnuhITeM=
  -----END PUBLIC KEY-----
  ```
- Activation state file: `path.join(app.getPath('userData'), 'activation.json')`.
- Revalidate after 7 days (`DIAS_REVALIDACION`), hard offline cutoff at 14 days (`DIAS_GRACIA`) — both counted from the token's `issued_at` (milliseconds since epoch, same as `Date.now()`).
- Activation screen copy is minimal by explicit user request: only a text input with placeholder **"Coloca tu clave aquí"** and a button **"Activar"**. No email field, no onboarding text.
- No self-service device management, no "forgot my key" flow — out of scope (already decided in the referenced specs).
- Implementation files stay CommonJS (`require`/`module.exports`); test files stay ESM (`import`), one `describe` file per source file, colocated in a sibling `__tests__` folder — same convention as `web/netlify/functions`.

---

### Task 1: Wire `src/licencia/` tests into the root Vitest config

**Files:**
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: makes `npx vitest run src/licencia/__tests__/<file>` resolve test files instead of reporting "No test files found" (Vitest's `include` glob is checked before any CLI path filter, so this must land before Task 2's RED step can show the real failure).

- [ ] **Step 1: Add the include glob**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/dominio/__tests__/**/*.test.ts',
      'web/netlify/functions/__tests__/**/*.test.js',
      'src/licencia/__tests__/**/*.test.js',
    ],
  },
});
```

- [ ] **Step 2: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — same 57 tests as before (the new glob matches zero files right now, `src/licencia/` doesn't exist yet; that's fine, an empty glob match is not an error).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add src/licencia test glob to root Vitest config"
```

---

### Task 2: `src/licencia/token.js` — verify Ed25519 activation tokens

**Files:**
- Create: `src/licencia/token.js`
- Test: `src/licencia/__tests__/token.test.js`

**Interfaces:**
- Produces:
  - `verifyToken(token: string, publicKeyPem: string): object | null` — same contract and same PEM-flattening tolerance as `web/netlify/functions/lib/token.js`'s `verifyToken`, but this copy only verifies (the app never signs, it only has the public key).
  - `normalizePem(pem: string): string` — exported for the test above to be self-contained, and because `verifyToken` depends on it.
- Consumes: nothing (only Node's built-in `crypto`).

This intentionally duplicates the PEM-normalization logic already written and tested today in `web/netlify/functions/lib/token.js`. There is no shared package between `web/` (deployed to Netlify) and the repo root (the Electron app) without adding a build step neither side currently has; the function is ~20 lines, so duplicating it is simpler than introducing a shared-package mechanism for one function. If both copies ever need a third variant, extract a shared package then — not before (YAGNI).

- [ ] **Step 1: Write the failing test**

```js
// src/licencia/__tests__/token.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { verifyToken, normalizePem } from '../token.js';

function signForTest(payload, privateKey) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), privateKey);
  return `${payloadB64}.${signature.toString('base64url')}`;
}

let privateKey;
let publicKeyPem;
let otherPublicKeyPem;

beforeAll(() => {
  const kp = crypto.generateKeyPairSync('ed25519');
  privateKey = kp.privateKey;
  publicKeyPem = kp.publicKey.export({ type: 'spki', format: 'pem' });

  const other = crypto.generateKeyPairSync('ed25519');
  otherPublicKeyPem = other.publicKey.export({ type: 'spki', format: 'pem' });
});

describe('verifyToken', () => {
  it('verifies a token signed with the matching private key', () => {
    const payload = { license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1', issued_at: 1234567890 };
    const token = signForTest(payload, privateKey);
    expect(verifyToken(token, publicKeyPem)).toEqual(payload);
  });

  it('rejects a token verified with the wrong public key', () => {
    const token = signForTest({ a: 1 }, privateKey);
    expect(verifyToken(token, otherPublicKeyPem)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signForTest({ a: 1 }, privateKey);
    const [, signatureB64] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ a: 999 })).toString('base64url');
    expect(verifyToken(`${tamperedPayload}.${signatureB64}`, publicKeyPem)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-valid-token', publicKeyPem)).toBeNull();
    expect(verifyToken('', publicKeyPem)).toBeNull();
  });

  it('verifies with a public key whose line breaks were flattened to spaces', () => {
    const token = signForTest({ a: 1 }, privateKey);
    const flattened = publicKeyPem.trim().replace(/\n/g, ' ');
    expect(verifyToken(token, flattened)).toEqual({ a: 1 });
  });

  it('verifies with a public key whose line breaks were stored as literal \\n sequences', () => {
    const token = signForTest({ a: 1 }, privateKey);
    const escaped = publicKeyPem.trim().replace(/\n/g, '\\n');
    expect(verifyToken(token, escaped)).toEqual({ a: 1 });
  });

  it('normalizePem leaves an already-correct multi-line PEM untouched', () => {
    expect(normalizePem(publicKeyPem)).toBe(publicKeyPem.trim());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/licencia/__tests__/token.test.js`
Expected: FAIL — `Cannot find module '../token.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/licencia/token.js
const crypto = require('node:crypto');

// Tolerates a PEM whose newlines were flattened to spaces or stored as
// literal "\n" sequences — both happen when pasting a multi-line secret
// into a single-line UI text field (observed in production today with
// Netlify's environment variable editor).
function normalizePem(pem) {
  if (typeof pem !== 'string') return pem;
  let s = pem.trim();

  if (s.includes('\\n')) {
    s = s.replace(/\\n/g, '\n').trim();
  }

  if (s.includes('\n')) {
    return s;
  }

  const match = s.match(/-----BEGIN ([A-Z0-9 ]+)-----(.*)-----END \1-----/);
  if (!match) return s;

  const label = match[1];
  const body = match[2].replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function verifyToken(token, publicKeyPem) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  let signature;
  let publicKey;
  try {
    signature = Buffer.from(signatureB64, 'base64url');
    publicKey = crypto.createPublicKey(normalizePem(publicKeyPem));
  } catch {
    return null;
  }

  const isValid = crypto.verify(null, Buffer.from(payloadB64, 'utf8'), publicKey, signature);
  if (!isValid) return null;

  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { verifyToken, normalizePem };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/licencia/__tests__/token.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/licencia/token.js src/licencia/__tests__/token.test.js
git commit -m "feat(licencia): add Ed25519 token verification for the Electron app"
```

---

### Task 3: `src/licencia/ventana.js` — 7-day revalidate / 14-day grace window math

**Files:**
- Create: `src/licencia/ventana.js`
- Test: `src/licencia/__tests__/ventana.test.js`

**Interfaces:**
- Produces:
  - `DIAS_REVALIDACION: 7`, `DIAS_GRACIA: 14` (exported constants).
  - `necesitaRevalidar(issuedAtMs: number, ahoraMs: number): boolean` — true once 7+ days have passed since `issuedAtMs`.
  - `dentroDePeriodoDeGracia(issuedAtMs: number, ahoraMs: number): boolean` — true while fewer than 14 days have passed since `issuedAtMs`.
- Consumes: nothing (pure arithmetic).

- [ ] **Step 1: Write the failing test**

```js
// src/licencia/__tests__/ventana.test.js
import { describe, it, expect } from 'vitest';
import { DIAS_REVALIDACION, DIAS_GRACIA, necesitaRevalidar, dentroDePeriodoDeGracia } from '../ventana.js';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const ISSUED_AT = 1_000_000_000; // arbitrary fixed epoch ms, deterministic

describe('constants', () => {
  it('matches the 7-day / 14-day contract from the backend spec', () => {
    expect(DIAS_REVALIDACION).toBe(7);
    expect(DIAS_GRACIA).toBe(14);
  });
});

describe('necesitaRevalidar', () => {
  it('is false before 7 days have passed', () => {
    const ahora = ISSUED_AT + 6.9 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(false);
  });

  it('is true at exactly 7 days', () => {
    const ahora = ISSUED_AT + 7 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(true);
  });

  it('is true well past 7 days', () => {
    const ahora = ISSUED_AT + 30 * MS_POR_DIA;
    expect(necesitaRevalidar(ISSUED_AT, ahora)).toBe(true);
  });
});

describe('dentroDePeriodoDeGracia', () => {
  it('is true just before 14 days', () => {
    const ahora = ISSUED_AT + 13.9 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(true);
  });

  it('is false at exactly 14 days', () => {
    const ahora = ISSUED_AT + 14 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(false);
  });

  it('is false well past 14 days', () => {
    const ahora = ISSUED_AT + 30 * MS_POR_DIA;
    expect(dentroDePeriodoDeGracia(ISSUED_AT, ahora)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/licencia/__tests__/ventana.test.js`
Expected: FAIL — `Cannot find module '../ventana.js'`

- [ ] **Step 3: Write the implementation**

```js
// src/licencia/ventana.js
const DIAS_REVALIDACION = 7;
const DIAS_GRACIA = 14;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasTranscurridos(issuedAtMs, ahoraMs) {
  return (ahoraMs - issuedAtMs) / MS_POR_DIA;
}

function necesitaRevalidar(issuedAtMs, ahoraMs) {
  return diasTranscurridos(issuedAtMs, ahoraMs) >= DIAS_REVALIDACION;
}

function dentroDePeriodoDeGracia(issuedAtMs, ahoraMs) {
  return diasTranscurridos(issuedAtMs, ahoraMs) < DIAS_GRACIA;
}

module.exports = { DIAS_REVALIDACION, DIAS_GRACIA, necesitaRevalidar, dentroDePeriodoDeGracia };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/licencia/__tests__/ventana.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 71 tests total (57 existing + 7 from Task 2 + 7 from this task).

- [ ] **Step 6: Commit**

```bash
git add src/licencia/ventana.js src/licencia/__tests__/ventana.test.js
git commit -m "feat(licencia): add 7-day revalidate / 14-day grace window logic"
```

---

### Task 4: `main.js` — activation IPC handlers

**Files:**
- Modify: `main.js`

**Interfaces:**
- Consumes: `verifyToken` from Task 2 (`./src/licencia/token.js`), `necesitaRevalidar`/`dentroDePeriodoDeGracia` from Task 3 (`./src/licencia/ventana.js`).
- Produces: two new IPC channels consumed by Task 5's preload bridge:
  - `license:check-activation` → `() => Promise<{ activated: boolean }>`
  - `license:activate` → `(licenseKey: string) => Promise<{ ok: true } | { ok: false, reason: string }>`

This task has no automated test — it's Electron glue code (`app.getPath`, `fs`, `fetch` to a real backend) that depends on the Electron runtime, same as every other `ipcMain.handle` already in this file. Verify by syntax check and by re-running the Task 2/3 unit tests (they exercise the exact same `verifyToken`/`necesitaRevalidar`/`dentroDePeriodoDeGracia` functions this task imports, so a passing suite means the logic this task calls is correct — only the new glue code around it is unverified here, and that's checked by inspection, matching how the rest of `main.js` is verified).

- [ ] **Step 1: Add the new requires and constants**

In `main.js`, right after the existing `const DATA_FILE = ...` line (currently line 5):

```js
const crypto = require('node:crypto');
const { verifyToken } = require('./src/licencia/token.js');
const { necesitaRevalidar, dentroDePeriodoDeGracia } = require('./src/licencia/ventana.js');

const ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json');
const LICENSE_API_BASE = 'https://saiki-resilience.netlify.app';
const ACTIVATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9LgqQ4260n/MbZLTesKxz75O0TQcijn9jleVnuhITeM=
-----END PUBLIC KEY-----`;
```

- [ ] **Step 2: Append the activation handlers at the end of the file**

Append to `main.js`:

```js

// ── Licencia: activación y validación ──────────────────────
function leerActivacion() {
  try {
    const raw = fs.readFileSync(ACTIVATION_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.token || !data.device_id) return null;
    return data;
  } catch {
    return null;
  }
}

function guardarActivacion(data) {
  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(data), 'utf8');
}

function borrarActivacion() {
  try { fs.unlinkSync(ACTIVATION_FILE); } catch {}
}

function obtenerOCrearDeviceId() {
  const actual = leerActivacion();
  if (actual && actual.device_id) return actual.device_id;
  return crypto.randomUUID();
}

async function llamarBackendLicencia(ruta, body) {
  try {
    const res = await fetch(`${LICENSE_API_BASE}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }
}

function revalidarEnSegundoPlano(activacion) {
  llamarBackendLicencia('/api/validate', {
    license_key: activacion.license_key,
    instance_id: activacion.instance_id,
    device_id: activacion.device_id,
  }).then((respuesta) => {
    if (respuesta.ok && respuesta.token) {
      const payload = verifyToken(respuesta.token, ACTIVATION_PUBLIC_KEY_PEM);
      if (payload) {
        guardarActivacion({ token: respuesta.token, ...payload });
      }
    } else if (!respuesta.ok && respuesta.reason === 'revoked') {
      borrarActivacion();
    }
  }).catch(() => {});
}

ipcMain.handle('license:check-activation', () => {
  const activacion = leerActivacion();
  if (!activacion) return { activated: false };

  const payload = verifyToken(activacion.token, ACTIVATION_PUBLIC_KEY_PEM);
  if (!payload) return { activated: false };

  const ahoraMs = Date.now();
  if (!necesitaRevalidar(payload.issued_at, ahoraMs)) {
    return { activated: true };
  }

  revalidarEnSegundoPlano(activacion);
  return { activated: dentroDePeriodoDeGracia(payload.issued_at, ahoraMs) };
});

ipcMain.handle('license:activate', async (_event, licenseKey) => {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { ok: false, reason: 'invalid_key' };
  }

  const deviceId = obtenerOCrearDeviceId();
  const respuesta = await llamarBackendLicencia('/api/activate', {
    license_key: licenseKey,
    device_id: deviceId,
  });

  if (!respuesta.ok) {
    return { ok: false, reason: respuesta.reason || 'service_unavailable' };
  }

  const payload = verifyToken(respuesta.token, ACTIVATION_PUBLIC_KEY_PEM);
  if (!payload) {
    return { ok: false, reason: 'service_unavailable' };
  }

  guardarActivacion({ token: respuesta.token, ...payload });
  return { ok: true };
});
```

- [ ] **Step 3: Syntax-check the file**

Run: `node --check main.js`
Expected: no output, exit code 0.

- [ ] **Step 4: Re-run the full test suite**

Run: `npm test`
Expected: PASS — still 71 tests (this task adds no new test files; it re-confirms the pure logic it now depends on is intact).

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "feat(main): add license:check-activation and license:activate IPC handlers"
```

---

### Task 5: `preload.js` — expose `licenseAPI`

**Files:**
- Modify: `preload.js`

**Interfaces:**
- Consumes: the two IPC channels from Task 4.
- Produces: `window.licenseAPI = { checkActivation, activate }`, consumed by Task 6's renderer code.

- [ ] **Step 1: Append the bridge**

Append to `preload.js`:

```js

// ── Licencia: activación ────────────────────────────────────
contextBridge.exposeInMainWorld('licenseAPI', {
  checkActivation: () => ipcRenderer.invoke('license:check-activation'),
  activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
});
```

- [ ] **Step 2: Syntax-check the file**

Run: `node --check preload.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add preload.js
git commit -m "feat(preload): expose licenseAPI bridge for activation"
```

---

### Task 6: `index.html` — activation gate overlay + gated boot

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `window.licenseAPI.checkActivation()` and `window.licenseAPI.activate(licenseKey)` from Task 5.
- Produces: nothing consumed elsewhere — this is the last task in the chain.

- [ ] **Step 1: Add the gate styles**

In `index.html`, immediately before the closing `</style>` tag (currently line 350), add:

```css
.activation-gate { display: none; position: fixed; inset: 0; z-index: 4000; background: var(--bg-main); flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; padding: 24px; }
.activation-gate.show { display: flex; }
.activation-gate .activation-logo { font-size: 40px; }
.activation-gate input { font-size: 15px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 6px; width: 280px; max-width: 80vw; text-align: center; }
.activation-gate button { font-size: 14px; padding: 10px 20px; border: none; border-radius: 6px; background: var(--primary); color: #fff; cursor: pointer; }
.activation-gate button:disabled { opacity: 0.6; cursor: default; }
.activation-gate .activation-error { color: #c5221f; font-size: 13px; min-height: 18px; }
```

(`z-index: 4000` is deliberately above `#loadingOverlay`'s `z-index: 3000`, so the gate sits on top of the loading spinner while `checkActivation()` resolves.)

- [ ] **Step 2: Add the gate markup**

Immediately after `<div id="loadingOverlay"><div class="spinner"></div></div>` (currently line 354), add:

```html
<div id="activationGate" class="activation-gate">
  <span class="activation-logo" aria-hidden="true">再起</span>
  <input id="activationKeyInput" type="text" placeholder="Coloca tu clave aquí" autocomplete="off" />
  <button id="activationSubmitBtn">Activar</button>
  <p id="activationError" class="activation-error"></p>
</div>
```

- [ ] **Step 3: Gate the app's boot call**

Find this exact block near the end of the final `<script>` (currently the last executable lines before the closing `</script>`):

```js
// ── Timer: check every 30 seconds ──
setInterval(checkScheduledTaskAdvance, 30000);

loadTasks();
```

Replace it with:

```js
// ── Timer: check every 30 seconds ──
function iniciarApp() {
  setInterval(checkScheduledTaskAdvance, 30000);
  loadTasks();
}

async function verificarActivacionYArrancar() {
  let resultado;
  try {
    resultado = await window.licenseAPI.checkActivation();
  } catch {
    resultado = { activated: false };
  }
  if (resultado && resultado.activated) {
    iniciarApp();
  } else {
    document.getElementById('activationGate').classList.add('show');
  }
}

const activationForm = {
  input: document.getElementById('activationKeyInput'),
  btn: document.getElementById('activationSubmitBtn'),
  error: document.getElementById('activationError'),
};

async function intentarActivar() {
  const licenseKey = activationForm.input.value.trim();
  if (!licenseKey) return;

  activationForm.btn.disabled = true;
  activationForm.btn.textContent = 'Activando...';
  activationForm.error.textContent = '';

  const respuesta = await window.licenseAPI.activate(licenseKey);

  if (respuesta && respuesta.ok) {
    document.getElementById('activationGate').classList.remove('show');
    iniciarApp();
    return;
  }

  const mensajes = {
    invalid_key: 'Esa clave no es válida. Revisa que esté bien copiada.',
    already_activated: 'Esta clave ya está activada en otro equipo. Escríbenos a rodpino71@gmail.com si necesitas ayuda.',
    service_unavailable: 'Sin conexión a internet. Verifica tu red e inténtalo de nuevo.',
  };
  activationForm.error.textContent = mensajes[respuesta && respuesta.reason] || 'Algo salió mal. Inténtalo de nuevo.';
  activationForm.btn.disabled = false;
  activationForm.btn.textContent = 'Activar';
}

activationForm.btn.addEventListener('click', intentarActivar);
activationForm.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') intentarActivar();
});

verificarActivacionYArrancar();
```

- [ ] **Step 4: Syntax-check the inline script**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let ok = true;
scripts.forEach((s, i) => { try { new Function(s); } catch (e) { ok = false; console.log('SYNTAX ERROR', i, e.message); } });
console.log(ok ? 'OK' : 'ERRORS');
"
```
Expected: `OK`

- [ ] **Step 5: Check for duplicate IDs and balanced script tags**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const ids = [...html.matchAll(/id=[\"']([a-zA-Z0-9_-]+)[\"']/g)].map(m=>m[1]);
const dupes = ids.filter((id,i)=>ids.indexOf(id)!==i);
console.log('duplicate ids:', [...new Set(dupes)]);
console.log('script tags:', (html.match(/<script>/g)||[]).length, (html.match(/<\/script>/g)||[]).length);
"
```
Expected: `duplicate ids: []` and matching open/close script tag counts.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(index): add license activation gate overlay and gate app boot on it"
```

---

### Task 7: Manual end-to-end verification (external, user)

**Files:** none

This cannot run from this agent session — Electron needs a real display and enough RAM headroom, which this machine doesn't reliably have (see the landing-page plan's note on the same constraint). Run these steps yourself once Tasks 1–6 are merged.

- [ ] **Step 1 (external, user): launch the app**

```bash
npm start
```

Expected: instead of the normal board, you see only the Saiki kanji, an input saying "Coloca tu clave aquí", and an "Activar" button — nothing else from the app is visible.

- [ ] **Step 2 (external, user): test an invalid key**

Type a made-up key (e.g. `NOT-A-REAL-KEY`) and press Activar (or Enter).
Expected: "Esa clave no es válida. Revisa que esté bien copiada." appears under the field; the field keeps your typed text; the button goes back to "Activar".

- [ ] **Step 3 (external, user): activate with the real test key**

The test license key issued today (`4B8FC7A5-B841-424F-B502-A53277F3D0AB`) is currently deactivated (0/1 activations). Type it in and press Activar.
Expected: the gate disappears and the normal Saiki board loads, exactly as it did before this feature existed.

- [ ] **Step 4 (external, user): confirm persistence**

Close the app fully and run `npm start` again.
Expected: the gate does **not** appear — the app goes straight to the board, because `activation.json` (in the app's userData folder) still holds a token valid for 7 days.

- [ ] **Step 5 (external, user): report back**

Confirm to close out this plan: all four checks above passed, or describe what didn't match.
