import { describe, it, expect, vi } from 'vitest';
import { handler } from '../validate.js';

describe('validate handler', () => {
  it('returns service_unavailable — the LemonSqueezy integration has been disconnected', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const event = { body: JSON.stringify({ license_key: 'LK-1', instance_id: 'inst-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'service_unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('returns 400 bad_request when instance_id is missing', async () => {
    const event = { body: JSON.stringify({ license_key: 'LK-1', device_id: 'dev-1' }) };
    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ ok: false, reason: 'bad_request' });
  });
});
