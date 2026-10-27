// SPDX-License-Identifier: LicenseRef-Blockscout

import type { Response } from 'node-fetch';
import nodeFetch from 'node-fetch';

import { assertPublicHttpUrl, ssrfSafeAgent } from 'src/server/utils/ssrfGuard';

export type MediaType = 'video' | 'image' | 'html' | undefined;

const MAX_REDIRECTS = 3;

// The URL comes from on-chain token metadata, i.e. it is attacker-controlled.
// Redirects are followed manually so every hop goes through assertPublicHttpUrl();
// node-fetch's built-in follow would connect to an IP-literal Location target unchecked.
export async function headPublicUrl(rawUrl: string, signal: AbortSignal): Promise<Response> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = assertPublicHttpUrl(current);
    const response = await nodeFetch(url.toString(), {
      method: 'HEAD',
      redirect: 'manual',
      agent: ssrfSafeAgent,
      signal,
    });

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects');
}

export function toMediaType(contentType: string | null): MediaType {
  if (contentType?.startsWith('video')) {
    return 'video';
  }

  if (contentType?.startsWith('image')) {
    return 'image';
  }

  if (contentType?.startsWith('text/html')) {
    return 'html';
  }
}
