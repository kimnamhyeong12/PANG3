import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import SupportInquiryForm from './SupportInquiryForm';
import { SecondaryButton } from './ui';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';
import { API_BASE_URL } from '../utils/api';
import { downloadProtectedFile } from '../utils/auth';

const date = value => value ? new Date(value).toLocaleString('ko-KR') : '';
export default function SupportInquiryPanel({ user, onBusyChange }) {
  const [tab, setTab] = useState('write');
  const [sending, setSending] = useState(false);
  const [rows, setRows] = useState([]), [page, setPage] = useState(0), [more, setMore] = useState(false);
  const [selected, setSelected] = useState(null), [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const opening = useRef(false);
  const [openingId, setOpeningId] = useState(null);
  const openAttachment = async file => {
    if (opening.current || !detail) return;
    opening.current = true; setOpeningId(file.id); setError('');
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error('이 기기에서는 첨부파일을 열 수 없습니다.');
      const name = file.name.replace(/[\\/:*?"<>|]/g, '_').slice(-160);
      const uri = await downloadProtectedFile(`${API_BASE_URL}/api/support/inquiries/${detail.id}/attachments/${file.id}`, name);
      await Sharing.shareAsync(uri, { mimeType: file.contentType, dialogTitle: '문의 첨부파일 열기' });
    } catch (failure) { setError(failure.message || '첨부파일을 열지 못했습니다. 다시 시도해 주세요.'); }
    finally { opening.current = false; setOpeningId(null); }
  };
  useEffect(() => {
    if (tab !== 'history') return undefined;
    let active = true;
    const id = ++request.current;
    setLoading(true); setError('');
    const path = selected ? `/api/support/inquiries/${selected}` : `/api/support/inquiries?page=${page}`;
    groupApi(path).then(result => {
      if (!active || id !== request.current) return;
      if (selected) setDetail(result);
      else { setRows(current => page === 0 ? result.items : [...current, ...result.items.filter(item => !current.some(row => row.id === item.id))]); setMore(result.hasMore); }
    }).catch(failure => {
      if (!active || id !== request.current) return;
      setError(failure.status === 404 ? '문의 내역을 불러올 수 없습니다. 서버 업데이트 후 다시 확인해 주세요.' : failure.message || '문의 내역을 불러오지 못했습니다.');
    }).finally(() => { if (active && id === request.current) setLoading(false); });
    return () => { active = false; };
  }, [tab, user.userId, selected, page, revision]);
  const refresh = () => { setPage(0); setRevision(value => value + 1); };
  const changeTab = next => { if (!sending) { setTab(next); setSelected(null); setDetail(null); setError(''); if (next === 'history') refresh(); } };
  return <View style={styles.content}>
    <View accessibilityRole="tablist" style={styles.tabs}>{[['write', '문의하기'], ['history', '문의 내역']].map(([key, title]) => <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key, disabled: sending }} disabled={sending} onPress={() => changeTab(key)} style={[styles.tab, tab === key && styles.activeTab]}><Text style={[styles.tabText, tab === key && styles.activeText]}>{title}</Text></TouchableOpacity>)}</View>
    <View style={tab !== 'write' && styles.hidden}><SupportInquiryForm user={user} onBusyChange={value => { setSending(value); onBusyChange?.(value); }} onSubmitted={() => { setTab('history'); setSelected(null); setDetail(null); refresh(); }} /></View>
    {tab === 'history' && <View style={styles.content}>
      <SecondaryButton title="새로고침" disabled={loading} onPress={refresh} />
      {selected && <SecondaryButton title="목록으로" onPress={() => { setSelected(null); setDetail(null); refresh(); }} />}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {loading && <Text accessibilityRole="progressbar" style={styles.description}>불러오는 중…</Text>}
      {selected && detail ? <View style={styles.content}><Text style={styles.heading}>{detail.subject}</Text><Text style={styles.description}>{detail.category} · {date(detail.createdAt)}</Text><Text style={styles.description}>답변 이메일: {detail.replyEmail}</Text><Text selectable style={styles.body}>{detail.message}</Text>{!!detail.attachments?.length && <View style={styles.content}><Text style={styles.heading}>첨부파일</Text>{detail.attachments.map(file => <TouchableOpacity key={file.id} accessibilityRole="button" accessibilityLabel={`첨부파일 열기 ${file.name}`} disabled={openingId !== null} style={styles.attachment} onPress={() => openAttachment(file)}><Ionicons name="attach" size={21} color={colors.primary} /><Text style={styles.attachmentName}>{openingId === file.id ? '파일을 여는 중…' : file.name}</Text><Text style={styles.description}>{(file.size / 1024 / 1024).toFixed(1)}MB</Text></TouchableOpacity>)}</View>}<View style={styles.answer}><Text style={styles.heading}>{detail.status === 'ANSWERED' ? '핀워크 고객센터 답변' : '답변 대기'}</Text>{detail.status === 'ANSWERED' ? <><Text style={styles.description}>{date(detail.answeredAt)}</Text><Text selectable style={styles.body}>{detail.answer}</Text></> : <Text style={styles.description}>문의가 접수되었습니다. 담당자가 확인 후 이곳에 답변을 남겨드립니다.</Text>}</View></View>
        : !selected && <>{rows.map(row => <TouchableOpacity key={row.id} accessibilityRole="button" onPress={() => { setDetail(null); setSelected(row.id); }} style={styles.inquiry}><View style={styles.row}><Text style={styles.category}>{row.category}</Text><Text style={[styles.badge, row.status === 'ANSWERED' && styles.answered]}>{row.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}</Text></View><Text style={styles.subject}>{row.subject}</Text><Text style={styles.description}>{date(row.createdAt)}</Text></TouchableOpacity>)}{!loading && !error && !rows.length && <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={44} color={colors.textFaint} /><Text style={styles.heading}>문의 내역이 없습니다.</Text><Text style={styles.description}>새로 접수한 문의부터 이곳에서 확인할 수 있어요.</Text></View>}{more && <TouchableOpacity disabled={loading} accessibilityRole="button" onPress={() => setPage(value => value + 1)} style={styles.action}><Text style={styles.actionText}>이전 문의 더 보기</Text></TouchableOpacity>}</>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  attachment: { minHeight: 52, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }, attachmentName: { flex: 1, color: colors.primary, fontSize: 13, lineHeight: 20 },
  content: { gap: 18 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: colors.primary }, tabText: { color: colors.textSoft, fontSize: 15 }, activeText: { color: colors.primary, fontWeight: '800' }, hidden: { display: 'none' }, action: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44 }, actionText: { color: colors.primary, fontSize: 13, fontWeight: '700' }, description: { color: colors.textSoft, fontSize: 12, lineHeight: 20, flexShrink: 1 }, heading: { color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 25 }, body: { color: colors.text, fontSize: 14, lineHeight: 24 }, answer: { padding: 18, borderRadius: 14, backgroundColor: colors.surfaceMuted, gap: 12 }, inquiry: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, category: { color: colors.textSoft, fontSize: 12 }, badge: { color: colors.warningInk, backgroundColor: colors.warningSoft, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, fontSize: 12, fontWeight: '700' }, answered: { color: colors.successInk, backgroundColor: colors.successSoft }, subject: { color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '700' }, empty: { alignItems: 'center', paddingVertical: 54, gap: 14 }, error: { color: colors.danger, lineHeight: 22 },
});
