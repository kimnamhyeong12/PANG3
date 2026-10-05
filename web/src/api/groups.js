import { api } from './client.js';

// GroupController GET /api/groups/{groupId}/members?userId=
// → [{ groupMemberId, userId, loginId, name, workSido, workSigungu, role, joinedAt }]
export function fetchGroupMembers(groupId, userId) {
  return api.get(`/api/groups/${groupId}/members`, { userId });
}

// POST /api/groups/{groupId}/invitations { inviterUserId, inviteeLoginId }
// → { invitationId, status, groupId, groupName, inviter*, invitee*, message }
export function inviteMember(groupId, inviterUserId, inviteeLoginId) {
  return api.post(`/api/groups/${groupId}/invitations`, { inviterUserId, inviteeLoginId });
}

// PATCH /api/groups/{groupId}/region { leaderUserId, regionSido, regionSigungu, regionAdmCode }
// regionSigungu·regionAdmCode 필수. 백엔드는 요청자가 그룹 구성원인지만 확인한다(별도 리더 권한 검사 없음).
export function updateGroupRegion(groupId, { leaderUserId, regionSido, regionSigungu, regionAdmCode }) {
  return api.patch(`/api/groups/${groupId}/region`, { leaderUserId, regionSido, regionSigungu, regionAdmCode });
}
