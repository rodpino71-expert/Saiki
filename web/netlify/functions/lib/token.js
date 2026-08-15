const crypto = require('node:crypto');

// Netlify's env var UI (and some clipboard/shell round-trips) can flatten a
// multi-line PEM into one line, either dropping newlines entirely (replaced
// by spaces) or storing them as literal "\n" escape sequences. Reconstruct a
// proper multi-line PEM in either case so createPrivateKey/createPublicKey
// accept it regardless of how it was pasted into the environment.
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

function signToken(payload, privateKeyPem) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const privateKey = crypto.createPrivateKey(normalizePem(privateKeyPem));
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

module.exports = { signToken, verifyToken };
