import express from 'express';
import HttpError from '../../utils/httpError.js';

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const parseRawImage = express.raw({
  type: IMAGE_CONTENT_TYPES,
  limit: MAX_IMAGE_UPLOAD_BYTES,
});

function imageUpload(req, res, next) {
  return parseRawImage(req, res, (error) => {
    if (error) {
      return next(new HttpError(413, 'Image upload is too large', {
        code: 'IMAGE_UPLOAD_TOO_LARGE',
      }));
    }

    if (!Buffer.isBuffer(req.body)) {
      return next();
    }

    req.imageUpload = {
      buffer: req.body,
      mimeType: req.headers['content-type']?.split(';')[0]?.trim().toLowerCase(),
      filename: req.headers['x-filename'],
    };
    req.body = {};

    return next();
  });
}

export { IMAGE_CONTENT_TYPES, MAX_IMAGE_UPLOAD_BYTES };
export default imageUpload;
