const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav']);

function extensionFromFilename(filename = '') {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

function fallbackFilename(mimeType) {
  return mimeType === 'audio/mpeg' || mimeType === 'audio/mp3'
    ? 'upload.mp3'
    : 'upload.wav';
}

export function validateAudioUpload(req) {
  const errors = [];
  const upload = req.audioUpload;

  if (!upload?.buffer?.length) {
    errors.push('Audio file is required');
  }

  if (!ALLOWED_AUDIO_MIME_TYPES.has(upload?.mimeType)) {
    errors.push('Audio file must be an mp3 or wav');
  }

  const filename = typeof upload?.filename === 'string' ? upload.filename.trim() : '';
  const extension = extensionFromFilename(filename);

  if (filename && !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    errors.push('Audio filename must end in .mp3 or .wav');
  }

  return {
    message: 'Invalid audio upload',
    errors,
    value: errors.length === 0 ? {
      audioUpload: {
        buffer: upload.buffer,
        mimeType: upload.mimeType,
        filename: filename || fallbackFilename(upload.mimeType),
      },
    } : {},
  };
}

export {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME_TYPES,
  extensionFromFilename,
};
