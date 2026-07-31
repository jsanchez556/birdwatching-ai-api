import reservationService from '../../services/reservation.service.js';
import reservationStateService from '../../services/reservationState.service.js';

async function checkAvailability(args = {}, metadata = {}) {
  const result = await reservationService.checkTourAvailability(args, metadata);

  if (result?.success && metadata.conversationId && metadata.reservationState) {
    await reservationStateService.proposeValidated({
      conversationId: metadata.conversationId,
      userId: metadata.userId,
      values: {
        tourId: result.tourId,
        ...(args.participants ? { participants: args.participants } : {}),
      },
      sourceId: metadata.aiTraceId || metadata.parentTraceId,
    });
  }

  return result;
}

export default checkAvailability;
