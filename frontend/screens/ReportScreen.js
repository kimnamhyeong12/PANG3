import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { BackButton, PrimaryButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';

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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgressRows();
  }, [locations]);

  const loadProgressRows = async () => {
    if (!API_BASE_URL || locations.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.all(
        locations.map(async (loc) => {
          const taskId = loc.id ?? loc.taskId;
          const res = await fetch(
            `${API_BASE_URL}/api/task-progress/task/${taskId}`
          );
          if (!res.ok) {
            return { loc, progress: null };
          }
          const progress = await res.json();
          return { loc, progress };
        })
      );
      setRows(results);
    } catch (error) {
      console.log(error);
      setRows(locations.map((loc) => ({ loc, progress: null })));
    } finally {
      setLoading(false);
    }
  };

  const complete = locations.filter((l) => l.status === 'complete').length;
  const working = locations.filter((l) => l.status === 'working').length;
  const firstWithReport = rows.find((r) => r.progress?.reportDownloadUrl);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>AUTO REPORT</Text>
          <Text style={styles.title}>외근 보고서</Text>
          <Text style={styles.desc}>task_progress + AI 생성 결과</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.reportPaper}>
          <Text style={styles.reportTitle}>사하구 외근 업무 결과 보고서</Text>
          <Text style={styles.line}>보고 대상 방문지: {locations.length}개</Text>
          <Text style={styles.line}>
            작업완료: {complete}개 / 작업중: {working}개
          </Text>

          <View style={styles.divider} />

          {loading ? (
            <ActivityIndicator size="large" color="#12395B" />
          ) : rows.length === 0 ? (
            <Text style={styles.emptyText}>선택된 방문지가 없습니다.</Text>
          ) : (
            rows.map(({ loc, progress }, idx) => (
              <View key={loc.id ?? idx} style={styles.item}>
                <Text style={styles.itemTitle}>
                  {idx + 1}. {loc.detailAddress || loc.roadAddress || '이름 없음'}
                </Text>
                <Text style={styles.itemText}>
                  업무: {loc.task || loc.taskCategory || '미지정'}
                </Text>
                <Text style={styles.itemText}>
                  상태: {getStatusLabel(loc.status)}
                </Text>
                <Text style={styles.itemText}>
                  메인 코멘트: {progress?.mainComment || '(없음)'}
                </Text>
                <Text style={styles.itemText}>
                  AI 분석: {progress?.aiRefinedContent ? '생성 완료' : '미생성'}
                </Text>
                {progress?.aiRefinedContent ? (
                  <Text style={styles.aiSnippet}>{progress.aiRefinedContent}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <PrimaryButton
          title="보고서 파일 다운로드"
          onPress={() =>
            onDownload?.({
              progressId: firstWithReport?.progress?.progressId,
              reportDownloadUrl: firstWithReport?.progress?.reportDownloadUrl,
            })
          }
        />
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
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 16, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096' },
  body: { padding: 16, gap: 16 },
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
  line: { fontSize: 12, color: '#334155', marginBottom: 6 },
  divider: { height: 1, backgroundColor: '#E6EDF3', marginVertical: 14 },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F6' },
  itemTitle: { fontSize: 13, fontWeight: '900', color: '#12395B' },
  itemText: { fontSize: 11, color: '#607086', marginTop: 4 },
  aiSnippet: { fontSize: 11, color: '#334155', marginTop: 8, lineHeight: 18 },
  emptyText: { fontSize: 12, color: '#718096', textAlign: 'center' },
});
