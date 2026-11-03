import { useEffect, useRef, useState } from 'react';
import { liveSync } from './auth';
export default function useLiveRevision(topics, { dirty = false, onConflict } = {}) {
  const [revision, setRevision] = useState(0), key = topics.join(',');
  const pending=useRef(false), options=useRef({dirty,onConflict}); options.current={dirty,onConflict};
  // A predicate can protect native picker callbacks before React commits their next render.
  const isDirty=()=>typeof options.current.dirty==='function'?options.current.dirty():options.current.dirty;
  const blocked=isDirty();
  useEffect(()=>{if(!isDirty()&&pending.current){pending.current=false;setRevision(v=>v+1);}},[blocked]);
  useEffect(() => liveSync.subscribe(event => {
    if (!(event.topics || []).some(t => t === 'resync' || key.split(',').includes(t))) return;
    if(isDirty()){pending.current=true;if(!event.topics?.includes('resync'))options.current.onConflict?.();}else setRevision(v=>v+1);
  }), [key]);
  return revision;
}
