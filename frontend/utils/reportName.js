export const cleanReportName = (value) => String(value || '').replace(/^현장\s*보고서\s*[-–—]\s*/, '').trim();
