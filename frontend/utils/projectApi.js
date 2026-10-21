import { groupApi } from './groupApi';
import { apiFetch } from './auth';
import { API_BASE_URL, resolveApiUrl } from './api';

// 프로젝트·통합 보고서 API (백엔드 ProjectController / CompiledReportController)
export function buildQuery(params = {}) {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export const projectPaths = {
  projects: (groupId, userId) => `/api/groups/${groupId}/projects${buildQuery({ userId })}`,
  project: (projectId, userId) => `/api/projects/${projectId}${buildQuery({ userId })}`,
  items: (projectId, userId, filters = {}) => `/api/projects/${projectId}/items${buildQuery({
    userId, year: filters.year, adminDong: filters.adminDong, authorId: filters.authorId, category: filters.category,
  })}`,
  reports: (projectId, userId) => `/api/projects/${projectId}/reports${buildQuery({ userId })}`,
  reportItems: (reportId) => `/api/compiled-reports/${reportId}/items`,
  reportItem: (reportId, progressId, userId) => `/api/compiled-reports/${reportId}/items/${progressId}${buildQuery({ userId })}`,
  report: (reportId, userId) => `/api/compiled-reports/${reportId}${buildQuery({ userId })}`,
  reportHtml: (reportId, userId) => `/api/compiled-reports/${reportId}/html${buildQuery({ userId })}`,
  taskContext: (taskId, userId) => `/api/tasks/${taskId}/project-context${buildQuery({ userId })}`,
  hwpxPrepare: (reportId, userId) => `/api/compiled-reports/${reportId}/hwpx/prepare${buildQuery({ userId })}`,
};

// → [{ projectId, name, completedCount, draftReportCount, latestDraft:{reportId,title}|null, ... }]
export const fetchProjects = (groupId, userId) => groupApi(projectPaths.projects(groupId, userId));

// → { ...project, completedCount, isLeader }
export const fetchProject = (projectId, userId) => groupApi(projectPaths.project(projectId, userId));

// → { items, totalCount, filters:{years, adminDongs, authors, categories}, draftReports:[{reportId,title}] }
export const fetchProjectItems = (projectId, userId, filters) => groupApi(projectPaths.items(projectId, userId, filters));

// → [{ reportId, title, status, itemCount, ... }]
export const fetchProjectReports = (projectId, userId) => groupApi(projectPaths.reports(projectId, userId));

// → { added, skipped:[{progressId, reason}] }
export const addReportItems = (reportId, userId, progressIds) => groupApi(projectPaths.reportItems(reportId), {
  method: 'POST',
  body: JSON.stringify({ userId, progressIds }),
});

// 리더 전용
export const removeReportItem = (reportId, progressId, userId) => groupApi(projectPaths.reportItem(reportId, progressId, userId), { method: 'DELETE' });

export const fetchCompiledReport = (reportId, userId) => groupApi(projectPaths.report(reportId, userId));

export async function fetchCompiledReportHtml(reportId, userId) {
  return fetchReportHtml(`${API_BASE_URL}${projectPaths.reportHtml(reportId, userId)}`);
}

// 건별 보고서 미리보기: 통합 보고서와 같은 지도+카드 양식, 한 건
export async function fetchProgressReportHtml(progressId) {
  return fetchReportHtml(`${API_BASE_URL}/api/progress-reports/${progressId}/html`);
}

async function fetchReportHtml(url) {
  if (!API_BASE_URL) throw new Error('API_BASE_URL이 설정되어 있지 않습니다.');
  const response = await apiFetch(url);
  const text = await response.text();
  if (!response.ok) {
    let message = `보고서를 불러오지 못했습니다. (오류 ${response.status})`;
    try { const data = JSON.parse(text); if (data?.message) message = data.message; } catch { /* HTML 아님 */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return text;
}

// → { key, fileName, downloadUrl(상대 경로) }
export async function prepareCompiledHwpx(reportId, userId) {
  const prepared = await groupApi(projectPaths.hwpxPrepare(reportId, userId), { method: 'POST' });
  return { ...prepared, downloadUrl: resolveApiUrl(prepared?.downloadUrl) };
}

// added 응답이 숫자 또는 progressId 배열 둘 다 올 수 있어 정규화
export function addedIds(result) {
  return Array.isArray(result?.added) ? result.added : [];
}

export function addedCount(result) {
  if (Array.isArray(result?.added)) return result.added.length;
  return Number(result?.added) || 0;
}

export const SKIP_REASON_LABEL = {
  ALREADY_IN_REPORT: '이미 담김',
  NOT_COMPLETED: '작업완료 아님',
  EXPIRED: '보존기간 지남',
  NOT_IN_PROJECT: '프로젝트 밖',
  NOT_FOUND: '없음',
};

export function skippedMessage(skipped = []) {
  const counts = {};
  skipped.forEach(({ reason }) => { counts[reason] = (counts[reason] || 0) + 1; });
  return Object.entries(counts)
    .map(([reason, count]) => `${SKIP_REASON_LABEL[reason] || reason} ${count}건`)
    .join('\n');
}

// 보고서 HTML에 카카오 지도 키 주입 (D15). 키가 없으면 원본 그대로 → 위치 목록 표만 보임
export function injectKakaoKey(html, key) {
  if (!key || typeof html !== 'string') return html;
  const script = `<script>window.REPORT_KAKAO_KEY=${JSON.stringify(key)};</script>`;
  const match = html.match(/<head[^>]*>/i);
  if (!match) return script + html;
  const at = match.index + match[0].length;
  return html.slice(0, at) + script + html.slice(at);
}

// ---------- 작업 기록 저장 후 "보고서에도 담기" (Phase 4, B②) ----------

// → { projectId|null, projectName, draftReports:[{reportId,title,itemCount}] }
export const fetchTaskProjectContext = (taskId, userId) => groupApi(projectPaths.taskContext(taskId, userId));

// 저장 성공 뒤 별도 호출. 절대 throw 하지 않는다 → { ok, message }. 이미 담김은 성공으로 본다.
export async function addSavedProgressToReport(reportId, userId, progressId) {
  if (!reportId || !progressId) return { ok: true, skipped: true };
  try {
    const result = await addReportItems(reportId, userId, [progressId]);
    const problems = (Array.isArray(result?.skipped) ? result.skipped : []).filter((row) => row.reason !== 'ALREADY_IN_REPORT');
    if (problems.length) return { ok: false, message: skippedMessage(problems) };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || '알 수 없는 오류' };
  }
}
