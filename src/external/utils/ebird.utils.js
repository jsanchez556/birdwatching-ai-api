const EBIRD_TAXONOMY_CHUNK_SIZE = 50;

function isObservationMoreRecent(candidate, current) {
  if (!current) {
    return true;
  }

  const candidateTimestamp = Date.parse(candidate.replace(' ', 'T'));
  const currentTimestamp = Date.parse(current.replace(' ', 'T'));

  if (!Number.isNaN(candidateTimestamp) && !Number.isNaN(currentTimestamp)) {
    return candidateTimestamp > currentTimestamp;
  }

  return candidate.localeCompare(current) > 0;
}

function normalizeTaxonomyEntries(entries) {
  const taxonomyBySpeciesCode = {};

  for (const entry of entries || []) {
    if (!entry?.speciesCode) {
      continue;
    }

    taxonomyBySpeciesCode[entry.speciesCode] = {
      sciName: entry.sciName,
      comName: entry.comName,
      speciesCode: entry.speciesCode,
      familyComName: entry.familyComName,
      familySciName: entry.familySciName,
    };
  }

  return taxonomyBySpeciesCode;
}

function normalizeLocationName(location) {
  return String(location || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function areLocationsSimilar(candidate, current) {
  const normalizedCandidate = normalizeLocationName(candidate);
  const normalizedCurrent = normalizeLocationName(current);

  if (!normalizedCandidate || !normalizedCurrent) {
    return false;
  }

  if (
    normalizedCandidate === normalizedCurrent
    || normalizedCandidate.includes(normalizedCurrent)
    || normalizedCurrent.includes(normalizedCandidate)
  ) {
    return true;
  }

  const candidateTokens = new Set(normalizedCandidate.split(' '));
  const currentTokens = new Set(normalizedCurrent.split(' '));
  const sharedTokenCount = [...candidateTokens]
    .filter((token) => currentTokens.has(token)).length;
  const tokenUnionCount = new Set([...candidateTokens, ...currentTokens]).size;

  return tokenUnionCount > 0 && sharedTokenCount / tokenUnionCount >= 0.8;
}

function normalizeObservationLocation(observation, fallback = {}) {
  if (!observation) {
    return null;
  }

  if (typeof observation === 'string') {
    return {
      locName: observation,
      obsDt: fallback.obsDt || null,
      howMany: fallback.howMany,
      lat: fallback.lat,
      lng: fallback.lng,
    };
  }

  const locName = observation.locName || observation.location || observation.name;

  if (!locName && !observation.obsDt) {
    return null;
  }

  return {
    locId: observation.locId,
    locName,
    obsDt: observation.obsDt || fallback.obsDt || null,
    howMany: observation.howMany ?? fallback.howMany,
    lat: observation.lat ?? fallback.lat,
    lng: observation.lng ?? fallback.lng,
  };
}

function areObservationLocationsSimilar(candidate, current) {
  if (candidate.locId && current.locId) {
    return candidate.locId === current.locId;
  }

  return areLocationsSimilar(candidate.locName, current.locName);
}

function compareObservationLocations(left, right) {
  const leftDate = left?.obsDt || '';
  const rightDate = right?.obsDt || '';

  if (isObservationMoreRecent(leftDate, rightDate)) {
    return -1;
  }

  if (isObservationMoreRecent(rightDate, leftDate)) {
    return 1;
  }

  return String(left?.locName || '').localeCompare(String(right?.locName || ''));
}

function sortObservationLocations(locations) {
  return [...locations]
    .filter((location) => location?.obsDt)
    .sort(compareObservationLocations);
}

function mergeObservationLocation(locations, location) {
  if (!location?.obsDt) {
    return locations;
  }

  const nextLocations = [...locations];
  const matchingIndex = nextLocations.findIndex((currentLocation) => (
    areObservationLocationsSimilar(location, currentLocation)
  ));

  if (matchingIndex >= 0) {
    const currentLocation = nextLocations[matchingIndex];
    nextLocations[matchingIndex] = isObservationMoreRecent(location.obsDt, currentLocation.obsDt)
      ? location
      : currentLocation;
  } else {
    nextLocations.push(location);
  }

  return sortObservationLocations(nextLocations);
}

function cleanObservationLocation(location) {
  return Object.fromEntries(
    Object.entries(location)
      .filter(([, value]) => value !== undefined)
  );
}

function toRecentObservationSummary(locations = []) {
  const sortedLocations = sortObservationLocations(locations).map(cleanObservationLocation);

  return {
    locations: sortedLocations,
    lstDt: sortedLocations[0]?.obsDt || null,
  };
}

function summarizeRecentObservations(observations, fallbackSpeciesCode = null) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return fallbackSpeciesCode
      ? {
        [fallbackSpeciesCode]: toRecentObservationSummary(),
      }
      : {};
  }

  const observationsBySpecies = new Map();

  for (const observation of observations) {
    const speciesCode = observation?.speciesCode || fallbackSpeciesCode;

    if (!speciesCode) {
      continue;
    }

    const location = normalizeObservationLocation(observation);

    if (location) {
      const locations = observationsBySpecies.get(speciesCode) || [];
      observationsBySpecies.set(speciesCode, mergeObservationLocation(locations, location));
    }
  }

  if (fallbackSpeciesCode && !observationsBySpecies.has(fallbackSpeciesCode)) {
    observationsBySpecies.set(fallbackSpeciesCode, []);
  }

  return Object.fromEntries([...observationsBySpecies.entries()]
    .map(([speciesCode, locations]) => [speciesCode, toRecentObservationSummary(locations)]));
}

function normalizeExistingRecentObservations(payload) {
  if (Array.isArray(payload)) {
    return summarizeRecentObservations(payload);
  }

  return Object.fromEntries(
    Object.entries(payload || {})
      .map(([speciesCode, observation]) => {
        const rawLocations = Array.isArray(observation?.locations)
          ? observation.locations
          : [];
        const locations = rawLocations
          .map((location) => normalizeObservationLocation(location, observation))
          .filter(Boolean);

        return [speciesCode, toRecentObservationSummary(locations)];
      })
  );
}

function mergeRecentObservationSummaries(existingPayload, freshPayload) {
  const merged = {
    ...normalizeExistingRecentObservations(existingPayload),
  };

  for (const [speciesCode, freshObservation] of Object.entries(freshPayload || {})) {
    const existingObservation = merged[speciesCode];

    if (!existingObservation) {
      merged[speciesCode] = freshObservation;
      continue;
    }

    let locations = [...(existingObservation.locations || [])];

    for (const location of freshObservation.locations || []) {
      locations = mergeObservationLocation(locations, location);
    }

    merged[speciesCode] = toRecentObservationSummary(locations);
  }

  return merged;
}

export {
  EBIRD_TAXONOMY_CHUNK_SIZE,
  areLocationsSimilar,
  mergeRecentObservationSummaries,
  normalizeTaxonomyEntries,
  summarizeRecentObservations,
};
