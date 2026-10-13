export const canDownloadReport = (report) =>
  ['working', 'complete'].includes(String(report?.progressStatus || '').toLowerCase());
