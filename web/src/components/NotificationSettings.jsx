import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
export default function NotificationSettings() {
  const [value, setValue] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get('/api/notifications/preferences').then(p => {
      if (active) setValue(p);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, []);
  return <><h2>알림</h2>{error && <p className="form-error" role="alert">{error}</p>}{value && [['taskAlerts', '업무 알림 받기'], ['teamAlerts', '팀 알림 받기'], ['activityAlerts', '팀원 활동 알림']].map(([key, label]) => <label className="check-row" key={key}><input type="checkbox" checked={value[key]} disabled={busy} onChange={async e => {
        setBusy(true);
        setError('');
        try {
          setValue(await api.patch('/api/notifications/preferences', {
            [key]: e.target.checked
          }));
        } catch (e) {
          setError(e.message);
        } finally {
          setBusy(false);
        }
      }} />{label}</label>)}<button className="btn-secondary section-gap" onClick={async () => {
      if (!('Notification' in window)) {
        setError('이 브라우저는 알림을 지원하지 않습니다.');
        return;
      }
      const permission = await Notification.requestPermission();
      setError(permission === 'granted' ? '브라우저 알림을 허용했습니다.' : '브라우저 설정에서 알림 권한을 확인해 주세요.');
    }}>이 브라우저 알림 권한</button></>;
}
