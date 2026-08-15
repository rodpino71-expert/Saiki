const { validateLicense } = require('./lib/lemonsqueezy.js');
const { signToken } = require('./lib/token.js');

function badRequest() {
  return { statusCode: 400, body: JSON.stringify({ ok: false, reason: 'bad_request' }) };
}

exports.handler = async (event) => {
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return badRequest();
  }

  const { license_key: licenseKey, instance_id: instanceId, device_id: deviceId } = payload;
  if (!licenseKey || !instanceId || !deviceId) {
    return badRequest();
  }

  const result = await validateLicense(licenseKey, instanceId);
  if (!result.ok) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: result.reason }) };
  }

  const token = signToken(
    {
      license_key: licenseKey,
      instance_id: instanceId,
      device_id: deviceId,
      issued_at: Date.now(),
    },
    process.env.ACTIVATION_SIGNING_PRIVATE_KEY
  );

  return { statusCode: 200, body: JSON.stringify({ ok: true, token }) };
};
