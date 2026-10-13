import React, { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { API_BASE_URL, resolveApiUrl } from '../utils/api';
import { colors, radius } from '../constants/design';

export default function DownloadScreen({ onBack, downloadInfo }) {
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => () => { mounted.current = false; }, []);
  const count = downloadInfo?.progressIds?.length || 1;
  const canOpen = !!downloadInfo?.userId && (!!downloadInfo?.progressId || !!downloadInfo?.progressIds?.length);
  const open = async () => {
    if (busy.current || !canOpen) return;
    busy.current = true; setPreparing(true); setError('');
    try {
      const combined = !!downloadInfo.progressIds;
      const response = await fetch(combined ? `${API_BASE_URL}/api/task-progress/reports/prepare` :
        `${API_BASE_URL}/api/task-progress/${downloadInfo.progressId}/report/prepare?userId=${downloadInfo.userId}`, {
        method: 'POST', ...(combined ? { headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progressIds: downloadInfo.progressIds, userId: downloadInfo.userId }) } : {}),
      });
      if (!response.ok) throw new Error('보고서 파일을 만들지 못했습니다. 다시 시도해 주세요.');
      const result = await response.json();
      const url = resolveApiUrl(result.reportDownloadUrl);
      if (!url) throw new Error('보고서 파일이 없습니다. 다시 시도해 주세요.');
      if (!mounted.current) return;
      setReady(true);
      await Linking.openURL(url);
    } catch (failure) { if (mounted.current) setError(failure.message || '파일을 열지 못했습니다.'); }
    finally { busy.current = false; if (mounted.current) setPreparing(false); }
  };
  return <View style={styles.container}><ScreenHeader title="보고서 파일" onBack={onBack} />
    <View style={styles.center}>
      <View style={styles.icon}><Ionicons name={ready ? 'checkmark' : 'document-text-outline'} size={32} color="#FFFFFF" /></View>
      <Text style={styles.title}>{preparing ? 'HWPX를 만드는 중입니다' : ready ? '보고서 파일이 준비되었습니다' : '보고서 파일 만들기'}</Text>
      <Text style={styles.description}>{canOpen ? `${count}건의 저장된 보고서를 HWPX로 확인합니다. 파일 열기를 누르면 생성합니다.` : '저장된 보고서를 먼저 선택해 주세요.'}</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton title={preparing ? '파일 생성 중…' : '파일 열기'} icon="open-outline" disabled={preparing || !canOpen} onPress={open} style={{ width: '100%' }} />
      <SecondaryButton title="이전 화면으로" onPress={onBack} style={{ width: '100%' }} />
    </View>
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  icon: { width: 70, height: 70, borderRadius: radius.large, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' }, description: { color: colors.textSoft, fontSize: 13, lineHeight: 20, textAlign: 'center' }, error: { color: '#DC2626', fontSize: 13 } });
