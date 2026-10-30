// Keep original worksheet row numbers across chunks and partial failures.
export async function registerBulkRows(rows, send) {
  const result = { savedCount: 0, failures: [], savedRows: [], uncertain: false };
  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200);
    try {
      const response = await send(chunk);
      const ids = new Set(chunk.map(row => row.rowNumber));
      const failed = new Set(response?.failures?.map(row => row.rowNumber));
      if (!response || response.totalCount !== chunk.length || !Number.isInteger(response.savedCount) || !Number.isInteger(response.failedCount) || response.savedCount < 0 || response.failedCount < 0 || response.savedCount + response.failedCount !== chunk.length || response.failures?.length !== response.failedCount || failed.size !== response.failedCount || [...failed].some(id => !ids.has(id))) throw Error('서버의 저장 결과를 확인할 수 없습니다.');
      result.savedCount += response.savedCount;
      result.failures.push(...response.failures);
      result.savedRows.push(...chunk.filter(row => !failed.has(row.rowNumber)).map(row => row.rowNumber));
    } catch (error) {
      result.uncertain = !error.status || error.status >= 500;
      result.failures.push(...chunk.map(row => ({ rowNumber: row.rowNumber, reason: result.uncertain ? '저장 여부 확인 필요' : error.message })), ...rows.slice(offset + chunk.length).map(row => ({ rowNumber: row.rowNumber, reason: '미전송' })));
      break;
    }
  }
  return result;
}
