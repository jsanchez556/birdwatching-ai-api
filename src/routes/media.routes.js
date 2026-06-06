import express from 'express';
import env from '../config/env.js';
import asyncHandler from '../utils/asyncHandler.js';
import HttpError from '../utils/httpError.js';
import { sendSuccess } from '../utils/apiResponse.js';

const router = express.Router();

function normalizeFileName(value) {
  const fileName = String(value || '').trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  const segments = fileName.split('/').filter(Boolean);

  if (!segments.length) {
    throw new HttpError(400, 'File name is required.', { code: 'FILE_NAME_REQUIRED' });
  }

  if (fileName.length > 512 || segments.some((segment) => (
    segment === '.'
      || segment === '..'
      || !/^[a-zA-Z0-9._-]+$/.test(segment)
  ))) {
    throw new HttpError(400, 'Invalid file name.', { code: 'INVALID_FILE_NAME' });
  }

  return segments.join('/').toLowerCase();
}

function createCloudFrontUrl(baseUrl, key) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');

  if (!normalizedBaseUrl) {
    return null;
  }

  return `${normalizedBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function createFileHandler(options = {}) {
  return asyncHandler(async (req, res) => {
    const key = normalizeFileName(options.buildKey
      ? options.buildKey(req)
      : req.params.filename || req.params.fileName);
    const cloudFrontUrl = createCloudFrontUrl(
      options.cloudFrontBaseUrl ?? env.cloudFrontBaseUrl,
      key
    );

    if (!cloudFrontUrl) {
      throw new HttpError(500, 'CloudFront media delivery is not configured.', {
        code: 'MEDIA_DELIVERY_NOT_CONFIGURED',
      });
    }

    return sendSuccess(res, {
      url: cloudFrontUrl,
    }, {
      delivery: 'cloudfront',
    });
  });
}

function missingFileName(req, res, next) {
  next(new HttpError(400, 'File name is required.', { code: 'FILE_NAME_REQUIRED' }));
}

router.get('/files', missingFileName);
router.get('/files/:folderName', missingFileName);
router.get('/files/:folderName/:filename', createFileHandler({
  buildKey: (req) => `${req.params.folderName}/${req.params.filename}`,
}));

export {
  createFileHandler,
  createCloudFrontUrl,
  normalizeFileName,
};
export default router;
