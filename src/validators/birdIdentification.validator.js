const MAX_IMAGE_URL_LENGTH = 2048;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateBirdIdentificationBody(req) {
  const allowedFields = new Set(['imageUrl']);
  const body = req.body || {};
  const errors = [];
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  const imageUrl = normalizeText(body.imageUrl);
  const upload = req.imageUpload;

  if (unknownFields.length > 0) {
    errors.push(`Unknown fields are not allowed: ${unknownFields.join(', ')}`);
  }

  if (imageUrl && upload?.buffer?.length) {
    errors.push('Provide either an image URL or an image upload, not both');
  }

  if (!imageUrl && !upload?.buffer?.length) {
    errors.push('Image URL or image upload is required');
  }

  if (imageUrl && imageUrl.length > MAX_IMAGE_URL_LENGTH) {
    errors.push(`Image URL must be ${MAX_IMAGE_URL_LENGTH} characters or fewer`);
  } else if (imageUrl) {
    try {
      const parsedUrl = new URL(imageUrl);

      if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
        errors.push('Image URL must use http or https');
      }
    } catch (error) {
      errors.push('Image URL must be a valid URL');
    }
  }

  if (upload?.buffer?.length && !ALLOWED_IMAGE_MIME_TYPES.has(upload.mimeType)) {
    errors.push('Image upload must be a JPEG, PNG, WebP, or GIF image');
  }

  return {
    message: 'Invalid bird identification payload',
    errors,
    value: errors.length === 0 ? {
      ...(imageUrl ? { imageUrl } : {}),
      ...(upload?.buffer?.length ? { imageUpload: upload } : {}),
    } : {},
  };
}

export { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_URL_LENGTH };
