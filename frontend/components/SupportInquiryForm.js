import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { PrimaryButton } from './ui';
import { showAlert } from './CustomAlert';
import { groupApi } from '../utils/groupApi';
import { colors } from '../constants/design';

const INQUIRY_TYPES = ['이용 방법', '오류 신고', '계정', '결제·환불', '기타'];

export default function SupportInquiryForm({ user, onSubmitted, onBusyChange }) {
  const [replyEmail, setReplyEmail] = useState(user.email || '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [inquiryType, setInquiryType] = useState('이용 방법');
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail.trim())) { setError('답변받을 이메일 주소를 확인해 주세요.'); return; }
    if (!subject.trim() || !message.trim()) { setError('제목과 문의 내용을 입력해 주세요.'); return; }
    submitting.current = true; setSending(true); onBusyChange?.(true); setError('');
    try {
      await groupApi('/api/support/inquiries', { method: 'POST', body: JSON.stringify({
        replyEmail: replyEmail.trim(), subject: subject.trim(), message: `[문의 유형: ${inquiryType}]\n\n${message.trim()}`,
        appVersion: Constants.expoConfig?.version || '', platform: Platform.OS,
      }) });
      showAlert('문의 전송 완료', '문의가 전송되었습니다. 답변은 입력한 이메일에서 확인해 주세요.');
      onSubmitted?.();
    } catch (failure) {
      setError(failure.status === 404
        ? '문의 전송 기능을 준비 중입니다. 입력 내용은 유지되니 잠시 후 다시 시도해 주세요.'
        : failure.status === 503
          ? '현재 고객센터 메일 전송 서비스를 이용할 수 없습니다. 작성한 내용은 이 화면에 유지됩니다. 잠시 후 다시 시도해 주세요.'
          : (failure.message || '문의를 전송하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally { submitting.current = false; setSending(false); onBusyChange?.(false); }
  };
  return <View style={styles.form}>
    <Text style={styles.guide}>답변은 입력한 이메일로 보내드립니다. 이메일 주소를 정확하게 입력해 주세요.</Text>
    <Text style={styles.label}>문의 유형</Text>
    <View style={styles.types}>{INQUIRY_TYPES.map(type => <TouchableOpacity key={type} accessibilityRole="button" accessibilityLabel={`문의 유형 ${type}`} accessibilityState={{ selected: inquiryType === type }} disabled={sending} onPress={() => setInquiryType(type)} style={[styles.type, inquiryType === type && styles.selectedType]}><Text style={[styles.typeText, inquiryType === type && styles.selectedTypeText]}>{type}</Text></TouchableOpacity>)}</View>
    <Text style={styles.label}>답변받을 이메일</Text>
    <TextInput accessibilityLabel="답변받을 이메일" style={styles.input} value={replyEmail} onChangeText={setReplyEmail}
      keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!sending}
      placeholder="이메일 주소를 입력하세요" placeholderTextColor={colors.textFaint} />
    <Text style={styles.label}>제목</Text>
    <TextInput accessibilityLabel="문의 제목" style={styles.input} value={subject} onChangeText={setSubject}
      maxLength={100} editable={!sending} placeholder="제목을 입력하세요" placeholderTextColor={colors.textFaint} />
    <Text style={styles.label}>문의 내용</Text>
    <TextInput accessibilityLabel="문의 내용" style={[styles.input, styles.message]} value={message} onChangeText={setMessage}
      multiline maxLength={4900} editable={!sending} placeholder="문제가 발생한 화면, 상황, 발생 시점을 알려 주세요." placeholderTextColor={colors.textFaint} />
    <Text style={styles.counter}>{message.length}/4900</Text>
    <Text style={styles.guide}>앱 버전과 운영체제 정보가 함께 전달됩니다. 비밀번호·인증번호·주민등록번호 등 민감한 정보는 입력하지 마세요.</Text>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <PrimaryButton title={sending ? '보내는 중…' : '문의 보내기'} onPress={submit}
      disabled={sending || !replyEmail.trim() || !subject.trim() || !message.trim()} />
  </View>;
}
const styles = StyleSheet.create({
  guide: { color: colors.textSoft, fontSize: 13, lineHeight: 21 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, type: { minHeight: 42, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceMuted }, selectedType: { backgroundColor: colors.primary }, typeText: { color: colors.textSoft, fontSize: 13 }, selectedTypeText: { color: '#FFFFFF', fontWeight: '700' },
  form: { gap: 10 }, label: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 6 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 14 },
  message: { minHeight: 190, textAlignVertical: 'top' },
  counter: { textAlign: 'right', color: colors.textSoft, fontSize: 11 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
});
