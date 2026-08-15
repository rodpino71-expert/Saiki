import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { verifyToken } from '../lib/token.js';
import { handler } from '../validate.js';

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

describe('validate handler', () => {
  it('returns a fresh signed token when the license is still valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: true, error: null })));

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: false, error: 'License key has expired.' })));

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('passes through service_unavailable without a token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('returns 400 bad_request when instance_id is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
