import { describe, it, expect, vi, beforeEach } from 'vitest';

import { headPublicUrl, toMediaType } from './fetchMediaType';
import { SsrfBlockedError } from './ssrfGuard';

const nodeFetchMock = vi.hoisted(() => vi.fn());

vi.mock('node-fetch', () => ({ 'default': nodeFetchMock }));

function response(status: number, headers: Record<string, string> = {}) {
  return { status, headers: { get: (name: string) => headers[name] ?? null } };
}

describe('headPublicUrl', () => {
  const signal = new AbortController().signal;

  beforeEach(() => {
    nodeFetchMock.mockReset();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1:2375/version',
    'http://[::ffff:169.254.169.254]/',
    'file:///etc/passwd',
  ])('never requests %s', async(url) => {
    await expect(headPublicUrl(url, signal)).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(nodeFetchMock).not.toHaveBeenCalled();
  });

  it('stops at a redirect that points to a blocked address', async() => {
    nodeFetchMock.mockResolvedValueOnce(response(302, { location: 'http://169.254.169.254/latest/meta-data/' }));

    await expect(headPublicUrl('https://example.com/nft.png', signal)).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('follows a redirect between public URLs', async() => {
    nodeFetchMock
      .mockResolvedValueOnce(response(301, { location: '/ipfs/QmHash' }))
      .mockResolvedValueOnce(response(200, { 'content-type': 'image/png' }));

    const result = await headPublicUrl('https://ipfs.io/nft', signal);

    expect(result.status).toBe(200);
    expect(nodeFetchMock).toHaveBeenLastCalledWith('https://ipfs.io/ipfs/QmHash', expect.objectContaining({ method: 'HEAD', redirect: 'manual' }));
  });

  it('gives up after too many redirects', async() => {
    nodeFetchMock.mockResolvedValue(response(302, { location: 'https://example.com/loop' }));

    await expect(headPublicUrl('https://example.com/loop', signal)).rejects.toThrow('Too many redirects');
  });
});

describe('toMediaType', () => {
  it.each([
    [ 'video/mp4', 'video' ],
    [ 'image/svg+xml', 'image' ],
    [ 'text/html; charset=utf-8', 'html' ],
    [ 'application/json', undefined ],
    [ null, undefined ],
  ])('maps %s to %s', (contentType, expected) => {
    expect(toMediaType(contentType)).toBe(expected);
  });
});
