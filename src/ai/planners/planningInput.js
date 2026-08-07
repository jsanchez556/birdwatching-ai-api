import { normalizeTextOrEmpty } from '../../utils/normalizer.utils.js';

export function getPriorUserMessage(messages = []) {
  const userMessages = messages
    .filter((message) => message?.role === 'user')
    .map((message) => normalizeTextOrEmpty(message.content))
    .filter(Boolean);
  return userMessages.length > 1 ? userMessages[userMessages.length - 2] : '';
}

export function getLastAssistantMessage(messages = []) {
  return [...messages].reverse().find((message) => message?.role === 'assistant')?.content || '';
}

export function getRecentUserMessages(messages = []) {
  return [...messages].reverse()
    .filter((message) => message?.role === 'user')
    .map((message) => normalizeTextOrEmpty(message.content))
    .filter(Boolean);
}

export function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function extractParticipants(text) {
  const match = text.match(/\b(?:for|we are|group of|party of|spots? for|reserve)\s+(\d{1,2})\b/i)
    || text.match(/\b(\d{1,2})\s+(?:people|persons|participants|guests|spots?)\b/i)
    || text.match(/\bparticipants?\s*:\s*(\d{1,2})\b/i);
  return match ? Number(match[1]) : undefined;
}

export function isAffirmativeConfirmation(text, context = {}) {
  const action = context.recentMetadata?.uiAction;
  const hasConfirmAction = ['choice', 'reservation_confirmation'].includes(action?.type)
    && Array.isArray(action.options)
    && action.options.some((option) => option.value === 'confirm_reservation');
  return Boolean(
    hasConfirmAction
      && /^(yes|yeah|yep|sure|ok|okay|confirm|please confirm|yes book it|yes,? book it|go ahead|proceed)$/i
        .test(normalizeTextOrEmpty(text))
  );
}

export function extractParticipantActionSelection(text, context = {}) {
  const action = context.recentMetadata?.uiAction;
  const match = normalizeTextOrEmpty(text).match(/^\d{1,2}$/);
  if (action?.type !== 'participant_count' || !match) return undefined;
  const selectedCount = Number(match[0]);
  const min = Number(action.min || 1);
  const max = Number(action.max);
  if (Number.isFinite(max) && selectedCount > max) return undefined;
  return selectedCount >= min ? selectedCount : undefined;
}

export function extractTourId(text) {
  const match = text.match(/\btour\s*#?\s*(\d+)\b/i)
    || text.match(/\bID\s*#?\s*(\d+)\b/i)
    || text.match(/\bI choose tour\s+(\d+)\b/i);
  return match ? Number(match[1]) : undefined;
}

export function extractTourSelectionText(message) {
  return normalizeTextOrEmpty(message)
    .match(/\b(?:i choose|select|pick|book|reserve)\s+(?:tour\s+\d+\s*:?\s*)?(.+)$/i)?.[1]?.trim();
}

export function extractCustomerName(message) {
  return message.match(/\b(?:my name is|name is|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/)?.[1];
}

export function extractEmail(text) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

export function extractLocation(text) {
  if (/monteverde/i.test(text)) return 'Monteverde';
  if (/tortuguero/i.test(text)) return 'Tortuguero';
  if (/sarapiqui/i.test(text)) return 'Sarapiqui';
  if (/cerro de la muerte|savegre/i.test(text)) return 'Cerro de la Muerte';
  if (/bijagua|upala|tenorio|r[ií]o celeste/i.test(text)) return 'Tenorio-Bijagua and Rio Celeste';
  return undefined;
}

export function normalizeForMatch(value) {
  return normalizeTextOrEmpty(value).toLowerCase().replace(/[_-]+/g, ' ');
}

export function compactPlanningArgs(args) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

export function extractTransportationSelection(message, context = {}) {
  const normalized = normalizeForMatch(message);
  const action = context.recentMetadata?.uiAction;
  if (action?.type === 'transportation_selection' && Array.isArray(action.options)) {
    const selectedOption = action.options.find((option) => [
      option.label,
      option.value?.transportationOption,
      option.value?.transportationOption?.replace(/_/g, ' '),
    ].map(normalizeForMatch).filter(Boolean).some((candidate) => normalized.includes(candidate)));
    if (selectedOption?.value?.transportationOption) {
      return compactPlanningArgs({
        ...selectedOption.value,
        label: selectedOption.value.label || selectedOption.label,
        pricePerPerson: selectedOption.value.pricePerPerson,
        totalPrice: selectedOption.value.totalPrice,
        currency: selectedOption.value.currency,
        estimatedTravelTime: selectedOption.value.estimatedTravelTime,
      });
    }
  }
  const transportationOption = /shared shuttle/i.test(message)
    ? 'shared_shuttle'
    : /private transfer/i.test(message) ? 'private_transfer' : undefined;
  if (!transportationOption) return undefined;
  return compactPlanningArgs({
    transportationOption,
    origin: /san jos[eé]/i.test(message) ? 'San Jose' : undefined,
    destination: extractLocation(message),
  });
}

export function extractTransportationDecline(message) {
  return /\b(no transportation|no transport|own car|drive myself|driving myself|i'?ll drive|do not need (?:transport|transportation)|don'?t need (?:transport|transportation)|have my own (?:transport|transportation))\b/i
    .test(normalizeTextOrEmpty(message));
}

export function extractFromRecentUserMessages(messages = [], extractor) {
  for (const recentMessage of getRecentUserMessages(messages)) {
    const value = extractor(recentMessage);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function hasTransportationPreference(context = {}) {
  return Boolean(
    context.selectedTransportation
      || context.transportationDeclined
      || context.recentMetadata?.selectedTransportation
      || context.recentMetadata?.transportationDeclined
      || extractFromRecentUserMessages(context.messages, extractTransportationDecline)
  );
}

export function hasTransportationRequest(context = {}) {
  const requestedInHistory = getRecentUserMessages(context.messages).some((message) => (
    /\b(transport|transportation|transfer|shuttle|pickup)\b/i.test(message)
      && !extractTransportationDecline(message)
  ));
  return Boolean(
    context.requestedTransportation
      || context.recentMetadata?.requestedTransportation
      || requestedInHistory
  );
}

export function extractBudget(text) {
  if (/\bbudget|cheap|affordable|low cost\b/i.test(text)) return 'budget';
  if (/\bluxury|premium|private\b/i.test(text)) return 'luxury';
  if (/\bmoderate|midrange|mid-range\b/i.test(text)) return 'moderate';
  return undefined;
}

export function extractDifficulty(text) {
  if (/\beasy|beginner|accessible\b/i.test(text)) return 'easy';
  if (/\bchallenging|hard|strenuous\b/i.test(text)) return 'challenging';
  if (/\bmoderate\b/i.test(text)) return 'moderate';
  return undefined;
}

export function extractDiscountCode(message) {
  return message.match(/\b(?:code|discount)\s+([A-Z0-9_-]{3,20})\b/i)?.[1]?.toUpperCase();
}
