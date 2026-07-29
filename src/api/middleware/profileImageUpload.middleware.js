import express from 'express';
import {
  PROFILE_IMAGE_CONTENT_TYPES,
  PROFILE_IMAGE_MAX_BYTES,
} from '../../services/auth.service.js';
import HttpError from '../../utils/httpError.js';

const parseRawProfileImage = express.raw({
  type: [...PROFILE_IMAGE_CONTENT_TYPES.keys()],
  limit: PROFILE_IMAGE_MAX_BYTES,
});

function profileImageUpload(req, res, next) {
  return parseRawProfileImage(req, res, (error) => {
    if (error) {
      return next(new HttpError(413, 'Profile image is too large', {
        code: 'PROFILE_IMAGE_TOO_LARGE',
      }));
    }

    if (!Buffer.isBuffer(req.body)) {
      return next(new HttpError(422, 'Profile image must be a JPEG, PNG, or WebP file', {
        code: 'INVALID_PROFILE_IMAGE_TYPE',
      }));
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

export default profileImageUpload;
