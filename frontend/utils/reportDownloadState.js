// 보고서 탭(F7)에서 '받기 / 폴더 열기 / 다시 받기'를 정할 때 쓰는 기록.
// DownloadScreen 과 같은 AsyncStorage 키·모양을 써서 두 화면이 같은 기록을 본다.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { saveReportToDownloads, openReportDownloadsFolder, reportDownloadExists } from '../modules/kakao-navigation';
import { apiFetch, downloadProtectedFile } from './auth';
import { API_BASE_URL } from './api';
import { prepareIndividualReport } from './reportFiles';
import { cleanReportName } from './reportName';

export const savedDownloadKey = (userId, progressId) => `pang3:report-download:${API_BASE_URL}:${userId}:${progressId}`;

// DownloadScreen.restoreDownload 와 같은 이름 규칙 (이름이 바뀌어도 '다시 받기'로 본다)
export const reportFileLabel = (report) =>
  cleanReportName(report?.reportName) || report?.detailAddress || report?.roadAddress || '방문지';

/** 'new' = 받은 적 없음(또는 파일 없어짐), 'saved' = 받은 그대로, 'changed' = 받은 뒤 고쳐짐 */
export async function downloadStateOf(userId, report) {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(savedDownloadKey(userId, report.progressId)) || 'null');
    if (!saved) return 'new';
    if (!report.revision || saved.revision !== report.revision || saved.name !== reportFileLabel(report)) return 'changed';
    const exists = Platform.OS === 'android'
      ? saved.savedUri && await reportDownloadExists(saved.savedUri) !== false
      : saved.uri && new File(saved.uri).exists;
    return exists ? 'saved' : 'new';
  } catch {
    return 'new';
  }
}

/** 안드로이드: 받아서 다운로드/외근도우미 폴더에 저장하고 기록한다. */
export async function downloadReportToFolder(userId, report) {
  const file = await prepareIndividualReport({ progressId: report.progressId, userId, baseUrl: API_BASE_URL,
    fetchReport: apiFetch, download: downloadProtectedFile });
  const savedUri = await saveReportToDownloads(file.uri, file.filename);
  const record = { name: reportFileLabel(report), filename: file.filename, uri: file.uri, savedUri,
    revision: file.revision || report.revision, downloaded: true, saved: true };
  try { await AsyncStorage.setItem(savedDownloadKey(userId, report.progressId), JSON.stringify(record)); }
  catch { /* 파일은 저장됐다. 기록만 못 남기면 다음에 '받기'로 보인다. */ }
  return record;
}

export const openDownloadsFolder = () => openReportDownloadsFolder();
