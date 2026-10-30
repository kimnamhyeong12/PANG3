import { normalizeStatus, STATUS } from '../utils/taskStatus.js';
export const validPoint = point => point?.lat != null && point?.lng != null && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
export function recommendationPayload(tasks, userId, position, mode, groupId) {
  if (!validPoint(position)) throw new Error('현재 위치를 먼저 확인해 주세요.');
  const locations = tasks.filter(task => Number(task.assigneeUserId) === Number(userId) && normalizeStatus(task) !== STATUS.COMPLETE && validPoint(task));
  if (!locations.length) throw new Error('추천할 방문지가 없습니다.');
  if (locations.length > 500) throw new Error('방문 순서는 500곳까지 추천할 수 있습니다.');
  return {
    currentLocation: {
      lat: Number(position.lat),
      lng: Number(position.lng)
    },
    locations: locations.map(task => ({
      id: task.taskId,
      lat: Number(task.lat),
      lng: Number(task.lng),
      status: normalizeStatus(task)
    })),
    transportMode: mode,
    cacheScope: `web:${groupId}:${userId}`,
    guidanceStart: false
  };
}
export function applyVisitRecommendation(tasks, optimizedLocations = []) {
  const order = new Map(optimizedLocations.map((point, index) => [String(point.id ?? point.taskId), index + 1]));
  return tasks.map(task => ({
    ...task,
    markerNumber: order.get(String(task.taskId)) || null
  })).sort((a, b) => (a.markerNumber || Infinity) - (b.markerNumber || Infinity));
}
