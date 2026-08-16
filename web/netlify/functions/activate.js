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

  const { license_key: licenseKey, device_id: deviceId } = payload;
  if (!licenseKey || !deviceId) {
    return badRequest();
  }

  return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'service_unavailable' }) };
};
