import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isServerDown } from '../api/client.js';
import { IconLogo } from '../components/Icons.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '';
  const destination = from === '/admin/support' || from === '/admin' ? '/admin/support' : from === '/admin/facilities' || /^\/join\/[A-Za-z0-9_-]{43}$/.test(from) ? from : '/dashboard';
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={destination} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(loginId.trim(), password);
      navigate(destination, { replace: true });
    } catch (err) {
      // 백엔드가 없는 아이디에 500을 주는 경우가 있어 400/500 모두 로그인 실패로 취급
      if (isServerDown(err)) {
        setError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
      } else {
        console.error('[login] 로그인 실패', err.status, err.data ?? err.message);
        setError('아이디 또는 비밀번호를 확인해주세요.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="full-center">
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <div className="header-logo">
            <IconLogo size={18} />
          </div>
          <span className="header-title">외근도우미</span>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="field">
          <label htmlFor="loginId">아이디</label>
          <input
            id="loginId"
            className="input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </button>
        <Link to="/forgot-password">비밀번호 찾기</Link>
      </form>
    </div>
  );
}
