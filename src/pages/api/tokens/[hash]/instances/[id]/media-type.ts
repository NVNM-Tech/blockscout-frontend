// SPDX-License-Identifier: LicenseRef-Blockscout

import type { NextApiRequest, NextApiResponse } from 'next';

import metrics from 'src/server/monitoring/metrics';
import fetchApi from 'src/server/utils/fetchApi';
import { headPublicUrl, toMediaType } from 'src/server/utils/fetchMediaType';
import { httpLogger } from 'src/server/utils/logger';
import { SsrfBlockedError } from 'src/server/utils/ssrfGuard';

import getQueryParamString from 'src/shared/router/get-query-param-string';

import { SECOND } from 'src/toolkit/utils/consts';

export default async function tokenInstanceMediaTypeHandler(req: NextApiRequest, res: NextApiResponse) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort('Request to media asset timed out');
  }, 10 * SECOND);

  try {
    const field = getQueryParamString(req.query.field) as 'animation_url' | 'image_url';
    if (![ 'animation_url', 'image_url' ].includes(field)) {
      throw new Error('Invalid field parameter');
    }

    const apiData = await fetchApi({
      resource: 'core:token_instance',
      pathParams: { hash: getQueryParamString(req.query.hash), id: getQueryParamString(req.query.id) },
      timeout: SECOND,
    });
    if (!apiData) {
      throw new Error('Failed to fetch token instance');
    }

    const mediaUrl = apiData[field];
    if (!mediaUrl) {
      throw new Error('No media URL found');
    }

    const mediaRequestEndTime = metrics?.apiRequestDuration.startTimer();
    const mediaResponse = await headPublicUrl(mediaUrl, controller.signal);
    const mediaRequestDuration = mediaRequestEndTime?.({ route: '/media-type', code: mediaResponse.status });

    if (mediaResponse.status === 200) {
      httpLogger.logger.info({ message: 'API fetch', url: mediaUrl, code: mediaResponse.status, duration: mediaRequestDuration });
    } else {
      httpLogger.logger.error({ message: 'API fetch', url: mediaUrl, code: mediaResponse.status, duration: mediaRequestDuration });
      throw new Error();
    }

    res.status(200).json({ type: toMediaType(mediaResponse.headers.get('content-type')) });
  } catch (error) {
    if (error instanceof SsrfBlockedError) {
      httpLogger.logger.warn({ message: 'Blocked media-type fetch', url: req.url, reason: error.message });
    }
    res.status(200).json({ type: undefined });
  } finally {
    clearTimeout(timeout);
  }
}
