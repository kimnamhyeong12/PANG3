import { useEffect, useRef, useState } from 'react';
import { liveSync } from '../lib/liveSync.js';
// Re-run data-loading effects; forms can defer updates while a draft is dirty.
export default function useLiveRevision(topics, { dirty = false, onConflict } = {}) {
  const [revision, setRevision] = useState(0), key = topics.join(',');
  const pending = useRef(false), options = useRef({ dirty, onConflict });
  options.current = { dirty, onConflict };
  useEffect(() => {
    if (!dirty && pending.current) { pending.current = false; setRevision(v => v + 1); }
  }, [dirty]);
  useEffect(() => liveSync.subscribe(event => {
    if (!(event.topics || []).some(t => t === 'resync' || key.split(',').includes(t))) return;
    if (options.current.dirty) { pending.current = true; if (!event.topics?.includes('resync')) options.current.onConflict?.(); }
    else setRevision(v => v + 1);
  }), [key]);
  return revision;
}
