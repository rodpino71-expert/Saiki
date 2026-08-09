# Backend de Licencias de Saiki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two Netlify Functions (`/api/activate`, `/api/validate`) that let the Saiki Electron app activate and periodically revalidate a Lemon Squeezy license key, producing a locally-verifiable signed token so the app can work offline between revalidations.

**Architecture:** A new `web/` folder at the repo root, deployed to Netlify with its base directory set to `web`. Two stateless serverless functions proxy Lemon Squeezy's public License API (`/v1/licenses/activate`, `/v1/licenses/validate` — no secret key required) and sign the result with an Ed25519 private key that only exists in Netlify's environment variables. The corresponding public key will later be embedded in the Electron app (sub-project 3) to verify tokens offline.

**Tech Stack:** Plain Node.js (CommonJS, matching `main.js`/`preload.js` style), Node's built-in `crypto` module for Ed25519 signing (no external signing library), Node's built-in `fetch`. Tests with Vitest, extending the existing root `vitest.config.ts`. No new npm dependencies.

## Global Constraints

- No API secret key is needed for `/v1/licenses/activate` or `/v1/licenses/validate` — they are public endpoints keyed by the license key itself ([Lemon Squeezy License API docs](https://docs.lemonsqueezy.com/api/license-api)). Do not add a `LEMONSQUEEZY_API_KEY` env var for this sub-project.
- Requests to Lemon Squeezy's License API must use `Content-Type: application/x-www-form-urlencoded` and `Accept: application/json`, not JSON bodies.
- `activation_limit` is configured as `1` on the Lemon Squeezy product (one device per license) — this plan's code does not enforce that itself, Lemon Squeezy does.
- The token signed by the backend must use Ed25519 via Node's built-in `crypto` (`crypto.sign(null, data, privateKey)` / `crypto.verify(null, data, publicKey, signature)`) — no JWT library, no extra dependency.
- Both functions are stateless: no database, no writes to disk, no in-memory caching between invocations.
- Response contract for both functions is always HTTP 200 with a JSON body `{ ok: true, token }` or `{ ok: false, reason }`, where `reason` is one of: `invalid_key`, `already_activated`, `service_unavailable` (for `/api/activate`), or `revoked`, `service_unavailable` (for `/api/validate`). A malformed request (missing required fields) returns HTTP 400 with `{ ok: false, reason: "bad_request" }`.
- Follow the existing repo convention: implementation files as CommonJS (`require`/`module.exports`, like `main.js`), test files as ESM (`import`, like `src/dominio/__tests__/*.test.ts`), one `describe` file per source file, tests colocated in a sibling `__tests__` folder.
- No changes to any file outside `web/` and `vitest.config.ts` in this plan.

---

## File Structure

```
web/
  netlify.toml                              # Netlify build/redirect config (base dir, functions dir)
  package.json                              # minimal, private, engines.node >=18
  public/
    index.html                              # placeholder landing page (real page is sub-project 2)
  netlify/
    functions/
      lib/
        token.js                            # signToken / verifyToken (Ed25519)
        lemonsqueezy.js                     # activateLicense / validateLicense (calls Lemon Squeezy)
        keys.js                             # generateSigningKeyPair (used by the one-off script + its test)
      activate.js                           # exports.handler for POST /api/activate
      validate.js                           # exports.handler for POST /api/validate
      __tests__/
        token.test.js
        lemonsqueezy.test.js
        activate.test.js
        validate.test.js
        keys.test.js
  scripts/
    generate-signing-keys.js                # one-off: prints PEM keypair to paste into Netlify env vars
vitest.config.ts                             # (modified) add web/ tests to include glob
```

---

### Task 1: Scaffold the Netlify site (`web/`)

**Files:**
- Create: `web/netlify.toml`
- Create: `web/package.json`
- Create: `web/public/index.html`

**Interfaces:**
- Produces: the `web/netlify/functions` directory path that Tasks 2–6 will populate, and the `/api/activate` / `/api/validate` redirect routes that Task 4/5's handlers are reached through.

This task is pure configuration scaffolding — there is no logic to unit test. Verification is by inspection (Step 2 below) and by later tasks' function tests actually exercising the real handler files that live at the paths declared here.

- [ ] **Step 1: Create the files**

`web/netlify.toml`:
```toml
[build]
  base = "web"
  publish = "public"
  functions = "netlify/functions"

[[redirects]]
  from = "/api/activate"
  to = "/.netlify/functions/activate"
  status = 200

[[redirects]]
  from = "/api/validate"
  to = "/.netlify/functions/validate"
  status = 200
```

`web/package.json`:
```json
{
  "name": "saiki-web",
  "version": "1.0.0",
  "private": true,
  "description": "Landing page y backend de licencias de Saiki (Netlify)",
  "engines": {
    "node": ">=18"
  }
}
```

`web/public/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Saiki</title>
  </head>
  <body>
    <p>Próximamente: la página de Saiki. (Placeholder — el diseño real es un sub-proyecto aparte.)</p>
  </body>
</html>
```

- [ ] **Step 2: Verify by inspection**

Confirm all three files exist and `web/netlify.toml` declares `functions = "netlify/functions"` matching the directory Task 2 onward will write into:

```bash
cat web/netlify.toml web/package.json web/public/index.html
```

- [ ] **Step 3: Commit**

```bash
git add web/netlify.toml web/package.json web/public/index.html
git commit -m "chore(web): scaffold Netlify site for license backend"
```

---

### Task 2: `lib/token.js` — sign and verify Ed25519 activation tokens

**Files:**
- Create: `web/netlify/functions/lib/token.js`
- Test: `web/netlify/functions/__tests__/token.test.js`

**Interfaces:**
- Produces:
  - `signToken(payload: object, privateKeyPem: string): string` — returns `"<base64url payload>.<base64url signature>"`.
  - `verifyToken(token: string, publicKeyPem: string): object | null` — returns the parsed payload if the signature is valid, `null` otherwise (invalid signature, malformed token, or corrupt payload).
- Consumes: nothing (only Node's built-in `crypto`).

- [ ] **Step 1: Write the failing test**

```js
// web/netlify/functions/__tests__/token.test.js
import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { signToken, verifyToken } from '../lib/token.js';

let privateKeyPem;
let publicKeyPem;
let otherPublicKeyPem;

beforeAll(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

  const other = crypto.generateKeyPairSync('ed25519');
  otherPublicKeyPem = other.publicKey.export({ type: 'spki', format: 'pem' });
});

describe('signToken / verifyToken', () => {
  it('round-trips a payload through sign then verify', () => {
    const payload = { license_key: 'abc-123', instance_id: 'inst-1', device_id: 'dev-1', issued_at: 1234567890 };
    const token = signToken(payload, privateKeyPem);
    const result = verifyToken(token, publicKeyPem);
    expect(result).toEqual(payload);
  });

  it('rejects a token verified with the wrong public key', () => {
    const token = signToken({ a: 1 }, privateKeyPem);
    expect(verifyToken(token, otherPublicKeyPem)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signToken({ a: 1 }, privateKeyPem);
    const [payloadB64, signatureB64] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ a: 999 })).toString('base64url');
    const tampered = `${tamperedPayload}.${signatureB64}`;
    expect(verifyToken(tampered, publicKeyPem)).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('not-a-valid-token', publicKeyPem)).toBeNull();
    expect(verifyToken('', publicKeyPem)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/netlify/functions/__tests__/token.test.js`
Expected: FAIL — `Cannot find module '../lib/token.js'`

- [ ] **Step 3: Write the implementation**

```js
// web/netlify/functions/lib/token.js
const crypto = require('node:crypto');

function signToken(payload, privateKeyPem) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), privateKey);
  return `${payloadB64}.${signature.toString('base64url')}`;
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
    publicKey = crypto.createPublicKey(publicKeyPem);
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

module.exports = { signToken, verifyToken };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/netlify/functions/__tests__/token.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/netlify/functions/lib/token.js web/netlify/functions/__tests__/token.test.js
git commit -m "feat(web): add Ed25519 sign/verify for activation tokens"
```

---

### Task 3: `lib/lemonsqueezy.js` — call Lemon Squeezy's License API

**Files:**
- Create: `web/netlify/functions/lib/lemonsqueezy.js`
- Test: `web/netlify/functions/__tests__/lemonsqueezy.test.js`

**Interfaces:**
- Produces:
  - `activateLicense(licenseKey: string, deviceId: string): Promise<{ ok: true, instanceId: string } | { ok: false, reason: 'invalid_key' | 'already_activated' | 'service_unavailable' }>`
  - `validateLicense(licenseKey: string, instanceId: string): Promise<{ ok: true } | { ok: false, reason: 'revoked' | 'service_unavailable' }>`
- Consumes: global `fetch` (Node 18+ built-in). Tests replace it with `vi.stubGlobal('fetch', ...)`.

- [ ] **Step 1: Write the failing test**

```js
// web/netlify/functions/__tests__/lemonsqueezy.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { activateLicense, validateLicense } from '../lib/lemonsqueezy.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

describe('activateLicense', () => {
  it('returns ok + instanceId when Lemon Squeezy activates the license', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { activated: true, error: null, instance: { id: 'inst-1' } })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: true, instanceId: 'inst-1' });
  });

  it('returns already_activated when the activation limit error is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(403, { activated: false, error: 'This license key has reached the activation limit.' })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'already_activated' });
  });

  it('returns invalid_key for any other activation error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(404, { activated: false, error: 'License key not found.' })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'invalid_key' });
  });

  it('returns service_unavailable on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('returns service_unavailable on a 5xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('sends the request as form-urlencoded with the right fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { activated: true, error: null, instance: { id: 'inst-1' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await activateLicense('LICENSE-KEY', 'device-1');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(options.headers['Accept']).toBe('application/json');
    expect(options.body.toString()).toBe('license_key=LICENSE-KEY&instance_name=device-1');
  });
});

describe('validateLicense', () => {
  it('returns ok when Lemon Squeezy reports the license as valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: true, error: null })));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns revoked when Lemon Squeezy reports the license as invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: false, error: 'License key has expired.' })));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: false, reason: 'revoked' });
  });

  it('returns service_unavailable on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/netlify/functions/__tests__/lemonsqueezy.test.js`
Expected: FAIL — `Cannot find module '../lib/lemonsqueezy.js'`

- [ ] **Step 3: Write the implementation**

```js
// web/netlify/functions/lib/lemonsqueezy.js
const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

async function postForm(path, fields) {
  const body = new URLSearchParams(fields);
  try {
    const res = await fetch(`${LS_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (res.status >= 500) {
      return { networkOk: false };
    }
    const json = await res.json();
    return { networkOk: true, status: res.status, body: json };
  } catch {
    return { networkOk: false };
  }
}

async function activateLicense(licenseKey, deviceId) {
  const result = await postForm('/licenses/activate', {
    license_key: licenseKey,
    instance_name: deviceId,
  });
  if (!result.networkOk) return { ok: false, reason: 'service_unavailable' };

  const { body } = result;
  if (body.activated === true) {
    return { ok: true, instanceId: body.instance.id };
  }

  const errorText = String(body.error || '').toLowerCase();
  if (errorText.includes('activation limit')) {
    return { ok: false, reason: 'already_activated' };
  }
  return { ok: false, reason: 'invalid_key' };
}

async function validateLicense(licenseKey, instanceId) {
  const result = await postForm('/licenses/validate', {
    license_key: licenseKey,
    instance_id: instanceId,
  });
  if (!result.networkOk) return { ok: false, reason: 'service_unavailable' };

  if (result.body.valid === true) return { ok: true };
  return { ok: false, reason: 'revoked' };
}

module.exports = { activateLicense, validateLicense };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/netlify/functions/__tests__/lemonsqueezy.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add web/netlify/functions/lib/lemonsqueezy.js web/netlify/functions/__tests__/lemonsqueezy.test.js
git commit -m "feat(web): add Lemon Squeezy License API client"
```

---

### Task 4: `lib/keys.js` + `scripts/generate-signing-keys.js` — one-off signing keypair generator

**Files:**
- Create: `web/netlify/functions/lib/keys.js`
- Create: `web/scripts/generate-signing-keys.js`
- Test: `web/netlify/functions/__tests__/keys.test.js`

**Interfaces:**
- Produces: `generateSigningKeyPair(): { privateKeyPem: string, publicKeyPem: string }`.
- Consumes: nothing (only Node's built-in `crypto`). This is not called by `activate.js`/`validate.js` at runtime — it is a one-time setup tool a human runs from a terminal.

- [ ] **Step 1: Write the failing test**

```js
// web/netlify/functions/__tests__/keys.test.js
import { describe, it, expect } from 'vitest';
import { generateSigningKeyPair } from '../lib/keys.js';
import { signToken, verifyToken } from '../lib/token.js';

describe('generateSigningKeyPair', () => {
  it('produces a PEM keypair that can sign and verify through token.js', () => {
    const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();
    expect(privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(publicKeyPem).toContain('BEGIN PUBLIC KEY');

    const token = signToken({ hello: 'world' }, privateKeyPem);
    expect(verifyToken(token, publicKeyPem)).toEqual({ hello: 'world' });
  });

  it('produces a different keypair on every call', () => {
    const first = generateSigningKeyPair();
    const second = generateSigningKeyPair();
    expect(first.privateKeyPem).not.toBe(second.privateKeyPem);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/netlify/functions/__tests__/keys.test.js`
Expected: FAIL — `Cannot find module '../lib/keys.js'`

- [ ] **Step 3: Write the implementation**

```js
// web/netlify/functions/lib/keys.js
const crypto = require('node:crypto');

function generateSigningKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

module.exports = { generateSigningKeyPair };
```

```js
// web/scripts/generate-signing-keys.js
const { generateSigningKeyPair } = require('../netlify/functions/lib/keys.js');

const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();

console.log('--- ACTIVATION_SIGNING_PRIVATE_KEY (Netlify env var — keep secret) ---');
console.log(privateKeyPem);
console.log('--- Public key (embed as a constant in the Electron app, not secret) ---');
console.log(publicKeyPem);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/netlify/functions/__tests__/keys.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the script manually to confirm it produces usable output**

Run: `node web/scripts/generate-signing-keys.js`
Expected: prints two PEM blocks, one `BEGIN PRIVATE KEY`, one `BEGIN PUBLIC KEY`. (Do not commit real generated keys — this step is just confirming the script runs; the real one-time key generation for production happens later, when actually setting up the Netlify env vars.)

- [ ] **Step 6: Commit**

```bash
git add web/netlify/functions/lib/keys.js web/scripts/generate-signing-keys.js web/netlify/functions/__tests__/keys.test.js
git commit -m "feat(web): add one-off Ed25519 signing keypair generator script"
```

---

### Task 5: `activate.js` — the `/api/activate` function handler

**Files:**
- Create: `web/netlify/functions/activate.js`
- Test: `web/netlify/functions/__tests__/activate.test.js`

**Interfaces:**
- Consumes: `activateLicense(licenseKey, deviceId)` from Task 3, `signToken(payload, privateKeyPem)` from Task 2.
- Produces: `exports.handler = async (event) => ({ statusCode, body })`, the Netlify Functions handler contract. Reads `process.env.ACTIVATION_SIGNING_PRIVATE_KEY`.

- [ ] **Step 1: Write the failing test**

```js
// web/netlify/functions/__tests__/activate.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../lib/lemonsqueezy.js', () => ({
  activateLicense: vi.fn(),
}));

import { activateLicense } from '../lib/lemonsqueezy.js';
import { verifyToken } from '../lib/token.js';
import { handler } from '../activate.js';

let publicKeyPem;
const ORIGINAL_ENV = process.env.ACTIVATION_SIGNING_PRIVATE_KEY;

beforeEach(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  activateLicense.mockReset();
});

afterEach(() => {
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = ORIGINAL_ENV;
});

describe('activate handler', () => {
  it('returns a signed token when activation succeeds', async () => {
    activateLicense.mockResolvedValue({ ok: true, instanceId: 'inst-1' });

    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.ok).toBe(true);
    const payload = verifyToken(parsed.token, publicKeyPem);
    expect(payload).toMatchObject({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' });
    expect(typeof payload.issued_at).toBe('number');
  });

  it('passes through a business failure reason without a token', async () => {
    activateLicense.mockResolvedValue({ ok: false, reason: 'already_activated' });

    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'already_activated' });
  });

  it('returns 400 bad_request when license_key is missing', async () => {
    const event = { body: JSON.stringify({ device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
    expect(activateLicense).not.toHaveBeenCalled();
  });

  it('returns 400 bad_request when the body is not valid JSON', async () => {
    const event = { body: 'not-json' };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/netlify/functions/__tests__/activate.test.js`
Expected: FAIL — `Cannot find module '../activate.js'`

- [ ] **Step 3: Write the implementation**

```js
// web/netlify/functions/activate.js
const { activateLicense } = require('./lib/lemonsqueezy.js');
const { signToken } = require('./lib/token.js');

function badRequest() {
  return { statusCode: 400, body: JSON.stringify({ ok: false, reason: 'bad_request' }) };
}

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return badRequest();
  }

  const { license_key: licenseKey, device_id: deviceId } = payload;
  if (!licenseKey || !deviceId) {
    return badRequest();
  }

  const result = await activateLicense(licenseKey, deviceId);
  if (!result.ok) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: result.reason }) };
  }

  const token = signToken(
    {
      license_key: licenseKey,
      instance_id: result.instanceId,
      device_id: deviceId,
      issued_at: Date.now(),
    },
    process.env.ACTIVATION_SIGNING_PRIVATE_KEY
  );

  return { statusCode: 200, body: JSON.stringify({ ok: true, token }) };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/netlify/functions/__tests__/activate.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/netlify/functions/activate.js web/netlify/functions/__tests__/activate.test.js
git commit -m "feat(web): add /api/activate function handler"
```

---

### Task 6: `validate.js` — the `/api/validate` function handler

**Files:**
- Create: `web/netlify/functions/validate.js`
- Test: `web/netlify/functions/__tests__/validate.test.js`

**Interfaces:**
- Consumes: `validateLicense(licenseKey, instanceId)` from Task 3, `signToken(payload, privateKeyPem)` from Task 2.
- Produces: `exports.handler = async (event) => ({ statusCode, body })`, same contract as Task 5.

- [ ] **Step 1: Write the failing test**

```js
// web/netlify/functions/__tests__/validate.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../lib/lemonsqueezy.js', () => ({
  validateLicense: vi.fn(),
}));

import { validateLicense } from '../lib/lemonsqueezy.js';
import { verifyToken } from '../lib/token.js';
import { handler } from '../validate.js';

let publicKeyPem;
const ORIGINAL_ENV = process.env.ACTIVATION_SIGNING_PRIVATE_KEY;

beforeEach(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  validateLicense.mockReset();
});

afterEach(() => {
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = ORIGINAL_ENV;
});

describe('validate handler', () => {
  it('returns a fresh signed token when the license is still valid', async () => {
    validateLicense.mockResolvedValue({ ok: true });

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body);
    expect(parsed.ok).toBe(true);
    const payload = verifyToken(parsed.token, publicKeyPem);
    expect(payload).toMatchObject({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' });
    expect(typeof payload.issued_at).toBe('number');
  });

  it('passes through revoked without a token', async () => {
    validateLicense.mockResolvedValue({ ok: false, reason: 'revoked' });

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('passes through service_unavailable without a token', async () => {
    validateLicense.mockResolvedValue({ ok: false, reason: 'service_unavailable' });

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('returns 400 bad_request when instance_id is missing', async () => {
    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
    expect(validateLicense).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/netlify/functions/__tests__/validate.test.js`
Expected: FAIL — `Cannot find module '../validate.js'`

- [ ] **Step 3: Write the implementation**

```js
// web/netlify/functions/validate.js
const { validateLicense } = require('./lib/lemonsqueezy.js');
const { signToken } = require('./lib/token.js');

function badRequest() {
  return { statusCode: 400, body: JSON.stringify({ ok: false, reason: 'bad_request' }) };
}

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return badRequest();
  }

  const { license_key: licenseKey, instance_id: instanceId, device_id: deviceId } = payload;
  if (!licenseKey || !instanceId || !deviceId) {
    return badRequest();
  }

  const result = await validateLicense(licenseKey, instanceId);
  if (!result.ok) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: result.reason }) };
  }

  const token = signToken(
    {
      license_key: licenseKey,
      instance_id: instanceId,
      device_id: deviceId,
      issued_at: Date.now(),
    },
    process.env.ACTIVATION_SIGNING_PRIVATE_KEY
  );

  return { statusCode: 200, body: JSON.stringify({ ok: true, token }) };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/netlify/functions/__tests__/validate.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/netlify/functions/validate.js web/netlify/functions/__tests__/validate.test.js
git commit -m "feat(web): add /api/validate function handler"
```

---

### Task 7: Wire `web/` tests into the root test suite

**Files:**
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: all test files created in Tasks 2–6.
- Produces: nothing new — this makes `npm test` at the repo root cover `web/` as well as the existing `src/dominio` tests.

- [ ] **Step 1: Modify the config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/dominio/__tests__/**/*.test.ts',
      'web/netlify/functions/__tests__/**/*.test.js',
    ],
  },
});
```

- [ ] **Step 2: Run the full suite to confirm everything passes together**

Run: `npm test`
Expected: PASS — all `src/dominio` tests plus the 23 new tests from Tasks 2–6 (4 token + 9 lemonsqueezy + 2 keys + 4 activate + 4 validate).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: include web/ function tests in the root test suite"
```

---

## Not covered by this plan (explicitly out of scope, per the design doc)

- Actually creating the Netlify site in the dashboard, naming it, and setting the base directory to `web` — a manual one-time dashboard action, not code.
- Actually creating the Lemon Squeezy store/product/license keys and running `scripts/generate-signing-keys.js` for real to populate the production `ACTIVATION_SIGNING_PRIVATE_KEY` env var — manual one-time setup, not code.
- The real landing page design (`web/public/index.html` content) — sub-project 2.
- The Electron app's activation screen, local `activation.json` storage, offline grace-period logic, and embedding the public key — sub-project 3. That work will consume the exact request/response contract defined in Tasks 5 and 6 above.
