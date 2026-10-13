import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, ScreenHeader } from '../components/ui';
import { API_BASE_URL, resolveApiUrl } from '../utils/api';
import { colors, radius } from '../constants/design';
import { restorePhotos } from '../utils/reportPhotos';
import { canDownloadReport } from '../utils/reportAvailability';

const statusLabel = (status) => status === 'complete' ? '작업 후' : status === 'working' ? '작업 중' : '작업 전';
export default function ReportScreen({ locations = [], onBack, onDownload }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all(locations.map(async (loc) => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/task-progress/task/${loc.id ?? loc.taskId}`);
        if (!response.ok) throw new Error();
        const text = await response.text();
        return { loc, progress: text.trim() ? JSON.parse(text) : null };
      } catch { return { loc, progress: null, error: true }; }
    })).then((result) => { if (active) setRows(result); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locations, reload]);
  const available = rows.filter((row) => row.progress?.progressId);
  const downloadable = available.filter((row) => canDownloadReport(row.progress));
  return <View style={styles.container}>
    <ScreenHeader title="선택한 보고서 확인" onBack={onBack} />
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>선택 {locations.length}건 · 저장된 보고서 {available.length}건</Text>
      <Text style={styles.meta}>내용을 확인한 뒤 개별 파일 또는 선택한 보고서를 모은 HWPX를 열 수 있습니다.</Text>
      {loading ? <ActivityIndicator color={colors.primary} /> : rows.map(({ loc, progress, error }, index) => <View key={loc.id ?? loc.taskId ?? index} style={styles.card}>
        <Text style={styles.title}>{loc.detailAddress || loc.roadAddress || '방문지'}</Text>
        <Text style={styles.meta}>{statusLabel(progress?.progressStatus || loc.status)} · {String(progress?.createdAt || '').slice(0, 10)}</Text>
        {!progress ? <Text style={styles.meta}>{error ? '조회하지 못했습니다. 다시 불러와 주세요.' : '저장된 보고서가 없습니다.'}</Text> : <>
          {!!progress.fieldMemo && <Text style={styles.memo}>{progress.fieldMemo}</Text>}
          {!!progress.mainComment && <Text style={styles.memo}>{progress.mainComment}</Text>}
          {restorePhotos(progress.fieldPhotos, resolveApiUrl).filter((photo) => photo.uri).map((photo) => <View key={photo.type} style={{ gap: 6 }}>
            <Text style={styles.meta}>{photo.label}</Text>
            <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="contain" />
            {!!photo.comment && <Text style={styles.memo}>{photo.comment}</Text>}
          </View>)}
          <PrimaryButton title="이 보고서 HWPX 열기" icon="document-text-outline" disabled={!canDownloadReport(progress)} onPress={() => {
            if (canDownloadReport(progress)) onDownload?.({ progressId: progress.progressId });
          }} />
          {!canDownloadReport(progress) && <Text style={styles.meta}>작업 전 보고서는 다운로드할 수 없습니다.</Text>}
        </>}
      </View>)}
      {!loading && !rows.length && <Text style={styles.meta}>선택한 방문지가 없습니다.</Text>}
      {!loading && rows.some((row) => row.error) && <PrimaryButton title="다시 불러오기" onPress={() => setReload((value) => value + 1)} />}
      {!loading && available.length > 0 && <PrimaryButton
        title={`선택 ${locations.length}건 모아 HWPX 만들기`} icon="download-outline"
        disabled={downloadable.length !== locations.length}
        onPress={() => {
          if (downloadable.length === locations.length) onDownload?.({ progressIds: downloadable.map((row) => row.progress.progressId) });
        }} />}
      {!loading && downloadable.length < available.length && <Text style={styles.meta}>작업 전 보고서를 제외하고 선택해야 통합 파일을 만들 수 있습니다.</Text>}
      {!loading && available.length < locations.length && <Text style={styles.meta}>선택한 모든 방문지의 기록이 저장·조회되어야 통합 파일을 만들 수 있습니다.</Text>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, body: { padding: 20, gap: 14, paddingBottom: 34 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.large, padding: 16, gap: 10 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' }, meta: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  memo: { color: colors.text, fontSize: 13, lineHeight: 20 }, photo: { width: '100%', height: 200, backgroundColor: colors.surfaceMuted } });
