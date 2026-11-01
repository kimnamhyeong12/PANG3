// Shared native/web transport. Only committed identifiers arrive on this channel.
// Timers reconnect a broken connection; they never poll application data.
export function createChangeSync({ request, onState = () => {}, delay = ms => new Promise(r => setTimeout(r, ms)), idleTimeoutMs = 65_000 }) {
  const listeners = new Set(), taskLists = new Map(), seen = new Set();
  let running = false, paused = false, generation = 0, accountEpoch = 0, controller, recovery, recoveryAttempts = 0, recoveryAt = 0, queue = Promise.resolve();
  const notify = event => { for (const listener of listeners) { try { listener(event); } catch {} } };
  const json = async (path, options) => {
    const response = await request(path, options);
    if (!response.ok) { const error = Error(`동기화 요청 실패 (${response.status})`); error.status = response.status; throw error; }
    return response.json();
  };
  const keyFor = (group, owner) => `${group}:${owner || 'all'}`;
  function merge(entry, items, removed = []) {
    if (!entry.rows) { if (entry.promise) entry.invalid = true; return; }
    const rows = new Map(entry.rows.map(row => [String(row.taskId ?? row.id), row]));
    removed.forEach(id => rows.delete(String(id)));
    for (const row of items) {
      const id = String(row.taskId ?? row.id);
      if (entry.owner && Number(row.assigneeUserId) !== Number(entry.owner)) rows.delete(id);
      else rows.set(id, { ...rows.get(id), ...row });
    }
    entry.rows = [...rows.values()];
  }
  async function apply(event, version) {
    if (event.id && seen.has(event.id)) return;
    if (event.id) { seen.add(event.id); if (seen.size > 512) seen.delete(seen.values().next().value); }
    const topics = event.topics || [];
    if (topics.includes('resync')) { taskLists.clear(); notify(event); return; }
    if (topics.includes('tasks')) {
      const groups = [...new Set([...taskLists.values()].map(e => e.group))].filter(id => !event.groups?.length || event.groups.map(Number).includes(Number(id)));
      if (event.resetTasks || !event.taskIds?.length) {
        for (const [key, entry] of taskLists) if (groups.includes(entry.group)) taskLists.delete(key);
      } else {
        for (const group of groups) {
          try {
            const delta = await json(`/api/sync/tasks?groupId=${group}&ids=${event.taskIds.join(',')}`, { signal: controller?.signal });
            if (version !== generation) return;
            for (const entry of taskLists.values()) if (entry.group === group) {
              // A snapshot already in flight is reconciled again before being consumed.
              if (entry.promise) { entry.invalid = true; continue; }
              merge(entry, delta.items || [], delta.removedIds || []);
            }
          } catch (e) {
            if (version !== generation) return;
            for (const [key, entry] of taskLists) if (entry.group === group) taskLists.delete(key);
            if (e.status !== 403 && e.status !== 404) throw e;
          }
        }
      }
    }
    if (version === generation) notify(event);
  }
  const receive = event => {
    const version = generation;
    const job = queue.catch(() => {}).then(() => version === generation ? apply(event, version) : undefined);
    queue = job;
    return job;
  };
  async function connect(version) {
    let failures = 0;
    while (running && !paused && version === generation) {
      controller = new AbortController();
      const attempt = controller;
      let watchdog = setTimeout(() => attempt.abort(), 20_000);
      try {
        const response = await request('/api/sync/events', { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream') || !response.body?.getReader) throw Error('변경 알림 연결 실패');
        const reader = response.body.getReader(); let buffer = ''; failures = 0; onState('connected');
        clearTimeout(watchdog); watchdog = setTimeout(() => attempt.abort(), idleTimeoutMs);
        try {
          while (running && !paused && version === generation) {
            const { done, value } = await reader.read(); if (done) break;
            clearTimeout(watchdog); watchdog = setTimeout(() => attempt.abort(), idleTimeoutMs);
            // Payload is ASCII: topic names, UUIDs, numeric IDs; no user-entered text.
            for (const byte of value) buffer += String.fromCharCode(byte);
            buffer = buffer.replace(/\r\n/g, '\n');
            let end;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
              if (data) await receive(JSON.parse(data));
            }
            if (buffer.length > 128_000) throw Error('변경 알림 데이터가 너무 큽니다.');
          }
        } finally { await reader.cancel().catch(() => {}); }
      } catch (error) { if (version === generation && running && !paused) onState('reconnecting'); }
      finally { clearTimeout(watchdog); }
      if (running && !paused && version === generation) {
        onState('reconnecting');
        await delay(Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)));
      }
    }
  }
  function restart() { controller?.abort(); recovery = null; queue = Promise.resolve(); const version = ++generation; if (running && !paused) void connect(version); }
  function recover() {
    if (!running || paused || recovery) return;
    const now = Date.now(); if (now - recoveryAt > 60_000) recoveryAttempts = 0;
    recoveryAt = now; controller?.abort(); queue = Promise.resolve(); const version = ++generation;
    onState('reconnecting');
    recovery = delay(Math.min(30_000, 1000 * 2 ** Math.min(recoveryAttempts++, 5))).then(() => {
      if (version !== generation) return;
      recovery = null; if (running && !paused) void connect(version);
    });
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { if (running) return; running = true; restart(); },
    stop() { running = false; paused = false; accountEpoch++; restart(); taskLists.clear(); seen.clear(); },
    pause() { if (!paused) { paused = true; restart(); } },
    resume() { if (paused) { paused = false; restart(); } },
    receive,
    recover,
    async tasks(group, owner, load) {
      const key = keyFor(group, owner); let entry = taskLists.get(key);
      if (entry?.rows && !entry.invalid) return entry.rows;
      if (entry?.promise) return entry.promise;
      entry = { group, owner }; taskLists.set(key, entry);
      const epoch = accountEpoch;
      entry.promise = (async () => {
        const rows = await load();
        if (epoch !== accountEpoch) throw new Error('로그인 계정이 변경되었습니다.');
        if (taskLists.get(key) !== entry || entry.invalid) { if (taskLists.get(key) === entry) taskLists.delete(key); return this.tasks(group, owner, load); }
        entry.rows = rows; entry.promise = null; return rows;
      })().catch(error => {
        if (taskLists.get(key) === entry) taskLists.delete(key);
        if (epoch === accountEpoch && (!error.status || error.status >= 500)) recover();
        throw error;
      });
      return entry.promise;
    },
    noteMutation(method, path, data) {
      const route = path.split('?')[0];
      if (method === 'DELETE' && /^\/api\/locations\/\d+$/.test(route)) {
        for (const entry of taskLists.values()) merge(entry, [], [route.split('/').pop()]);
      } else if (data?.taskId && (/^\/api\/locations(?:\/\d+(?:\/[^/]+)?)?$/.test(route))) {
        for (const entry of taskLists.values()) if (!data.groupId || Number(data.groupId) === Number(entry.group)) merge(entry, [data]);
      } else if (data?.taskId && route.startsWith('/api/task-progress')) {
        for (const entry of taskLists.values()) {
          const old = entry.rows?.find(row => String(row.taskId ?? row.id) === String(data.taskId));
          if (old) merge(entry, [{ ...old, status: data.taskStatus ?? old.status, lat: data.taskLatitude ?? old.lat, lng: data.taskLongitude ?? old.lng, reportName: data.reportName ?? old.reportName }]);
        }
      }
    },
  };
}
