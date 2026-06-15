import express from 'express';
import HttpError from '../../utils/httpError.js';

const MAX_DOCUMENT_UPLOAD_BYTES = 2 * 1024 * 1024;
const DOCUMENT_CONTENT_TYPES = [
  'text/plain',
  'text/markdown',
  'application/octet-stream',
];

const parseRawDocument = express.raw({
  type: DOCUMENT_CONTENT_TYPES,
  limit: MAX_DOCUMENT_UPLOAD_BYTES,
});

function documentUpload(req, res, next) {
  return parseRawDocument(req, res, (error) => {
    if (error) {
      return next(new HttpError(413, 'Document upload is too large', {
        code: 'DOCUMENT_UPLOAD_TOO_LARGE',
      }));
    }

    if (!Buffer.isBuffer(req.body)) {
      return next();
    }

    req.documentUpload = {
      buffer: req.body,
      mimeType: req.headers['content-type']?.split(';')[0]?.trim().toLowerCase(),
      filename: req.headers['x-filename'],
    };
    req.body = {};

    return next();
  });
}

export {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_UPLOAD_BYTES,
};
export default documentUpload;
