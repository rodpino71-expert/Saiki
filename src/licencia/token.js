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
