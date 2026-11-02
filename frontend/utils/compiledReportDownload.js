import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { generateLocalReport } from './localReports';
import { saveReportToDownloads, openReportDownloadsFolder, reportDownloadExists } from '../modules/kakao-navigation';
import { showAlert } from '../components/CustomAlert';

export async function downloadCompiledReportHwpx(reportId) {
  const prepared = await generateLocalReport('compiled', reportId);
  if (Platform.OS === 'android') {
    const savedUri = await saveReportToDownloads(prepared.uri, prepared.fileName);
    if (!savedUri || await reportDownloadExists(savedUri) === false) throw new Error('HWPX 파일을 다운로드 폴더에 저장하지 못했습니다. 다시 다운로드해 주세요.');
    showAlert('HWPX 저장 완료', `내 파일 → Download → 외근도우미 → 다운로드\n${prepared.fileName}`, [
      { text: '닫기', style: 'cancel' },
      { text: '폴더 열기', onPress: () => openReportDownloadsFolder().catch(error => showAlert('폴더 열기', error.message)) },
    ]);
    return { ...prepared, savedUri };
  } else if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(prepared.uri, { mimeType: 'application/hwp+zip', dialogTitle: prepared.fileName });
  } else throw new Error('이 기기에서 보고서 파일을 저장하거나 공유할 수 없습니다.');
}
