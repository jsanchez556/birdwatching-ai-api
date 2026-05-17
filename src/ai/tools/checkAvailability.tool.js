import reservationService from '../../services/reservation.service.js';

export async function checkAvailability(args = {}) {
  return reservationService.checkTourAvailability(args);
}

export default checkAvailability;
