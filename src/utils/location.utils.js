import { areTextsSimilar } from './text.utils.js';
import { parseDateTime } from './normalizer.utils.js';

function normalizeLocationEntry(location, fallback = {}) {
  if (!location) {
    return null;
  }

  if (typeof location === 'string') {
    return {
      locName: location,
      obsDt: fallback.obsDt || null,
      howMany: fallback.howMany,
      lat: fallback.lat,
      lng: fallback.lng,
    };
  }

  const locName = location.locName || location.location || location.name;

  if (!locName && !location.obsDt) {
    return null;
  }

  return {
    locId: location.locId,
    locName,
    obsDt: location.obsDt || fallback.obsDt || null,
    howMany: location.howMany ?? fallback.howMany,
    lat: location.lat ?? fallback.lat,
    lng: location.lng ?? fallback.lng,
  };
}

function areLocationEntriesSimilar(candidate, current) {
  if (candidate?.locId && current?.locId) {
    return candidate.locId === current.locId;
  }

  return areTextsSimilar(candidate?.locName, current?.locName);
}

function compareRecentLocationEntries(left, right) {
  const leftTimestamp = parseDateTime(left?.obsDt);
  const rightTimestamp = parseDateTime(right?.obsDt);

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return String(left?.locName || '').localeCompare(String(right?.locName || ''));
}

function sortRecentLocationEntries(locations) {
  return [...locations]
    .filter((location) => location?.obsDt)
    .sort(compareRecentLocationEntries);
}

function omitUndefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object)
      .filter(([, value]) => value !== undefined)
  );
}

export {
  areLocationEntriesSimilar,
  compareRecentLocationEntries,
  normalizeLocationEntry,
  omitUndefinedValues,
  sortRecentLocationEntries,
};
