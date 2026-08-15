const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

async function postForm(path, fields) {
  const body = new URLSearchParams(fields);
  try {
    const res = await fetch(`${LS_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    if (res.status >= 500) {
      return { networkOk: false };
    }
    const json = await res.json();
    return { networkOk: true, status: res.status, body: json };
  } catch {
    return { networkOk: false };
  }
}

async function activateLicense(licenseKey, deviceId) {
  const result = await postForm('/licenses/activate', {
    license_key: licenseKey,
    instance_name: deviceId,
  });
  if (!result.networkOk) return { ok: false, reason: 'service_unavailable' };

  const { body } = result;
  if (body.activated === true) {
    return { ok: true, instanceId: body.instance.id };
  }

  const errorText = String(body.error || '').toLowerCase();
  if (errorText.includes('activation limit')) {
    return { ok: false, reason: 'already_activated' };
  }
  return { ok: false, reason: 'invalid_key' };
}

async function validateLicense(licenseKey, instanceId) {
  const result = await postForm('/licenses/validate', {
    license_key: licenseKey,
    instance_id: instanceId,
  });
  if (!result.networkOk) return { ok: false, reason: 'service_unavailable' };

  if (result.body.valid === true) return { ok: true };
  return { ok: false, reason: 'revoked' };
}

module.exports = { activateLicense, validateLicense };
