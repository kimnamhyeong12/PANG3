import React, { useRef, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { SecondaryButton } from './ui';
import { groupApi } from '../utils/groupApi';
import { showAlert } from './CustomAlert';
import { colors } from '../constants/design';
export default function GroupInviteLinkButton({ groupId, groupName }) {
  const [link, setLink] = useState(null), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const share = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const current = link && Date.parse(link.expiresAt) > Date.now() ? link : await groupApi(`/api/groups/${groupId}/invite-links`, { method: 'POST' });
      setLink(current);
      await Share.share({ title: '핀워크 그룹 초대', message: `${groupName || '핀워크 그룹'}에 초대합니다. 링크를 열고 로그인 후 참여해 주세요.\n${current.url}` });
    } catch (failure) { showAlert('초대 링크 공유 실패', failure.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const revoke = async () => {
    if (lock.current || !link) return; lock.current = true; setBusy(true);
    try { await groupApi(`/api/group-invite-links/${link.id}`, { method: 'DELETE' }); setLink(null); showAlert('초대 링크 중지', '이 링크로는 더 이상 참여할 수 없습니다.'); }
    catch (failure) { showAlert('링크 중지 실패', failure.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ gap: 8, marginTop: 12 }}><SecondaryButton title={busy ? '처리 중…' : '초대 링크 공유'} icon="share-social-outline" disabled={busy} onPress={share} /><Text style={{ color: colors.textSoft, fontSize: 12, lineHeight: 20 }}>링크를 가진 사람이 참여할 수 있어요. 유효기간 7일 · 최대 50명</Text>{link && <SecondaryButton title="이 초대 링크 중지" disabled={busy} onPress={revoke} />}</View>;
}
