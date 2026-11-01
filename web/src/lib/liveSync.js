import { createChangeSync } from '../../../frontend/utils/changeSync.js';
import { webSession } from '../api/session.js';
const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
export const liveSync = createChangeSync({
  request: (path, options) => webSession.fetch(new URL(path, base), options),
  onState: state => window.dispatchEvent(new CustomEvent('pang3:sync-state', { detail: state })),
});
