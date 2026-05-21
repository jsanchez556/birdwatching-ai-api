import express from 'express';
import S3BucketService, {
  DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS,
} from '../storage/s3Bucket.service.js';
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

function createFileHandler(options = {}) {
  return asyncHandler(async (req, res) => {
    const key = normalizeFileName(options.buildKey
      ? options.buildKey(req)
      : req.params.filename || req.params.fileName);
    const bucketService = options.bucketService || new S3BucketService();

    if (!await bucketService.objectExists(key)) {
      throw new HttpError(404, 'File not found.', { code: 'FILE_NOT_FOUND' });
    }

    const url = await bucketService.createPresignedGetUrl(key);

    return sendSuccess(res, {
      url,
    }, {
      expiresInSeconds: bucketService.config.presignedUrlExpiresInSeconds
        || DEFAULT_PRESIGNED_URL_EXPIRES_IN_SECONDS,
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
  normalizeFileName,
};
export default router;
