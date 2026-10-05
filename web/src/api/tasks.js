import { api } from './client.js';

// LocationController GET /api/locations/group/{groupId}?userId= → TaskService.getGroupLocations
// (그룹 구성원이 아니면 400 "그룹 구성원이 아닙니다.")
// 참고: GET /api/tasks 는 groupId를 무시하고 본인 업무만 반환하므로 그룹 전체 조회에 쓰지 않는다.
export function fetchGroupTasks(groupId, userId) {
  return api.get(`/api/locations/group/${groupId}`, { userId });
}
