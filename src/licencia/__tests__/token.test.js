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
