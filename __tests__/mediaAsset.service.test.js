const {
  mediaRoutePathFromKey,
  MediaAssetService,
  normalizeAssetList,
  normalizeEntityMedia,
} = await import('../src/services/mediaAsset.service.js');

describe('MediaAssetService', () => {
  it('looks up media by generic entity type, entity id, and media type', () => {
    const service = new MediaAssetService({
      mediaAssets: {
        tours: {
          'tour-123': {
            images: [
              'https://example-bucket.s3.amazonaws.com/tours/tour-123/hero.jpg',
              's3/tours/tour-123/gallery.jpg',
            ],
          },
        },
        guides: {
          'guide-7': {
            portraits: ['https://example-bucket.s3.amazonaws.com/guides/guide-7.jpg'],
          },
        },
      },
    });

    expect(service.getMediaAssets('tours', 'tour-123', 'images')).toEqual([
      'https://example-bucket.s3.amazonaws.com/tours/tour-123/hero.jpg',
      's3/tours/tour-123/gallery.jpg',
    ]);
    expect(service.getFirstMediaAsset('guides', 'guide-7', 'portraits'))
      .toBe('https://example-bucket.s3.amazonaws.com/guides/guide-7.jpg');
  });

  it('formats relative media keys as media route paths', () => {
    const service = new MediaAssetService({
      mediaAssets: {
        tours: {
          1: {
            portraits: [
              'tours/1.png',
              '/files/tours/1-detail.png',
              'https://private-bucket.example.test/tours/not-exposed.png',
            ],
          },
        },
      },
    });

    expect(mediaRoutePathFromKey('tours/1.png')).toBe('/files/tours/1.png');
    expect(mediaRoutePathFromKey('/files/tours/1.png')).toBe('/files/tours/1.png');
    expect(mediaRoutePathFromKey('https://example.test/tours/1.png')).toBeNull();
    expect(service.getMediaAssetPaths('tours', 1, 'portraits')).toEqual([
      '/files/tours/1.png',
      '/files/tours/1-detail.png',
    ]);
    expect(service.getFirstMediaAssetPath('tours', 1, 'portraits')).toBe('/files/tours/1.png');
  });

  it('returns safe fallbacks for missing or invalid mappings', () => {
    const service = new MediaAssetService({
      mediaAssets: {
        tours: {
          'tour-123': {
            images: ['https://example.test/image.jpg'],
            videos: 'https://example.test/video.mp4',
          },
        },
      },
    });

    expect(service.getEntityMedia('tours', 'missing')).toEqual({});
    expect(service.getEntityMedia('', 'tour-123')).toEqual({});
    expect(service.getMediaAssets('tours', 'tour-123', 'videos')).toEqual([]);
    expect(service.getMediaAssets('tours', 'tour-123', '')).toEqual([]);
    expect(service.getMediaAssetPaths('tours', 'tour-123', 'videos')).toEqual([]);
    expect(service.getFirstMediaAssetPath('destinations', 'monteverde', 'images')).toBeNull();
    expect(service.getFirstMediaAsset('destinations', 'monteverde', 'images')).toBeNull();
  });

  it('normalizes editable JSON entries without leaking malformed values', () => {
    expect(normalizeAssetList([
      ' https://example.test/one.jpg ',
      '',
      null,
      'photos/two.jpg',
    ])).toEqual([
      'https://example.test/one.jpg',
      'photos/two.jpg',
    ]);

    expect(normalizeEntityMedia({
      images: ['https://example.test/one.jpg'],
      videos: 'https://example.test/video.mp4',
      ' ': ['https://example.test/ignored.jpg'],
    })).toEqual({
      images: ['https://example.test/one.jpg'],
    });
  });
});
