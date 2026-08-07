import multer from 'multer';
import HttpError from '../../utils/httpError.js';
import {
  TOUR_IMAGE_MAX_BYTES,
  TOUR_IMAGE_MIME_TYPE,
} from '../../utils/tourImage.utils.js';

const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TOUR_IMAGE_MAX_BYTES,
    files: 1,
    fields: 0,
  },
  fileFilter(req, file, callback) {
    if (file.mimetype !== TOUR_IMAGE_MIME_TYPE) {
      callback(new HttpError(422, 'Tour image must be a PNG file', {
        code: 'INVALID_TOUR_IMAGE_TYPE',
      }));
      return;
    }

    callback(null, true);
  },
}).single('image');

function tourImageUpload(req, res, next) {
  parser(req, res, (error) => {
    if (!error) {
      if (!req.file) {
        return next(new HttpError(422, 'Tour image is required', {
          code: 'TOUR_IMAGE_REQUIRED',
        }));
      }

      req.imageUpload = {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
      };
      return next();
    }

    if (error instanceof HttpError) {
      return next(error);
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Tour image must be 5 MB or smaller', {
        code: 'TOUR_IMAGE_TOO_LARGE',
      }));
    }

    return next(new HttpError(422, 'Upload one PNG file using the image field', {
      code: 'INVALID_TOUR_IMAGE_UPLOAD',
    }));
  });
}

export { TOUR_IMAGE_MAX_BYTES, TOUR_IMAGE_MIME_TYPE };
export default tourImageUpload;
