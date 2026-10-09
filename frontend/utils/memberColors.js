export const MEMBER_COLORS = [
  '#2E8BFF',
  '#8B5CF6',
  '#F97316',
  '#14B8A6',
  '#EC4899',
  '#6366F1',
  '#D97706',
  '#0891B2',
  '#65A30D',
  '#DC2626',
];

export const buildMemberColors = (members = [], assignments = []) => {
  const memberIds = Array.from(new Set([
    ...members.map((member) => String(member.userId)),
    ...assignments
      .map((item) => String(item.assigneeUserId || 'unknown'))
      .filter((id) => id !== 'unknown'),
  ])).sort((left, right) => {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
  });

  return Object.fromEntries(memberIds.map((id, index) => [id, MEMBER_COLORS[index % MEMBER_COLORS.length]]));
};

export const softMemberColor = (color) => {
  const value = String(color || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return '#EEF3F8';
  const channels = [0, 2, 4].map((offset) => {
    const original = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(original * 0.16 + 255 * 0.84).toString(16).padStart(2, '0');
  });
  return `#${channels.join('').toUpperCase()}`;
};
