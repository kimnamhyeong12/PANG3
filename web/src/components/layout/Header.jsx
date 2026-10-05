import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useGroup } from '../../context/GroupContext.jsx';
import { IconBell, IconChevronDown, IconLogo } from '../Icons.jsx';

function GroupSwitcher() {
  const { groups, groupId, currentGroup, setGroupId } = useGroup();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const switchable = groups.length > 1;

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="group-switcher" ref={ref}>
      <button
        type="button"
        className="group-switcher-button"
        disabled={!switchable}
        onClick={() => setOpen((v) => !v)}
      >
        {currentGroup?.groupName ?? '그룹 없음'}
        {switchable && <IconChevronDown size={16} />}
      </button>
      {open && (
        <ul className="group-switcher-menu">
          {groups.map((g) => (
            <li key={g.groupId}>
              <button
                type="button"
                className={`group-switcher-item${g.groupId === groupId ? ' is-active' : ''}`}
                onClick={() => {
                  setGroupId(g.groupId);
                  setOpen(false);
                }}
              >
                <span>{g.groupName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Header() {
  const { user } = useAuth();
  // User 엔티티/로그인 응답에 부서 필드가 없어 근무 지역(workSido workSigungu)을 보조 정보로 표시
  const subText = [user?.workSido, user?.workSigungu].filter(Boolean).join(' ');

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <IconLogo size={18} />
        </div>
        <span className="header-title">사하구 외근도우미</span>
        <span className="badge badge-navy">관리자</span>
        <GroupSwitcher />
      </div>
      <div className="header-right">
        <button type="button" className="icon-button" aria-label="알림">
          <IconBell size={20} />
        </button>
        <div className="header-divider" />
        <div className="header-user">
          <div className="avatar">{user?.name?.[0] ?? '?'}</div>
          <div>
            <div className="header-user-name">{user?.name}</div>
            {subText && <div className="header-user-sub">{subText}</div>}
          </div>
        </div>
      </div>
    </header>
  );
}
