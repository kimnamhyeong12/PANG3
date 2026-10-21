import { Linking } from 'react-native';
import { API_BASE_URL } from './api';
import { apiFetch, session } from './auth';

const abortError = () => Object.assign(new Error('소셜 로그인을 취소했습니다.'), { name: 'AbortError' });
const pause = (signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(abortError()); return; }
  const cancel = () => { clearTimeout(timer); reject(abortError()); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1500);
  signal.addEventListener('abort', cancel, { once: true });
});
async function request(path, body, signal, authenticated = false) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 12000);
  try {
    const response = await (authenticated ? apiFetch : fetch)(`${API_BASE_URL}/api/auth/social/${path}`, {
      method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Client': 'native' }, body: JSON.stringify(body || {}),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.message || result.error || '소셜 로그인에 실패했습니다.');
    return result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export async function performSocialAuth(provider, mode, signal) {
  let attempt, completed = false;
  // Claim the attempt even if a user cancels immediately, so it can be invalidated.
  try {
    attempt = await request(`${provider}/${mode === 'login' ? 'start' : mode}`, {}, undefined, mode !== 'login');
    if (signal.aborted) throw abortError();
    await Linking.openURL(attempt.authorizationUrl);
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await pause(signal);
      const result = await request('poll', { flowId: attempt.flowId, pollToken: attempt.pollToken }, signal);
      if (result.pending) continue;
      if (signal.aborted) throw abortError();
      const accepted = mode === 'login' ? await session.loginWithSocialResult(result) : result;
      if (signal.aborted) {
        if (mode === 'login') await session.logout().catch(() => {});
        throw abortError();
      }
      completed = true;
      return accepted;
    }
    throw new Error('인증 시간이 지났습니다. 다시 시도해 주세요.');
  } finally {
    if (attempt && !completed) await request('cancel', { flowId: attempt.flowId, pollToken: attempt.pollToken }).catch(() => {});
  }
}
