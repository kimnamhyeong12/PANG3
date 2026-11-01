import { SUPPORT_FAQ as FAQ } from '../constants/support';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './ui';
import { colors } from '../constants/design';



export default function CustomerSupportContent({ onInquiry }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const results = useMemo(() => FAQ.filter(item => `${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return <View style={styles.content}>
    <Text style={styles.title}>무엇을 도와드릴까요?</Text>
    <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.textSoft} /><TextInput accessibilityLabel="도움말 검색" placeholder="위치, 사진, 보고서 등을 검색하세요" placeholderTextColor={colors.textFaint} value={query} onChangeText={setQuery} style={styles.searchInput} returnKeyType="search" autoCorrect={false} />{!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')} style={styles.clear}><Ionicons name="close-circle" size={20} color={colors.textSoft} /></TouchableOpacity>}</View>
    <Text style={styles.heading}>자주 묻는 질문</Text>
    <View>{results.map(item => <View key={item.id} style={styles.faq}><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded(expanded === item.id ? null : item.id)} style={styles.question}><Text style={styles.q}>Q</Text><Text style={styles.questionText}>{item.question}</Text><Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} /></TouchableOpacity>{expanded === item.id && <Text style={styles.answer}>{item.answer}</Text>}</View>)}{!results.length && <Text style={styles.empty}>검색 결과가 없어요. 다른 검색어를 입력하거나 아래 문의하기를 이용해 주세요.</Text>}</View>
    <View style={styles.contact}><Text style={styles.heading}>도움말로 해결되지 않았나요?</Text><Text style={styles.description}>문의를 남기시면 문의 내역에서 답변을 확인할 수 있어요.</Text><PrimaryButton title="문의하기" icon="create-outline" onPress={onInquiry} /></View>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 18 }, title: { color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 34 }, description: { color: colors.textSoft, fontSize: 13, lineHeight: 21, marginTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceMuted, borderRadius: 12, paddingLeft: 14, borderWidth: 1, borderColor: colors.line }, searchInput: { flex: 1, color: colors.text, fontSize: 13, minHeight: 50, paddingVertical: 12 }, clear: { padding: 12 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  faq: { borderBottomWidth: 1, borderBottomColor: colors.line }, question: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 16 }, q: { color: colors.primary, fontSize: 19, fontWeight: '800' }, questionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' }, answer: { color: colors.textSoft, fontSize: 13, lineHeight: 23, paddingBottom: 18, paddingLeft: 25 }, empty: { color: colors.textSoft, paddingVertical: 20, lineHeight: 23 }, contact: { backgroundColor: colors.surfaceMuted, padding: 18, borderRadius: 16, gap: 10 },
});
