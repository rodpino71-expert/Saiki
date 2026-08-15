import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { verifyToken } from '../lib/token.js';
import { handler } from '../activate.js';

let publicKeyPem;
const ORIGINAL_ENV = process.env.ACTIVATION_SIGNING_PRIVATE_KEY;

function jsonResponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
});

afterEach(() => {
  process.env.ACTIVATION_SIGNING_PRIVATE_KEY = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe('activate handler', () => {
  it('returns a signed token when activation succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { activated: true, error: null, instance: { id: 'inst-1' } })
    ));

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(403, { activated: false, error: 'This license key has reached the activation limit.' })
    ));

    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'already_activated' });
  });

  it('returns 400 bad_request when license_key is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const event = { body: JSON.stringify({ device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 bad_request when the body is not valid JSON', async () => {
    const event = { body: 'not-json' };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
  });
});
