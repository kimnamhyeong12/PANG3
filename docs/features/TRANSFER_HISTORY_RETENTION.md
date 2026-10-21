# Transfer history retention and paging

- Received PENDING requests appear first. All remaining requests use requested_at
  descending with id as the deterministic tie-breaker.
- GET /api/groups/{groupId}/transfers/page returns items, page and hasMore.
  Page 0 and page 1 contain at most 20 items each; page 2+ is rejected.
  The outgoing direction can filter recipientId and returns pendingTaskIds
  independently of the visible history so already-requested visits remain protected.
- The legacy list endpoint also returns only the first 20 records.
- Processed records expire 30 days after responded_at (UTC). PENDING records are
  never automatically deleted. Legacy processed records without a response timestamp
  are retained because their processing date is unknown.
- Cleanup runs one minute after backend startup and then hourly, using up to 100
  transactions of 100 records each per run. It locks/rechecks candidates before
  deleting request entities and their task_transfer_items. Tasks and reports remain.
- Expired records are excluded from history queries even before the hourly cleanup.
- JPA schema update creates history and expiration indexes from the entity mapping.
  Scheduled cleanup becomes active after the updated backend is deployed.
- During rollout, a 404 from the page endpoint falls back to the legacy list
  endpoint and applies the same display order/page sizes on the client. Only the
  updated backend provides bounded DB reads and automatic retention cleanup.
- Team/visit loading is independent from history failures. A history outage is
  shown in its own section and cannot erase successfully loaded team members.
- Verified the connected phone shows all four members and 11 existing requests
  against the currently deployed legacy backend after the compatibility fix.
