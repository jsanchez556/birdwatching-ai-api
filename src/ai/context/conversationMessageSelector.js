import { cleanComparableText } from '../../utils/text.utils.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'great',
  'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'thanks', 'that',
  'the', 'this', 'to', 'we', 'with', 'you', 'your',
  'de', 'el', 'en', 'es', 'esta', 'gracias', 'la', 'las', 'los', 'mi', 'para',
  'por', 'que', 'un', 'una', 'y', 'yo',
]);

const CONCEPT_GROUPS = Object.freeze({
  reservation: ['book', 'booking', 'reserve', 'reservation', 'reservar', 'reserva'],
  tour: ['excursion', 'tour', 'trip', 'visita'],
  meal: ['breakfast', 'dinner', 'food', 'lunch', 'meal', 'comida', 'almuerzo', 'cena'],
  dietary: ['allergic', 'allergy', 'allergies', 'dietary', 'gluten', 'peanut', 'allergia', 'alergia'],
  transfer: ['pickup', 'shuttle', 'transport', 'transfer', 'recogida', 'transporte'],
  schedule: ['date', 'day', 'itinerary', 'schedule', 'time', 'fecha', 'horario', 'itinerario'],
  participants: ['guest', 'participant', 'people', 'person', 'persona', 'participante'],
  accessibility: ['accessible', 'accessibility', 'mobility', 'wheelchair', 'accesible', 'movilidad'],
  bird: ['bird', 'birding', 'birdwatching', 'species', 'ave', 'aves', 'especie'],
});

const CORRECTION_PATTERNS = [
  /\bactually\b/i,
  /\bcorrection\b/i,
  /\bi (?:meant|mean)\b/i,
  /\bnot .{0,80}\b(?:but|instead)\b/i,
  /^\s*no[,;:]?\s+(?:i |we |use |make |change |the |it |dije|somos|usa)/i,
  /\bupdate that\b/i,
  /\ben realidad\b/i,
  /\bcorrecci[oó]n\b/i,
  /\bquise decir\b/i,
  /\bno .{0,80}\bsino\b/i,
  /\bcambia(?:r)? eso\b/i,
];

const SAFETY_PATTERNS = [
  /\ballerg(?:y|ic|ies|en)\b/i,
  /\b(?:alergia|al[eé]rgic[oa])\b/i,
  /\b(?:medical|medication|medicine|health condition)\b/i,
  /\b(?:m[eé]dic[oa]|medicamento|condici[oó]n de salud)\b/i,
  /\b(?:wheelchair|mobility|accessible|accessibility)\b/i,
  /\b(?:silla de ruedas|movilidad|accesibilidad)\b/i,
  /\b(?:cannot|can't|must not|avoid) (?:eat|walk|climb|take|consume)\b/i,
  /\b(?:no puedo|no debe|evitar) (?:comer|caminar|subir|tomar|consumir)\b/i,
  /\b(?:pregnan|embarazad|anaphyl|anafil)\w*\b/i,
  /\b(?:diabet|celiac|coeliac|nut[- ]free|gluten[- ]free)\w*\b/i,
];

const BUSINESS_PATTERNS = [
  /\b(?:book|booking|reservation|reserve|tour|participant|guest|pickup|shuttle|transport|price|payment|discount|itinerary)\b/i,
  /\b(?:reserv|excursi[oó]n|participante|hu[eé]sped|recogida|transporte|precio|pago|descuento|itinerario)\w*\b/i,
];

const CONFIRMED_RESERVATION_PATTERNS = [
  /\b(?:reservation|booking) (?:is |was )?(?:confirmed|complete|created)\b/i,
  /\b(?:confirmed|selected) (?:tour|date|pickup|transport|participant)\b/i,
  /\b(?:tour|date|pickup|transport|participant|guest).{0,40}\b(?:confirmed|selected|set)\b/i,
  /\b(?:confirmed|selected|set).{0,40}\b(?:tour|date|pickup|transport|participant|guest)\b/i,
  /\bconfirmation (?:number|code|id)\b/i,
  /\b(?:reserva|reservaci[oó]n) (?:est[aá] )?(?:confirmada|completada|creada)\b/i,
  /\b(?:tour|fecha|recogida|transporte) confirmad[oa]\b/i,
];

const UNRESOLVED_PATTERNS = [
  /\b(?:pending|still need|need to|must|waiting for|requires? confirmation|don't forget)\b/i,
  /\b(?:i|we|you) (?:will|shall|promise|agreed to)\b/i,
  /\b(?:pendiente|a[uú]n falta|necesit(?:o|amos|a)|debe(?:mos|s)?|esperando|requiere confirmaci[oó]n|no olvides)\b/i,
  /\b(?:voy|vamos|va) a\b/i,
];

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function matchesAny(content, patterns) {
  return patterns.some((pattern) => pattern.test(content));
}

function semanticTokens(value) {
  const normalized = cleanComparableText(value);
  if (!normalized) return new Set();
  const tokens = new Set(normalized.split(' ').filter((token) => (
    token.length > 1 && !STOP_WORDS.has(token)
  )));
  for (const [concept, variants] of Object.entries(CONCEPT_GROUPS)) {
    if (variants.some((variant) => tokens.has(variant))) tokens.add(`concept:${concept}`);
  }
  return tokens;
}

function computeSemanticRelevance(content, currentRequest) {
  const messageTokens = semanticTokens(content);
  const requestTokens = semanticTokens(currentRequest);
  if (messageTokens.size === 0 || requestTokens.size === 0) return 0;
  const shared = [...messageTokens].filter((token) => requestTokens.has(token)).length;
  const requestCoverage = shared / requestTokens.size;
  const messageCoverage = shared / messageTokens.size;
  return Number((requestCoverage * 0.7 + messageCoverage * 0.3).toFixed(6));
}

function computePositionRecency(index, total) {
  if (total <= 1) return 1;
  return Number((0.1 + (0.9 * index) / (total - 1)).toFixed(6));
}

function inferConversationSignals(message, {
  currentRequest,
  position,
  totalMessages,
} = {}) {
  const content = String(message?.content || '');
  const supplied = message?.contextSignals || message?.metadata?.contextSignals || {};
  const userMessage = message?.role === 'user';
  const explicitCorrection = clampScore(
    supplied.explicitCorrection,
    userMessage && matchesAny(content, CORRECTION_PATTERNS) ? 1 : 0
  );
  const safetyRelevance = clampScore(
    supplied.safetyRelevance,
    userMessage && matchesAny(content, SAFETY_PATTERNS) ? 1 : 0
  );
  const businessImportance = clampScore(
    supplied.businessImportance,
    matchesAny(content, BUSINESS_PATTERNS) ? 1 : 0
  );
  const confirmedReservation = supplied.confirmedReservation === true
    || matchesAny(content, CONFIRMED_RESERVATION_PATTERNS);
  const unresolvedStatus = clampScore(
    supplied.unresolvedStatus,
    matchesAny(content, UNRESOLVED_PATTERNS) ? 1 : 0
  );
  const unresolvedCommitment = supplied.unresolvedCommitment === true
    || unresolvedStatus === 1;
  const semanticRelevance = clampScore(
    supplied.semanticRelevance ?? message?.semanticRelevance,
    computeSemanticRelevance(content, currentRequest)
  );
  const recency = clampScore(
    supplied.recency,
    computePositionRecency(position, totalMessages)
  );
  const baseScore = semanticRelevance * 0.45
    + recency * 0.20
    + businessImportance * 0.20
    + unresolvedStatus * 0.15;
  const contextScore = clampScore(Math.max(
    baseScore,
    explicitCorrection * 0.95,
    safetyRelevance
  ));
  const preservationReasons = [
    ...(explicitCorrection > 0 ? ['explicit_correction'] : []),
    ...(confirmedReservation ? ['confirmed_reservation'] : []),
    ...(unresolvedCommitment ? ['unresolved_commitment'] : []),
    ...(safetyRelevance > 0 ? ['safety_critical'] : []),
  ];

  return {
    semanticRelevance,
    recency,
    explicitCorrection,
    unresolvedStatus,
    safetyRelevance,
    businessImportance,
    confirmedReservation,
    unresolvedCommitment,
    contextScore: Number(contextScore.toFixed(6)),
    preservationReasons,
  };
}

export {
  computePositionRecency,
  computeSemanticRelevance,
  inferConversationSignals,
};
