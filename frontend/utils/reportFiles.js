import { cleanReportName } from './reportName';

export async function prepareIndividualReport({ progressId, userId, baseUrl, fetchReport, download }) {
  const response = await fetchReport(`${baseUrl}/api/task-progress/${progressId}/report/prepare?userId=${userId}`, { method: 'POST' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || (response.status === 409 ? '작업 전 보고서는 다운로드할 수 없습니다.' : '보고서 파일을 만들지 못했습니다. 다시 시도해 주세요.'));
  }
  const result = await response.json();
  if (!result.reportDownloadUrl) throw new Error('보고서 파일을 찾을 수 없습니다.');
  const name = cleanReportName(result.reportName) || result.detailAddress || result.roadAddress || `보고서 ${progressId}`;
  const date = String(result.createdAt || '').slice(0, 10);
  const filename = `${name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}_${date ? `${date}_` : ''}${progressId}.hwpx`;
  const url = result.reportDownloadUrl.startsWith('/') ? `${baseUrl}${result.reportDownloadUrl}` : result.reportDownloadUrl;
  const uri = await download(url, filename);
  return { progressId, name, filename, uri, revision: result.revision };
}
