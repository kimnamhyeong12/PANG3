export const colors = {
  background: '#FFFFFF', surface: '#FFFFFF', surfaceMuted: '#F4F8FF',
  text: '#10285B', textSoft: '#607195', textFaint: '#93A1BA',
  primary: '#2477F3', primaryDark: '#1551A6', primarySoft: '#E8F2FF',
  teal: '#12A9A5', tealDark: '#078A88', tealSoft: '#E3F8F6',
  line: '#DCE7F5', pending: '#C87973', pendingSoft: '#F8EEEC', pendingInk: '#99514D',
  warning: '#F3BF32', warningSoft: '#FFF7D6', warningInk: '#795A0A', success: '#4F9588',
  successSoft: '#ECF5F2', successInk: '#326F64', danger: '#E34D59', dangerSoft: '#FFE9EC',
  blue: '#2477F3', blueSoft: '#E8F2FF',
};
export const spacing = { page: 20, section: 20, card: 16 };
export const radius = { small: 10, medium: 16, large: 22, pill: 999 };
export const shadow = {
  shadowColor: '#10285B', shadowOpacity: 0.06, shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 }, elevation: 1,
};

export const workStatus = (status) => {
  if (['complete', 'completed', 'done'].includes(status)) return { label: '작업 후', color: colors.success, background: colors.successSoft, ink: colors.successInk };
  if (['working', 'progress', 'in_progress'].includes(status)) return { label: '작업 중', color: colors.warning, background: colors.warningSoft, ink: colors.warningInk };
  return { label: '작업 전', color: colors.pending, background: colors.pendingSoft, ink: colors.pendingInk };
};
