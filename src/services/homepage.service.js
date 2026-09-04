import env from '../config/env.js';
import ragService from './rag.service.js';
import tourService from './tour.service.js';
import {
  appendTourImageVersion,
  resolveTourImageKey,
} from '../utils/tourImage.utils.js';
import { formatTourDuration } from '../utils/tourDuration.utils.js';

const heroContent = {
  heroVideo: 'https://www.youtube-nocookie.com/embed/o02Dq_DaY-U?autoplay=1&mute=1&controls=0&loop=1&playlist=o02Dq_DaY-U&start=54&end=84&playsinline=1&modestbranding=1&rel=0',
};


function getTourPortraitUrl(tour) {
  const key = resolveTourImageKey({ tourId: tour.tourId || tour.id, imagePath: tour.imagePath });
  const version = tour.imagePath ? tour.imageVersion : '';
  return key ? appendTourImageVersion(`/files/${key}`, version) : null;
}

function normalizeTour(tour) {
  const title = tour.name || tour.title;
  const durationValue = tour.durationValue ?? tour.duration_value ?? tour.durationHours ?? tour.duration_hours;
  const durationUnit = tour.durationUnit ?? tour.duration_unit ?? 'hours';
  const tourType = tour.tourType || 'unscheduled';

  return {
    id: tour.tourId || tour.id,
    country: tour.country ?? null,
    zone: tour.zone ?? null,
    rank: tour.rank ?? null,
    zoneRank: tour.zoneRank ?? null,
    title,
    description: tour.description ?? null,
    location: tour.location,
    node: tour.node ?? null,
    subnode: tour.subnode ?? null,
    durationValue,
    durationUnit,
    durationHours: tour.durationHours ?? tour.duration_hours ?? null,
    duration: formatTourDuration(durationValue, durationUnit),
    pricePerPerson: tour.pricePerPerson ?? tour.price ?? null,
    difficulty: tour.difficulty || null,
    lon: tour.lon ?? null,
    lat: tour.lat ?? null,
    start_date: tour.start_date ?? tour.startDate ?? null,
    end_date: tour.end_date ?? tour.endDate ?? null,
    tourType,
    type: tour.type || 'Birdwatching',
    isActive: tour.isActive !== false,
    maxParticipants: tour.maxParticipants ?? tour.availableSlots ?? null,
    minimumPrice: tour.minimumPrice ?? tour.pricePerPerson ?? tour.price ?? null,
    availableSlots: tourType === 'scheduled' ? tour.availableSlots ?? null : null,
    occurrenceDates: Array.isArray(tour.occurrenceDates) ? tour.occurrenceDates : [],
    imagePath: tour.imagePath ?? null,
    imageVersion: tour.imageVersion ?? null,
    portraitUrl: getTourPortraitUrl(tour),
    birds: Array.isArray(tour.birds) ? tour.birds : [],
  };
}

function parseConfiguredHeadlineBirds() {
  return (env.headLineBirds || env.homepageBirdHighlights || [])
    .map((name) => name.trim())
    .filter(Boolean);
}

function looksLikeSpeciesCode(value) {
  return /^[a-z]{2,}\d+[a-z0-9]*$/i.test(value) && !/\s/.test(value);
}

function shuffleValues(values) {
  return values
    .map((value) => ({ value, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ value }) => value);
}

class HomepageService {
  getHeroContent() {
    return heroContent;
  }

  async getFeaturedTours({ type } = {}) {
    const result = await tourService.getAvailableTours({ participants: 1, type });

    if (!result.success || !Array.isArray(result.tours)) {
      return [];
    }

    return result.tours.map(normalizeTour);
  }

  async getBirdHighlights() {
    const birds = [];
    const seen = new Set();

    for (const candidate of shuffleValues(parseConfiguredHeadlineBirds())) {
      if (birds.length >= 5) {
        break;
      }

      const bird = await ragService.getBirdProfile(
        looksLikeSpeciesCode(candidate)
          ? { speciesCode: candidate }
          : { name: candidate }
      );
      const key = bird?.speciesCode || bird?.commonName || bird?.name;

      if (!bird || (key && seen.has(key))) {
        continue;
      }

      if (key) {
        seen.add(key);
      }

      birds.push(bird);
    }

    return birds;
  }

  async getBirdProfile({ speciesCode, name } = {}) {
    return ragService.getBirdProfile({ speciesCode, name });
  }

}

export default new HomepageService();
