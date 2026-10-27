// SPDX-License-Identifier: LicenseRef-Blockscout

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

// Destinations a server-side fetch of a user-influenced URL must never reach.
// 169.254.0.0/16 covers cloud metadata (GCE/GKE 169.254.169.254, AWS, Azure).
// 100.64.0.0/10 covers Alibaba metadata (100.100.100.200).
const IPV4_BLOCKED: Array<[ string, number ]> = [
  [ '0.0.0.0', 8 ],
  [ '10.0.0.0', 8 ],
  [ '100.64.0.0', 10 ],
  [ '127.0.0.0', 8 ],
  [ '169.254.0.0', 16 ],
  [ '172.16.0.0', 12 ],
  [ '192.0.0.0', 24 ],
  [ '192.168.0.0', 16 ],
  [ '198.18.0.0', 15 ],
  [ '224.0.0.0', 4 ],
  [ '240.0.0.0', 4 ],
];
// Do not add ::ffff:0:0/96: net.BlockList applies it to every IPv4 check and blocks all IPv4.
// IPv4-mapped addresses are unwrapped in isBlockedAddress() instead.
const IPV6_BLOCKED: Array<[ string, number ]> = [
  [ '::', 128 ],
  [ '::1', 128 ],
  [ '64:ff9b::', 96 ],
  [ 'fc00::', 7 ],
  [ 'fe80::', 10 ],
  [ 'ff00::', 8 ],
];

const blockList = new net.BlockList();
IPV4_BLOCKED.forEach(([ address, prefix ]) => blockList.addSubnet(address, prefix, 'ipv4'));
IPV6_BLOCKED.forEach(([ address, prefix ]) => blockList.addSubnet(address, prefix, 'ipv6'));

export class SsrfBlockedError extends Error {
  code = 'ERR_SSRF_BLOCKED';
}

// WHATWG URL serialises [::ffff:169.254.169.254] as [::ffff:a9fe:a9fe], so both forms are unwrapped.
function unwrapIpv4Mapped(address: string): string {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) {
    return dotted[1];
  }

  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [ high >> 8, high & 0xff, low >> 8, low & 0xff ].join('.');
  }

  return address;
}

export function isBlockedAddress(address: string): boolean {
  const normalized = unwrapIpv4Mapped(address);
  const family = net.isIP(normalized);
  if (family === 0) {
    return true;
  }
  return blockList.check(normalized, family === 6 ? 'ipv6' : 'ipv4');
}

type LookupCallback = (error: Error | null, address?: string | Array<dns.LookupAddress>, family?: number) => void;

// Runs at connect time for every hostname, so a DNS answer that changes between
// validation and connection (rebinding) is still checked.
// net.connect() skips `lookup` for IP-literal hosts; assertPublicHttpUrl() covers those.
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }

    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
      callback(new SsrfBlockedError(`Blocked destination address for ${ hostname }`));
      return;
    }

    if (options.all) {
      callback(null, addresses);
      return;
    }

    callback(null, addresses[0].address, addresses[0].family);
  });
}

const httpAgent = new http.Agent({ lookup: safeLookup as net.LookupFunction });
const httpsAgent = new https.Agent({ lookup: safeLookup as net.LookupFunction });

export function ssrfSafeAgent(parsedUrl: URL) {
  return parsedUrl.protocol === 'http:' ? httpAgent : httpsAgent;
}

export function assertPublicHttpUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Blocked protocol ${ url.protocol }`);
  }

  // URL keeps IPv6 literals bracketed, e.g. "[::1]".
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (net.isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new SsrfBlockedError(`Blocked destination address ${ host }`);
  }

  return url;
}
