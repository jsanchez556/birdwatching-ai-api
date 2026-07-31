import reservationService from '../../services/reservation.service.js';

function addTransportationTotals(result = {}, metadata = {}) {
  const selectedTransportation = metadata.selectedTransportation;
  const transportationPrice = Number(selectedTransportation?.totalPrice);
  const pickupMatches = !result.pickupLocation
    || (typeof selectedTransportation?.origin === 'string'
      && selectedTransportation.origin.trim().toLowerCase() === result.pickupLocation.trim().toLowerCase());

  if (result.transportationRequired !== true || !pickupMatches || !Number.isFinite(transportationPrice)) {
    return result;
  }

  return {
    ...result,
    tourTotalPrice: result.tourTotalPrice ?? result.totalPrice,
    transportationPrice,
    grandTotalPrice: result.totalPrice + transportationPrice,
  };
}

export async function createReservation(args = {}, metadata = {}) {
  const result = await reservationService.createReservationFromState({
    expectedStateVersion: args.expectedStateVersion,
  }, metadata);

  if (!result?.success) {
    return result;
  }

  const withTransportationTotals = addTransportationTotals({
    ...result,
    itineraryStartDate: result.itineraryStartDate,
    itineraryEndDate: result.itineraryEndDate,
  }, metadata);
  const {
    transportationRequired: _transportationRequired,
    pickupLocation: _pickupLocation,
    stateVersion: _stateVersion,
    idempotent: _idempotent,
    ...publicResult
  } = withTransportationTotals;
  return publicResult;
}

export default createReservation;
