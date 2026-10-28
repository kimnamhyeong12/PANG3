import React, { useRef, useState } from 'react';
import { Keyboard, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { PrimaryButton } from './ui';
import { showAlert } from './CustomAlert';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

const INQUIRY_TYPES = ['이용 방법', '오류 신고', '계정', '결제·환불', '기타'];
const EMAIL_DOMAINS = ['naver.com', 'gmail.com', 'daum.net', 'hanmail.net', 'nate.com', 'outlook.com', 'icloud.com'];
const PRIVACY_NOTICE_VERSION = 'support-2026-10-29-v1';
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024;
const splitEmail = value => {
  const address = String(value).trim();
  const at = address.lastIndexOf('@');
  return at < 0 ? { name: address, domain: '' } : { name: address.slice(0, at), domain: address.slice(at + 1) };
};

export default function SupportInquiryForm({ user, onSubmitted, onBusyChange }) {
  const initialEmail = splitEmail(user.email || '');
  const [emailName, setEmailName] = useState(initialEmail.name);
  const [emailDomain, setEmailDomain] = useState(initialEmail.domain);
  const [picker, setPicker] = useState(null);
  const [consent, setConsent] = useState(false);
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [choosingFiles, setChoosingFiles] = useState(false);
  const picking = useRef(false);
  const attachmentBytes = attachments.reduce((total, file) => total + file.size, 0);
  const replyEmail = `${emailName.trim()}@${emailDomain.trim()}`;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inquiryType, setInquiryType] = useState('이용 방법');
  const submitting = useRef(false);
  const request = useRef(null);
  const submit = async () => {
    if (submitting.current || picking.current) return;
    if (replyEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) { setError('답변 이메일 주소를 확인해 주세요.'); return; }
    if (!subject.trim() || !message.trim()) { setError('제목과 문의 내용을 입력해 주세요.'); return; }
    if (!consent) { setError('개인정보 수집·이용 안내를 확인하고 동의해 주세요.'); return; }
    submitting.current = true; setSending(true); onBusyChange?.(true); setError('');
    try {
      const fingerprint = JSON.stringify([replyEmail.trim(), subject.trim(), message.trim(), inquiryType, attachments.map(file => [file.uri, file.name, file.size])]);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      const payload = {
        replyEmail: replyEmail.trim(), subject: subject.trim(), message: message.trim(), category: inquiryType, requestKey: request.current.key,
        appVersion: Constants.expoConfig?.version || '', platform: Platform.OS,
        privacyConsent: true, privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      };
      let body = JSON.stringify(payload);
      if (attachments.length) {
        body = new FormData(); body.append('inquiry', JSON.stringify(payload));
        attachments.forEach(file => body.append('files', Platform.OS === 'web' ? file.file : { uri: file.uri, name: file.name, type: file.mimeType }));
      }
      const result = await groupApi('/api/support/inquiries', { method: 'POST', body });
      setSubject(''); setMessage(''); setConsent(false); setAttachments([]); request.current = null;
      showAlert('문의 접수 완료', '문의가 접수되었습니다. 문의 내역에서 답변을 확인해 주세요.');
      onSubmitted?.(result?.inquiryId);
    } catch (failure) {
      setError(failure.status === 404
        ? '문의 전송 기능을 준비 중입니다. 입력 내용은 유지되니 잠시 후 다시 시도해 주세요.'
        : failure.status === 503
          ? '현재 문의를 접수할 수 없습니다. 작성한 내용은 이 화면에 유지됩니다. 잠시 후 다시 시도해 주세요.'
          : (failure.message || '문의를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally { submitting.current = false; setSending(false); onBusyChange?.(false); }
  };
  const chooseFiles = async () => {
    if (picking.current || submitting.current) return;
    if (attachments.length >= 5) { setError('첨부파일은 최대 5개까지 등록할 수 있어요.'); return; }
    picking.current = true; setChoosingFiles(true); onBusyChange?.(true); setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/pdf'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const selected = (result.assets || []).map(file => ({ ...file, size: file.size ?? file.file?.size,
        mimeType: /\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg' }));
      const merged = [...attachments];
      for (const file of selected) {
        if (!/\.(jpe?g|png|pdf)$/i.test(file.name)) throw new Error('JPG, PNG, PDF 파일만 첨부할 수 있어요.');
        if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('크기를 확인할 수 없거나 비어 있는 파일은 첨부할 수 없어요.');
        if (file.size > MAX_SINGLE_FILE_BYTES) throw new Error('파일 하나는 최대 15MB까지 첨부할 수 있어요.');
        if (!merged.some(item => item.uri === file.uri || item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) merged.push(file);
      }
      if (merged.length > 5) throw new Error('첨부파일은 최대 5개까지 등록할 수 있어요.');
      if (merged.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_BYTES) throw new Error('첨부파일의 합계는 최대 30MB입니다.');
      setAttachments(merged);
    } catch (failure) { setError(failure.message || '파일을 선택하지 못했습니다. 다시 시도해 주세요.'); }
    finally { picking.current = false; setChoosingFiles(false); onBusyChange?.(false); }
  };
  const openPicker = kind => { if (!sending) { Keyboard.dismiss(); setPicker(current => current === kind ? null : kind); } };
  const changeEmailName = value => {
    if (!value.includes('@')) { setEmailName(value); return; }
    const parts = splitEmail(value);
    setEmailName(parts.name); setEmailDomain(parts.domain);
  };
  const choose = value => {
    if (picker === 'category') setInquiryType(value);
    else setEmailDomain(value);
    setPicker(null);
  };
  return <View style={styles.form}>
    <View style={styles.field}>
      <Text style={styles.label}>문의 유형 <Text style={styles.required}>*</Text></Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="문의 유형 선택" accessibilityState={{ expanded: picker === 'category', disabled: sending }} style={styles.select} disabled={sending} onPress={() => openPicker('category')}><Text style={styles.selectText}>{inquiryType}</Text><Ionicons name={picker === 'category' ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textSoft} /></TouchableOpacity>
      {picker === 'category' && <View accessibilityRole="radiogroup" accessibilityLabel="문의 유형 목록" style={styles.inlineOptions}>{INQUIRY_TYPES.map(value => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityLabel={value} accessibilityState={{ checked: inquiryType === value }} onPress={() => choose(value)} style={[styles.option, inquiryType === value && styles.selectedOption]}><Text style={[styles.optionText, inquiryType === value && styles.selectedText]}>{value}</Text>{inquiryType === value && <Ionicons name="checkmark" size={21} color={colors.primary} />}</TouchableOpacity>)}</View>}
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>답변 이메일 <Text style={styles.required}>*</Text></Text>
      <View style={styles.emailRow}>
        <TextInput accessibilityLabel="이메일 아이디" style={[styles.input, styles.emailPart]} value={emailName} onChangeText={changeEmailName}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!sending}
          placeholder="이메일 아이디" placeholderTextColor={colors.textFaint} />
        <Text style={styles.at}>@</Text>
        <View style={[styles.domainField, styles.emailPart]}>
          <TextInput accessibilityLabel="이메일 도메인 입력" style={styles.domainInput} value={emailDomain} onChangeText={setEmailDomain} onFocus={() => setPicker(null)}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={253} editable={!sending}
            placeholder="직접 입력" placeholderTextColor={colors.textFaint} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="이메일 도메인 선택" accessibilityState={{ expanded: picker === 'domain', disabled: sending }} style={styles.domainArrow} disabled={sending} onPress={() => openPicker('domain')}><Ionicons name="chevron-down" size={18} color={colors.textSoft} /></TouchableOpacity>
        </View>
      </View>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>문의 제목 <Text style={styles.required}>*</Text></Text>
      <View style={styles.titleInput}><TextInput accessibilityLabel="문의 제목" style={styles.titleText} value={subject} onChangeText={setSubject}
        maxLength={100} editable={!sending} placeholder="제목을 입력해 주세요." placeholderTextColor={colors.textFaint} /><Text style={styles.titleCounter}>{subject.length}/100</Text></View>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>문의 내용 <Text style={styles.required}>*</Text></Text>
      <TextInput accessibilityLabel="문의 내용" style={[styles.input, styles.message]} value={message} onChangeText={setMessage}
        multiline maxLength={4900} editable={!sending} placeholder={'아래 내용을 알려주시면 확인에 도움이 됩니다.\n\n· 문제가 발생한 화면\n· 문제 발생 일시\n· 발생 상황과 문의 내용'} placeholderTextColor={colors.textFaint} />
      <Text style={styles.counter}>{message.length}/4900</Text>
    </View>
    <View style={styles.field}>
      <Text style={styles.label}>파일 첨부</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="문의 파일 첨부" disabled={sending || choosingFiles || attachments.length >= 5} onPress={chooseFiles} style={styles.select}><Ionicons name="add" size={21} color={colors.primary} /><Text style={styles.selectText}>{choosingFiles ? '파일 선택 중…' : '파일 첨부'}</Text><Ionicons name="attach" size={21} color={colors.textSoft} /></TouchableOpacity>
      {attachments.map((file, index) => <View key={`${file.uri}-${index}`} style={styles.attachmentRow}><Ionicons name={file.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={20} color={colors.primary} /><View style={styles.attachmentName}><Text numberOfLines={2} style={styles.attachmentText}>{file.name}</Text><Text style={styles.attachmentSize}>{(file.size / 1024 / 1024).toFixed(1)}MB</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`첨부파일 삭제 ${file.name}`} disabled={sending || choosingFiles} onPress={() => setAttachments(current => current.filter((_, position) => position !== index))} style={styles.close}><Ionicons name="close" size={20} color={colors.textSoft} /></TouchableOpacity></View>)}
      <View style={styles.attachmentSummary}><Text style={styles.attachmentHint}>JPG·PNG·PDF 최대 5개{ '\n' }파일당 15MB, 합계 30MB</Text><Text style={styles.attachmentSize}>{(attachmentBytes / 1024 / 1024).toFixed(1)}MB / 30MB</Text></View>
    </View>
    <View style={styles.privacySection}>
      <View style={styles.consentRow}>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="개인정보 수집·이용 동의" accessibilityState={{ checked: consent, disabled: sending }} disabled={sending} onPress={() => setConsent(value => !value)} style={styles.consentButton}><Ionicons name={consent ? 'checkbox' : 'square-outline'} size={25} color={consent ? colors.primary : colors.textFaint} /><Text style={styles.consentText}>(필수) 개인정보 수집·이용 동의</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="개인정보 수집·이용 안내 전문보기" accessibilityState={{ expanded: noticeExpanded }} onPress={() => setNoticeExpanded(value => !value)} style={styles.noticeButton}><Text style={styles.noticeButtonText}>{noticeExpanded ? '접기' : '전문보기'}</Text></TouchableOpacity>
      </View>
      {noticeExpanded && <View style={styles.notice}>
        <Text style={styles.noticeTitle}>개인정보 수집·이용 안내</Text>
        <Text style={styles.noticeText}>핀워크는 문의 접수 및 처리를 위해 아래 정보를 수집·이용합니다.</Text>
        <View style={styles.noticeTable}>
          <View style={[styles.noticeTableRow, styles.noticeTableHead]}><Text style={styles.noticeCell}>수집 항목</Text><Text style={styles.noticeCell}>수집 목적</Text><Text style={[styles.noticeCell, styles.lastCell]}>보유 기간</Text></View>
          <View style={styles.noticeTableRow}><Text style={styles.noticeCell}>답변 이메일, 계정 식별정보, 문의 유형·제목·내용, 앱 버전·운영체제, 첨부파일(선택)</Text><Text style={styles.noticeCell}>문의 확인 및 처리, 답변 제공과 추가 연락</Text><Text style={[styles.noticeCell, styles.lastCell, styles.retention]}>문의 처리 완료일부터 최대 1년 보관 후 파기</Text></View>
        </View>
        <Text style={styles.noticeText}>보관 기간 전이라도 처리 목적을 달성하여 불필요해진 정보는 지체 없이 파기합니다. 다만 관계 법령에 따라 보존해야 하는 기록은 해당 법정 기간 동안 분리 보관합니다.</Text>
        <Text style={styles.noticeText}>동의를 거부할 수 있으며, 거부하시면 이 문의 접수 기능을 이용할 수 없습니다. 문의 처리에 필요하지 않은 개인정보는 입력하지 마세요.</Text>
      </View>}
    </View>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <PrimaryButton title={sending ? '접수 중…' : '문의 접수'} onPress={submit}
      disabled={sending || choosingFiles || !consent || !emailName.trim() || !emailDomain.trim() || !subject.trim() || !message.trim()} />
    <Modal visible={picker === 'domain'} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="선택창 닫기" onPress={() => setPicker(null)} />
        <View accessibilityViewIsModal style={styles.picker}>
          <View style={styles.pickerHeader}><Text style={styles.pickerTitle}>이메일 도메인 선택</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="선택 취소" onPress={() => setPicker(null)} style={styles.close}><Ionicons name="close" size={23} color={colors.textSoft} /></TouchableOpacity></View>
          <ScrollView keyboardShouldPersistTaps="handled">{[...new Set([...EMAIL_DOMAINS, ...(emailDomain ? [emailDomain] : [])])].map(value => {
            const selected = value === emailDomain;
            return <TouchableOpacity key={value} accessibilityRole="radio" accessibilityLabel={value} accessibilityState={{ selected }} onPress={() => choose(value)} style={[styles.option, selected && styles.selectedOption]}><Text style={[styles.optionText, selected && styles.selectedText]}>{value}</Text>{selected && <Ionicons name="checkmark" size={21} color={colors.primary} />}</TouchableOpacity>;
          })}</ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line }, attachmentName: { flex: 1 }, attachmentText: { color: colors.text, fontSize: 13, lineHeight: 20 }, attachmentSize: { color: colors.textSoft, fontSize: 11, lineHeight: 18 }, attachmentSummary: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, attachmentHint: { flex: 1, color: colors.textSoft, fontSize: 11, lineHeight: 18 },
  inlineOptions: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 5, marginTop: -5 },
  privacySection: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 16, gap: 16 }, consentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, consentButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48 }, consentText: { flex: 1, color: colors.textSoft, fontSize: 12, lineHeight: 19 }, noticeButton: { minHeight: 44, paddingLeft: 8, justifyContent: 'center' }, noticeButtonText: { color: colors.textSoft, fontSize: 12, textDecorationLine: 'underline', fontWeight: '700' },
  notice: { gap: 12 }, noticeTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, noticeText: { color: colors.textSoft, fontSize: 12, lineHeight: 20 }, noticeTable: { borderWidth: 1, borderColor: colors.line }, noticeTableRow: { flexDirection: 'row' }, noticeTableHead: { backgroundColor: colors.surfaceMuted, borderBottomWidth: 1, borderBottomColor: colors.line }, noticeCell: { flex: 1, fontSize: 11, lineHeight: 18, color: colors.textSoft, paddingHorizontal: 8, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.line }, lastCell: { borderRightWidth: 0 }, retention: { color: colors.text, fontWeight: '800' },
  form: { gap: 20 }, field: { gap: 10 }, label: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 }, required: { color: colors.danger },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 14, backgroundColor: colors.surface, color: colors.text, fontSize: 14 },
  select: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, selectText: { flex: 1, color: colors.text, fontSize: 14 }, placeholder: { color: colors.textSoft },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, emailPart: { flex: 1, minWidth: 0 }, at: { color: colors.textSoft, fontSize: 18 },
  domainField: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 10, flexDirection: 'row', alignItems: 'center' }, domainInput: { flex: 1, minWidth: 0, paddingLeft: 12, paddingRight: 0, paddingVertical: 14, color: colors.text, fontSize: 14 }, domainArrow: { width: 40, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
  titleInput: { minHeight: 52, borderWidth: 1, borderColor: colors.line, borderRadius: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }, titleText: { flex: 1, minWidth: 0, paddingVertical: 14, color: colors.text, fontSize: 14 }, titleCounter: { color: colors.textFaint, fontSize: 11 },
  message: { minHeight: 240, textAlignVertical: 'top', lineHeight: 23 },
  counter: { textAlign: 'right', color: colors.textSoft, fontSize: 11 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(16,40,91,0.38)' }, picker: { maxHeight: '75%', borderRadius: 18, padding: 12, backgroundColor: colors.surface }, pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 }, pickerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, option: { minHeight: 52, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, selectedOption: { backgroundColor: colors.primarySoft }, optionText: { flex: 1, color: colors.text, fontSize: 14 }, selectedText: { color: colors.primary, fontWeight: '700' },
});
