import reservationService from '../../services/reservation.service.js';

async function checkAvailability(args = {}) {
  return reservationService.checkTourAvailability(args);
}

export default checkAvailability;
