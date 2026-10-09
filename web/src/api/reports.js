import { api } from './client.js';

// GroupReportController GET /api/groups/{groupId}/reports?userId=
// 보고서 파일이 있는 TaskProgress만, createdAt 내림차순.
// → [{ progressId, taskId, detailAddress, roadAddress, taskCategory, adminDong, assigneeUserId, assigneeName,
//      performedByUserId, performedByName, progressStatus, createdAt, reportDownloadUrl, ... }]
// 주의: 식별자는 id가 아니라 progressId
export function fetchGroupReports(groupId, userId) {
  return api.get(`/api/groups/${groupId}/reports`, { userId });
}

// TaskProgressController GET /api/task-progress/{progressId}/report/download (HWPX)
// CORS에 Content-Disposition이 노출되지 않아 원래 파일명은 읽을 수 없다 → 저장 파일명은 호출 측에서 정한다.
export function downloadReport(progressId) {
  return api.download(`/api/task-progress/${progressId}/report/download`);
}
