// 개인 업무공간(personal: true)은 그룹명이 로그인 아이디로 저장되어 있어
// 화면에는 사람이 읽기 좋은 라벨로 바꿔서 보여준다.
export function groupDisplayName(group) {
  if (!group) return '';
  if (group.personal) return '내 개인 업무';
  return group.groupName ?? '이름 없는 그룹';
}

export function groupMetaText(group) {
  if (!group) return '';
  if (group.personal) {
    const region = [group.regionSido, group.regionSigungu].filter(Boolean).join(' ');
    return region ? `${region} · 개인 업무공간` : '개인 업무공간';
  }
  const region = [group.regionSido, group.regionSigungu].filter(Boolean).join(' ') || '지역 미설정';
  return `${region} · 멤버 ${group.memberCount}명`;
}
