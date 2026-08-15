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
