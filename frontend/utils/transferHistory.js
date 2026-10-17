import { groupApi } from './groupApi';

export async function transferHistoryPage(groupId, userId, page = 0, direction = 'all', recipientId = null) {
  let url = `/api/groups/${groupId}/transfers/page?userId=${userId}&page=${page}&direction=${direction}`;
  if (recipientId != null) url += `&recipientId=${recipientId}`;
  try {
    return await groupApi(url);
  } catch (error) {
    if (error.status !== 404) throw error;
    // Compatibility with servers deployed before the paged endpoint.
    // Bounded DB queries and retention require the updated backend deployment.
    const legacy = await groupApi(`/api/groups/${groupId}/transfers?userId=${userId}`);
    const all = Array.isArray(legacy) ? legacy : [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const visible = all.filter(request =>
      (request.status === 'PENDING' || !request.respondedAt || new Date(request.respondedAt).getTime() > cutoff)
      && (direction !== 'incoming' || Number(request.recipientUserId) === Number(userId))
      && (direction !== 'outgoing' || Number(request.senderUserId) === Number(userId))
      && (recipientId == null || Number(request.recipientUserId) === Number(recipientId)))
      .sort(compareTransferHistory(userId));
    const result = { items: visible.slice(page * 20, page * 20 + 20), page, hasMore: page === 0 && visible.length > 20 };
    if (direction === 'outgoing') result.pendingTaskIds = Array.from(new Set(all
      .filter(request => request.status === 'PENDING' && Number(request.senderUserId) === Number(userId))
      .flatMap(request => request.taskIds || [])));
    return result;
  }
}

export function mergeTransferHistory(previous, incoming) {
  return Array.from(new Map([...previous, ...incoming].map(request => [request.id, request])).values());
}

export function compareTransferHistory(userId) {
  return (a, b) => {
    const needsReply = request => request.status === 'PENDING' && Number(request.recipientUserId) === Number(userId);
    return Number(needsReply(b)) - Number(needsReply(a))
      || new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
      || Number(b.id) - Number(a.id);
  };
}
