import stripeBillingProvider from './billing/stripe.provider.js';

const providers = new Map([
  [stripeBillingProvider.name, stripeBillingProvider],
]);

function getBillingProvider(name) {
  return providers.get(name) || null;
}

function listBillingProviders() {
  return [...providers.values()];
}

export {
  getBillingProvider,
  listBillingProviders,
};
