import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
export default function SocialAccounts({
  mode = 'link',
  onVerified
}) {
  const [providers, setProviders] = useState({}),
    [linked, setLinked] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  const controller = useRef(null);
  useEffect(() => {
    let active = true;
    Promise.all([api.get('/api/auth/social/providers'), api.get('/api/auth/social/identities')]).then(([p, l]) => {
      if (active) {
        setProviders(p);
        setLinked(l);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => () => controller.current?.abort(), []);
  async function start(provider) {
    const popup = window.open('about:blank', 'pinwork-social', 'width=520,height=720');
    if (!popup) {
      setError('브라우저에서 인증 팝업을 허용해 주세요.');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    let attempt,
      completed = false;
    try {
      attempt = await api.post(`/api/auth/social/${provider}/${mode}`, {});
      if (abort.signal.aborted) return;
      popup.location.href = attempt.authorizationUrl;
      const deadline = Date.now() + 300000;
      while (!abort.signal.aborted && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (abort.signal.aborted) return;
        const result = await api.post('/api/auth/social/poll', {
          flowId: attempt.flowId,
          pollToken: attempt.pollToken
        });
        if (result.pending) continue;
        if (result.error) throw Error(result.message || result.error);
        completed = true;
        if (mode === 'verify') onVerified?.(result.verificationToken);else setReload(v => v + 1);
        return;
      }
      if (!abort.signal.aborted) throw Error('인증 시간이 지났습니다. 다시 시도해 주세요.');
    } catch (e) {
      if (!abort.signal.aborted) setError(e.message);
    } finally {
      popup.close();
      if (attempt && !completed) api.post('/api/auth/social/cancel', {
        flowId: attempt.flowId,
        pollToken: attempt.pollToken
      }).catch(() => {});
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  return <div><div className="action-row">{['google', 'kakao'].filter(p => mode !== 'verify' || linked.includes(p)).map(p => <button type="button" className={`btn-secondary social-provider social-provider-${p}`} key={p} disabled={busy || !providers[p] || mode === 'link' && linked.includes(p)} onClick={() => start(p)}><span className="social-provider-mark" aria-hidden="true">{p === 'google' ? 'G' : 'K'}</span><span>{p === 'google' ? 'Google' : '카카오'}</span><span className="social-provider-status">{mode === 'verify' ? '본인 인증' : linked.includes(p) ? '연결됨' : '계정 연결'}</span></button>)}{busy && <button className="btn-secondary" type="button" onClick={() => controller.current?.abort()}>인증 취소</button>}</div>{error && <p role="alert" className="form-error">{error}</p>}</div>;
}
