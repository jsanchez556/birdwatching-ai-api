import billingEventQueries from '../../db/queries/billingEvent.queries.js';
import subscriptionService from '../subscriptions/subscription.service.js';
import { normalizeProviderMappingName } from '../providerMapping.service.js';
import { resolveBillingProvider } from './checkout.service.js';

class WebhookService {
  async syncProviderSubscription(subscription = {}) {
    if (!subscription.providerSubscriptionId) {
      return null;
    }

    if (subscription.userId) {
      return subscriptionService.syncProviderSubscription({
        userId: subscription.userId,
        billingProvider: subscription.provider,
        providerCustomerId: subscription.providerCustomerId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerPriceId: subscription.providerPriceId,
        providerStatus: subscription.providerStatus,
        planName: subscription.planName,
        currentPeriodEnd: subscription.currentPeriodEnd,
      });
    }

    return subscriptionService.updateProviderSubscription({
      billingProvider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      providerStatus: subscription.providerStatus,
      providerPriceId: subscription.providerPriceId,
      planName: subscription.planName,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  }

  async handleWebhook({ providerName = null, payload, headers = {} }) {
    const provider = resolveBillingProvider(providerName);
    const event = await provider.normalizeWebhookEvent({ payload, headers });
    let recordedEvent = null;

    if (event?.providerEvent) {
      recordedEvent = await billingEventQueries.recordProviderEvent(event.providerEvent);

      if (
        recordedEvent
        && recordedEvent.inserted === false
        && recordedEvent.processedAt
      ) {
        return {
          received: true,
          duplicate: true,
          provider: normalizeProviderMappingName(provider.name),
        };
      }
    }

    if (event?.type === 'subscription_synced' || event?.type === 'subscription_changed') {
      await this.syncProviderSubscription(event.subscription);
    }

    if (event?.providerEvent) {
      await billingEventQueries.markProviderEventProcessed({
        provider: event.providerEvent.provider,
        providerEventId: event.providerEvent.providerEventId,
      });
    }

    return {
      received: true,
      provider: normalizeProviderMappingName(provider.name),
    };
  }
}

export { WebhookService };
export default new WebhookService();
