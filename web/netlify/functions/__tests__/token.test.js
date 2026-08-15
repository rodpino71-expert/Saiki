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

  it('signs with a private key whose line breaks were flattened to spaces (e.g. pasted into a single-line env var field)', () => {
    const flattenedPrivateKey = privateKeyPem.trim().replace(/\n/g, ' ');
    const payload = { a: 1 };
    const token = signToken(payload, flattenedPrivateKey);
    expect(verifyToken(token, publicKeyPem)).toEqual(payload);
  });

  it('verifies with a public key whose line breaks were flattened to spaces', () => {
    const flattenedPublicKey = publicKeyPem.trim().replace(/\n/g, ' ');
    const token = signToken({ a: 1 }, privateKeyPem);
    expect(verifyToken(token, flattenedPublicKey)).toEqual({ a: 1 });
  });

  it('signs with a private key whose line breaks were stored as literal \\n sequences', () => {
    const escapedPrivateKey = privateKeyPem.trim().replace(/\n/g, '\\n');
    const payload = { a: 1 };
    const token = signToken(payload, escapedPrivateKey);
    expect(verifyToken(token, publicKeyPem)).toEqual(payload);
  });
});
