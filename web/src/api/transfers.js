import { api } from './client.js';

// TaskTransferController /api/groups/{groupId}/transfers
// 응답(TaskTransferService.toMap): { id, groupId, senderUserId, senderName, recipientUserId, recipientName,
//   taskIds, sido, sigungu, adminDong, status, requestedAt, respondedAt }
// status: "PENDING" | "ACCEPTED" | "REJECTED"
export const TRANSFER_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
};

// 로그인 유저가 보낸/받은 요청만 반환
export function fetchTransfers(groupId, userId) {
  return api.get(`/api/groups/${groupId}/transfers`, { userId });
}

// taskIds는 보내는 사람이 현재 담당자인 업무만 허용됨 (아니면 400 "본인 담당 방문지만 이관할 수 있습니다.")
export function createTransfer(groupId, { senderUserId, recipientUserId, taskIds, sido, sigungu, adminDong }) {
  return api.post(`/api/groups/${groupId}/transfers`, {
    senderUserId,
    recipientUserId,
    taskIds,
    sido,
    sigungu,
    adminDong,
  });
}

export function acceptTransfer(groupId, requestId, userId) {
  return api.post(`/api/groups/${groupId}/transfers/${requestId}/accept`, { userId });
}

export function rejectTransfer(groupId, requestId, userId) {
  return api.post(`/api/groups/${groupId}/transfers/${requestId}/reject`, { userId });
}
