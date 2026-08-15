const { generateSigningKeyPair } = require('../netlify/functions/lib/keys.js');

const { privateKeyPem, publicKeyPem } = generateSigningKeyPair();

console.log('--- ACTIVATION_SIGNING_PRIVATE_KEY (Netlify env var — keep secret) ---');
console.log(privateKeyPem);
console.log('--- Public key (embed as a constant in the Electron app, not secret) ---');
console.log(publicKeyPem);
