import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';
import { USER } from '../data/mockData';

const getStatusLabel = (status) => {
  if (status === 'complete') return '작업완료';
  if (status === 'working') return '작업중';
  return '미작업';
};

export default function ReportScreen({
  locations = [],
  onBack,
  onDownload,
}) {
  const complete = locations.filter((l) => l.status === 'complete').length;
  const working = locations.filter((l) => l.status === 'working').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AUTO REPORT</Text>
          <Text style={styles.title}>외근 보고서</Text>
          <Text style={styles.desc}>선택한 방문지 기반 자동 생성</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.reportPaper}>
          <Text style={styles.reportTitle}>사하구 외근 업무 결과 보고서</Text>

          <Text style={styles.line}>담당자: {USER.name} / {USER.team}</Text>
          <Text style={styles.line}>보고 대상 방문지: {locations.length}개</Text>
          <Text style={styles.line}>
            작업완료: {complete}개 / 작업중: {working}개
          </Text>

          <View style={styles.divider} />

          {locations.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>선택된 방문지가 없습니다.</Text>
            </View>
          ) : (
            locations.map((loc, idx) => (
              <View key={loc.id ?? idx} style={styles.item}>
                <Text style={styles.itemTitle}>
                  {idx + 1}. {loc.detailAddress || loc.roadAddress || '이름 없음'}
                </Text>

                <Text style={styles.itemText}>
                  주소: {loc.roadAddress || '주소 없음'}
                </Text>

                <Text style={styles.itemText}>
                  좌표: {loc.lat ?? loc.latitude ?? '-'}, {loc.lng ?? loc.longitude ?? '-'}
                </Text>

                <Text style={styles.itemText}>
                  작업유형: {loc.task || loc.taskCategory || '미지정'}
                </Text>

                <Text style={styles.itemText}>
                  처리상태: {getStatusLabel(loc.status)}
                </Text>
              </View>
            ))
          )}
        </View>

        <PrimaryButton title="보고서 다운로드 화면" onPress={onDownload} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },

  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
  },

  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  desc: {
    fontSize: 10,
    color: '#718096',
  },

  body: {
    padding: 16,
    gap: 16,
  },

  reportPaper: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  reportTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2D3D',
    marginBottom: 16,
    textAlign: 'center',
  },

  line: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 6,
  },

  divider: {
    height: 1,
    backgroundColor: '#E6EDF3',
    marginVertical: 14,
  },

  item: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
  },

  itemTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#12395B',
  },

  itemText: {
    fontSize: 11,
    color: '#607086',
    marginTop: 4,
  },

  emptyBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },

  emptyText: {
    fontSize: 12,
    color: '#718096',
    fontWeight: '800',
  },
});