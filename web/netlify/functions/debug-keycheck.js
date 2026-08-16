const { signToken, verifyToken } = require('./lib/token.js');

const APP_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9LgqQ4260n/MbZLTesKxz75O0TQcijn9jleVnuhITeM=
-----END PUBLIC KEY-----`;

exports.handler = async () => {
  try {
    const token = signToken({ probe: true, t: Date.now() }, process.env.ACTIVATION_SIGNING_PRIVATE_KEY);
    const payload = verifyToken(token, APP_PUBLIC_KEY_PEM);
    return {
      statusCode: 200,
      body: JSON.stringify({ keypairMatches: payload !== null }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      body: JSON.stringify({ keypairMatches: false, error: e.message }),
    };
  }
};
