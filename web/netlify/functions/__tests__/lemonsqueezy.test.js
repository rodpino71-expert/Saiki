import { describe, it, expect, vi, afterEach } from 'vitest';
import { activateLicense, validateLicense } from '../lib/lemonsqueezy.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status, body) {
  return {
    status,
    json: async () => body,
  };
}

describe('activateLicense', () => {
  it('returns ok + instanceId when Lemon Squeezy activates the license', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { activated: true, error: null, instance: { id: 'inst-1' } })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: true, instanceId: 'inst-1' });
  });

  it('returns already_activated when the activation limit error is returned', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(403, { activated: false, error: 'This license key has reached the activation limit.' })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'already_activated' });
  });

  it('returns invalid_key for any other activation error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(404, { activated: false, error: 'License key not found.' })
    ));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'invalid_key' });
  });

  it('returns service_unavailable on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('returns service_unavailable on a 5xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, {})));
    const result = await activateLicense('LICENSE-KEY', 'device-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });

  it('sends the request as form-urlencoded with the right fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { activated: true, error: null, instance: { id: 'inst-1' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    await activateLicense('LICENSE-KEY', 'device-1');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/licenses/activate');
    expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(options.headers['Accept']).toBe('application/json');
    expect(options.body.toString()).toBe('license_key=LICENSE-KEY&instance_name=device-1');
  });
});

describe('validateLicense', () => {
  it('returns ok when Lemon Squeezy reports the license as valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: true, error: null })));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns revoked when Lemon Squeezy reports the license as invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { valid: false, error: 'License key has expired.' })));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: false, reason: 'revoked' });
  });

  it('returns service_unavailable on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await validateLicense('LICENSE-KEY', 'inst-1');
    expect(result).toEqual({ ok: false, reason: 'service_unavailable' });
  });
});
