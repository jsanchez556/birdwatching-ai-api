import reservationService from '../../services/reservation.service.js';

function addTransportationTotals(result = {}, metadata = {}) {
  const selectedTransportation = metadata.selectedTransportation;
  const transportationPrice = Number(selectedTransportation?.totalPrice);

  if (!Number.isFinite(transportationPrice)) {
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
  const result = await reservationService.createReservation(args, metadata);

  if (!result?.success) {
    return result;
  }

  return addTransportationTotals({
    ...result,
    itineraryStartDate: args.itineraryStartDate || metadata.customerContext?.itineraryStartDate,
    itineraryEndDate: args.itineraryEndDate || metadata.customerContext?.itineraryEndDate,
  }, metadata);
}

export default createReservation;
