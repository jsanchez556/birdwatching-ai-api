import express from 'express';
import HttpError from '../utils/httpError.js';

const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;
const AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
];

const parseRawAudio = express.raw({
  type: AUDIO_CONTENT_TYPES,
  limit: MAX_AUDIO_UPLOAD_BYTES,
});

function audioUpload(req, res, next) {
  return parseRawAudio(req, res, (error) => {
    if (error) {
      return next(new HttpError(413, 'Audio upload is too large', {
        code: 'AUDIO_UPLOAD_TOO_LARGE',
      }));
    }

    if (!Buffer.isBuffer(req.body)) {
      return next(new HttpError(400, 'Audio file is required', {
        code: 'AUDIO_FILE_REQUIRED',
      }));
    }

    req.audioUpload = {
      buffer: req.body,
      mimeType: req.headers['content-type']?.split(';')[0]?.trim().toLowerCase(),
      filename: req.headers['x-filename'],
    };
    req.body = {};

    return next();
  });
}

export { AUDIO_CONTENT_TYPES, MAX_AUDIO_UPLOAD_BYTES };
export default audioUpload;
