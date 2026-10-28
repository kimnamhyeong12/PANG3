import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './ui';
import { colors } from '../constants/design';

const FAQ = [
  { id: 'location', category: '위치·길안내', question: '현재 위치가 나오지 않거나 정확하지 않아요.', answer: '휴대폰의 위치 기능을 켜고 앱의 위치 권한을 허용해 주세요. 실내나 지하에서는 위치가 부정확할 수 있어요. 실외에서 다시 확인하고, 계속 문제가 있으면 앱 정보 → 권한 설정에서 위치 권한을 확인해 주세요.' },
  { id: 'place', category: '방문지', question: '방문지는 어떻게 등록하나요?', answer: '방문지 등록 화면에서 주소나 장소를 검색한 뒤 위치를 확인해 등록해 주세요. 사진으로 등록할 때는 사진의 촬영 위치 정보와 사진 접근 권한이 필요할 수 있어요. 위치 정보가 없는 사진은 주소 검색으로 위치를 지정해 주세요.' },
  { id: 'navigation', category: '위치·길안내', question: '길안내가 시작되지 않아요.', answer: '네트워크 연결과 위치 권한을 확인하고 출발지·목적지가 올바른지 확인해 주세요. 외부 지도 앱으로 연결하는 경우 해당 앱이 설치되어 있는지도 확인해 주세요. 문제가 계속되면 이용한 이동 수단과 발생 상황을 문의에 적어 주세요.' },
  { id: 'report', category: '보고서', question: '보고서를 다운로드할 수 없어요.', answer: '먼저 보고서가 저장되어 있는지 확인해 주세요. 네트워크 연결과 휴대폰의 남은 저장 공간을 확인한 뒤 다시 시도해 주세요. Android에서는 내 파일 → Download → 외근도우미 → 다운로드 폴더를, iPhone에서는 공유 화면에서 선택한 저장 위치를 확인해 주세요.' },
  { id: 'photo', category: '사진', question: '사진을 촬영하거나 선택할 수 없어요.', answer: '앱 정보 → 권한 설정에서 카메라와 사진 권한을 확인해 주세요. 선택한 사진만 허용한 경우 사용할 사진을 추가로 선택해야 할 수 있어요. 사진 선택은 가능해도 촬영 위치를 읽으려면 추가 권한이 필요할 수 있어요.' },
  { id: 'notification', category: '계정·알림', question: '업무 알림이 오지 않아요.', answer: '설정의 업무 알림을 켜고 휴대폰 설정에서도 앱 알림을 허용해 주세요. 방해 금지 모드나 배터리 절약 설정에 따라 알림이 늦어질 수 있어요. 앱 정보 → 권한 설정에서 알림 허용 상태를 확인할 수 있어요.' },
  { id: 'account', category: '계정·알림', question: '계정 정보 변경이나 탈퇴는 어디에서 하나요?', answer: '설정 상단 프로필의 관리에서 본인 확인 후 계정 정보를 관리할 수 있어요. 계정 탈퇴는 설정 하단에서 진행할 수 있어요. 계정 이용에 문제가 있으면 문의하기로 상황을 알려 주세요. 비밀번호나 인증번호는 보내지 마세요.' },
];
const CATEGORIES = ['전체', ...new Set(FAQ.map(item => item.category))];

export default function CustomerSupportContent({ onInquiry }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('전체');
  const [expanded, setExpanded] = useState(null);
  const results = useMemo(() => FAQ.filter(item => (category === '전체' || category === item.category)
    && `${item.question} ${item.answer}`.toLowerCase().includes(query.trim().toLowerCase())), [query, category]);
  return <View style={styles.content}>
    <View><Text style={styles.title}>무엇을 도와드릴까요?</Text><Text style={styles.description}>궁금한 내용을 찾아보거나 문의를 남겨 주세요.</Text></View>
    <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.textSoft} /><TextInput accessibilityLabel="도움말 검색" placeholder="위치, 사진, 보고서 등을 검색하세요" placeholderTextColor={colors.textFaint} value={query} onChangeText={setQuery} style={styles.searchInput} returnKeyType="search" autoCorrect={false} />{!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery('')} style={styles.clear}><Ionicons name="close-circle" size={20} color={colors.textSoft} /></TouchableOpacity>}</View>
    <Text style={styles.heading}>자주 묻는 질문</Text>
    <View style={styles.categories}>{CATEGORIES.map(item => <TouchableOpacity key={item} accessibilityRole="button" accessibilityState={{ selected: category === item }} onPress={() => { setCategory(item); setExpanded(null); }} style={[styles.chip, category === item && styles.selectedChip]}><Text style={[styles.chipText, category === item && styles.selectedText]}>{item}</Text></TouchableOpacity>)}</View>
    <View>{results.map(item => <View key={item.id} style={styles.faq}><TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: expanded === item.id }} onPress={() => setExpanded(expanded === item.id ? null : item.id)} style={styles.question}><Text style={styles.q}>Q</Text><Text style={styles.questionText}>{item.question}</Text><Ionicons name={expanded === item.id ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft} /></TouchableOpacity>{expanded === item.id && <Text style={styles.answer}>{item.answer}</Text>}</View>)}{!results.length && <Text style={styles.empty}>검색 결과가 없어요. 다른 검색어를 입력하거나 아래 문의하기를 이용해 주세요.</Text>}</View>
    <View style={styles.contact}><Text style={styles.heading}>도움말로 해결되지 않았나요?</Text><Text style={styles.description}>문의를 남기시면 입력한 이메일로 답변을 보내드립니다.</Text><PrimaryButton title="문의하기" icon="create-outline" onPress={onInquiry} /></View>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 18 }, title: { color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 34 }, description: { color: colors.textSoft, fontSize: 13, lineHeight: 21, marginTop: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceMuted, borderRadius: 12, paddingLeft: 14, borderWidth: 1, borderColor: colors.line }, searchInput: { flex: 1, color: colors.text, fontSize: 13, minHeight: 50, paddingVertical: 12 }, clear: { padding: 12 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 13, minHeight: 42, justifyContent: 'center', borderRadius: 21, backgroundColor: colors.surfaceMuted }, selectedChip: { backgroundColor: colors.primary }, chipText: { color: colors.textSoft, fontSize: 13 }, selectedText: { color: '#FFF', fontWeight: '700' },
  faq: { borderBottomWidth: 1, borderBottomColor: colors.line }, question: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 16 }, q: { color: colors.primary, fontSize: 19, fontWeight: '800' }, questionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600' }, answer: { color: colors.textSoft, fontSize: 13, lineHeight: 23, paddingBottom: 18, paddingLeft: 25 }, empty: { color: colors.textSoft, paddingVertical: 20, lineHeight: 23 }, contact: { backgroundColor: colors.surfaceMuted, padding: 18, borderRadius: 16, gap: 10 },
});
