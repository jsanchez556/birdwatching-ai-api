import reservationService from '../../services/reservation.service.js';

async function checkAvailability(args = {}, metadata = {}) {
  return reservationService.checkTourAvailability(args, metadata);
}

export default checkAvailability;
