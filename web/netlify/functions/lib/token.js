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
