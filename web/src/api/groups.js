import { api } from './client.js';

// GroupController GET /api/groups/{groupId}/members?userId=
// → [{ groupMemberId, userId, loginId, name, workSido, workSigungu, role, joinedAt }]
export function fetchGroupMembers(groupId, userId) {
  return api.get(`/api/groups/${groupId}/members`, { userId });
}
