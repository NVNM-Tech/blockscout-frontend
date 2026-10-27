import http from 'node:http';

import { describe, it, expect } from 'vitest';

import { assertPublicHttpUrl, isBlockedAddress, ssrfSafeAgent } from './ssrfGuard';

describe('isBlockedAddress', () => {
  it.each([
    '169.254.169.254',
    '100.100.100.200',
    '127.0.0.1',
    '10.0.5.138',
    '172.30.0.29',
    '192.168.1.1',
    '0.0.0.0',
    '::1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe',
    'fe80::1',
    'fd00::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([ '8.8.8.8', '1.1.1.1', '::ffff:8.8.8.8', '2606:4700:4700::1111' ])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('assertPublicHttpUrl', () => {
  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:3000/',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'http://127.0.0.1:2375/version',
    'file:///etc/passwd',
    'gopher://example.com/',
  ])('rejects %s', (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow();
  });

  it.each([
    'https://ipfs.io/ipfs/QmHash',
    'https://example.com/image.png',
    // hostnames pass the URL-level check and are resolved + checked by the agent lookup
    'http://169.254.169.254.nip.io/latest/meta-data/',
  ])('passes URL-level check for %s', (url) => {
    expect(() => assertPublicHttpUrl(url)).not.toThrow();
  });
});

describe('ssrfSafeAgent', () => {
  it('refuses to connect when a hostname resolves to loopback', async() => {
    const url = new URL('http://localhost:9/');
    const error = await new Promise<Error & { code?: string }>((resolve) => {
      http.get(url, { agent: ssrfSafeAgent(url) }, () => resolve(new Error('connected')))
        .on('error', resolve);
    });

    expect(error.code).toBe('ERR_SSRF_BLOCKED');
  });
});
