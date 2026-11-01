export function readImportWorkbook(bytes, fileName, XLSX) {
  if (/\.csv$/i.test(fileName)) {
    let source;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { source = new TextDecoder('euc-kr', { fatal: true }).decode(bytes); }
    return XLSX.read(source, { type: 'string' });
  }
  return XLSX.read(bytes, { type: 'array' });
}
