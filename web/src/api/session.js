import { createSessionClient } from '../../../frontend/utils/sessionClient.js';

export const webSession = createSessionClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || window.location.origin,
  client: 'web', transport: window.fetch.bind(window),
  storage: { get: async () => null, set: async () => {}, remove: async () => {} },
  onExpired: () => window.dispatchEvent(new Event('pang3:session-expired')),
});
