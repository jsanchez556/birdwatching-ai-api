import reservationService from '../../services/reservation.service.js';

function addTransferTotals(result = {}, metadata = {}) {
  const selectedTransfer = metadata.selectedTransfer;
  const transferPrice = Number(selectedTransfer?.totalPrice);
  const pickupMatches = !result.pickupLocation
    || (typeof selectedTransfer?.origin === 'string'
      && selectedTransfer.origin.trim().toLowerCase() === result.pickupLocation.trim().toLowerCase());

  if (result.transferRequired !== true || !pickupMatches || !Number.isFinite(transferPrice)) {
    return result;
  }

  return {
    ...result,
    tourTotalPrice: result.tourTotalPrice ?? result.totalPrice,
    transferPrice,
    grandTotalPrice: result.totalPrice + transferPrice,
  };
}

export async function createReservation(args = {}, metadata = {}) {
  const result = await reservationService.createReservationFromState({
    expectedStateVersion: args.expectedStateVersion,
  }, metadata);

  if (!result?.success) {
    return result;
  }

  const withTransferTotals = addTransferTotals({
    ...result,
    itineraryStartDate: result.itineraryStartDate,
    itineraryEndDate: result.itineraryEndDate,
  }, metadata);
  const {
    transferRequired: _transferRequired,
    pickupLocation: _pickupLocation,
    stateVersion: _stateVersion,
    idempotent: _idempotent,
    ...publicResult
  } = withTransferTotals;
  return publicResult;
}

export default createReservation;
