import { api, ApiError, isGarbledMessage } from './client.js';
import { webSession } from './session.js';
import { generateLocalReport, generateLocalReportHtml } from './localReports.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// client.js에 DELETE가 없어 같은 방식으로 따로 둔다 (응답/에러 처리 동일)
async function del(path, params) {
  const url = new URL(BASE_URL + path, window.location.origin);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  });
  const res = await webSession.fetch(url, { method: 'DELETE' });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const raw = data && (data.message || data.error);
    const garbled = Boolean(raw) && isGarbledMessage(raw);
    throw new ApiError(
      raw && !garbled ? raw : `요청을 처리하지 못했습니다. (오류 ${res.status})`,
      res.status,
      data,
      garbled
    );
  }
  return data;
}

// ---------- 프로젝트 (ProjectController) ----------

// → [{ projectId, groupId, name, startDate, endDate, status, completedCount, draftReportCount, latestDraft:{reportId,title}|null }]
export function fetchProjects(groupId, userId) {
  return api.get(`/api/groups/${groupId}/projects`, { userId });
}

export function createProject(groupId, userId, { name, startDate, endDate }) {
  return api.post(`/api/groups/${groupId}/projects`, { userId, name, startDate: startDate || null, endDate: endDate || null });
}

// → { ...project, completedCount, taskCount, isLeader }
export function fetchProject(projectId, userId) {
  return api.get(`/api/projects/${projectId}`, { userId });
}

export function updateProject(projectId, userId, patch) {
  return api.patch(`/api/projects/${projectId}`, { userId, ...patch });
}

// 연결된 업무 → [{ taskId, roadAddress, detailAddress, adminDong, taskCategory, taskStatus, completedAt, lat, lng }]
export function fetchProjectTasks(projectId, userId) {
  return api.get(`/api/projects/${projectId}/tasks`, { userId });
}

export function linkProjectTasks(projectId, userId, taskIds) {
  return api.post(`/api/projects/${projectId}/tasks`, { userId, taskIds });
}

// 여러 건 해제 → { unlinked:[taskId] } (연결 안 된 id 는 건너뜀)
export function unlinkProjectTasks(projectId, userId, taskIds) {
  return api.post(`/api/projects/${projectId}/tasks/unlink`, { userId, taskIds });
}

export function unlinkProjectTask(projectId, taskId, userId) {
  return del(`/api/projects/${projectId}/tasks/${taskId}`, { userId });
}

// 완료 항목 → { items:[{ progressId, taskId, address, adminDong, category, completedAt, year, authorId, authorName,
//   comment, photoCount, lat, lng, inReportIds }], totalCount, filters:{ years, adminDongs, authors:[{userId,name}], categories },
//   draftReports:[{reportId,title}] }
export function fetchProjectItems(projectId, userId, filters = {}) {
  const { year, adminDong, authorId, category } = filters;
  return api.get(`/api/projects/${projectId}/items`, {
    userId,
    year: year || undefined,
    adminDong: adminDong || undefined,
    authorId: authorId || undefined,
    category: category || undefined,
  });
}

// → [{ reportId, projectId, title, status, version, rootReportId, groupBy, itemCount, finalizedAt, createdAt, updatedAt }]
export function fetchProjectReports(projectId, userId) {
  return api.get(`/api/projects/${projectId}/reports`, { userId });
}

export function createProjectReport(projectId, userId, { title, groupBy }) {
  return api.post(`/api/projects/${projectId}/reports`, { userId, title, groupBy });
}

// ---------- 통합 보고서 (CompiledReportController) ----------

const reportPath = (reportId) => `/api/compiled-reports/${reportId}`;

// REPORT_SCHEMA v1 JSON
export function fetchCompiledReport(reportId, userId) {
  return api.get(reportPath(reportId), { userId });
}

export function updateCompiledReport(reportId, userId, patch) {
  return api.patch(reportPath(reportId), { userId, ...patch });
}

// → { added:[progressId], skipped:[{ progressId, reason }] }
export function addReportItems(reportId, userId, progressIds) {
  return api.post(`${reportPath(reportId)}/items`, { userId, progressIds });
}

// patch: { overrideComment?, overrideTitle?, overridePhotoComments?: { [사진순번]: 설명|null }, sortOrder? }
// (null/빈 값 → 원본으로 되돌림)
export function updateReportItem(reportId, progressId, userId, patch) {
  return api.patch(`${reportPath(reportId)}/items/${progressId}`, { userId, ...patch });
}

export function removeReportItem(reportId, progressId, userId) {
  return del(`${reportPath(reportId)}/items/${progressId}`, { userId });
}

// 서버 JSON과 사진으로 이 브라우저에서 HTML을 만든다.
export async function fetchCompiledReportHtml(reportId, userId) {
  return generateLocalReportHtml('compiled', reportId);
}

// 건별 보고서 HTML (통합 보고서와 같은 지도+카드 양식, 한 건)
export async function fetchProgressReportHtml(progressId) {
  return generateLocalReportHtml('progress', progressId);
}

export function finalizeCompiledReport(reportId, userId) {
  return api.post(`${reportPath(reportId)}/finalize`, { userId });
}

// → 새 초안 요약 (+ skipped)
export function reviseCompiledReport(reportId, userId) {
  return api.post(`${reportPath(reportId)}/revise`, { userId });
}

// → [{ reportId, version, status, title, finalizedAt, finalizedBy, updatedAt }]
export function fetchReportVersions(reportId, userId) {
  return api.get(`${reportPath(reportId)}/versions`, { userId });
}

// 서버에서 자료·사진을 읽고 이 브라우저의 Python worker에서 HWPX 생성.
export async function downloadCompiledHwpx(reportId, userId) {
  return generateLocalReport('compiled', reportId);
}

// ---------- 보고서 보관함 건별 편집 (D23) ----------

// → { progressId, reportName, autoTitle, mainComment, photos:[{index, slot, url, comment}], canEdit, revision, ... }
export function fetchProgressReport(progressId) {
  return api.get(`/api/progress-reports/${progressId}`);
}

// patch: { expectedRevision, reportName?, mainComment?, photoComments?: { [사진순번]: 설명 } } — 원본 기록을 고친다
export function updateProgressReport(progressId, patch) {
  return api.patch(`/api/progress-reports/${progressId}`, patch);
}

// 건별 HWPX도 서버 생성 파일 없이 이 브라우저에서 생성한다.
export async function downloadProgressHwpx(progressId, userId) {
  return (await generateLocalReport('progress', progressId)).blob;
}

// 인증이 필요한 /api/files 사진 → Blob
export function downloadProtectedFile(url) {
  return api.download(url);
}

// ---------- 공용 표시 값 ----------

export const GROUP_BY_OPTIONS = [
  { value: 'adminDong', label: '행정동' },
  { value: 'year', label: '연도' },
  { value: 'author', label: '작성자' },
  { value: 'category', label: '업무유형' },
];

export const SKIP_REASON_LABEL = {
  NOT_FOUND: '기록 없음',
  NOT_IN_PROJECT: '프로젝트 밖 기록',
  EXPIRED: '보존기간 만료',
  NOT_COMPLETED: '완료되지 않음',
  ALREADY_IN_REPORT: '이미 담김',
};

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(value) {
  return String(value || '보고서').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').slice(0, 80);
}

export const fetchProjectPlaces = projectId => api.get(`/api/projects/${projectId}/places`);
export const registerProjectPlaces = (projectId, userId, placeIds, allowActive = false) => api.post(`/api/projects/${projectId}/places/register`, { userId, placeIds, allowActive });
export const linkReportsToProject = (projectId, userId, progressIds) => api.post(`/api/projects/${projectId}/link-reports`, { userId, progressIds });
