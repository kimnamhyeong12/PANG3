export function maneuverStep(step) {
  if (!step || typeof step.distance !== 'number' || !Number.isFinite(step.distance) || step.distance < 0) return null;
  const code = String(step.code || '');
  let label, icon, rotation = 0;
  const clock = code.match(/^(?:(Rotary|Roundabout))?Direction_(1[0-2]|[1-9])$/);
  if (code === 'Goal' || code === 'Via') { label = code === 'Goal' ? '목적지 도착' : '경유지 도착'; icon = 'location-outline'; }
  else if (code === 'UTurn') { label = '유턴'; icon = 'return-down-back-outline'; }
  else if (clock) {
    label = `${clock[1] ? '회전교차로 ' : ''}${clock[2]}시 방향`;
    icon = 'arrow-up-outline'; rotation = (Number(clock[2]) % 12) * 30;
  }
  else if (code === 'LeftTurn' || code === 'UnprotectedLeftTurn') { label = code === 'UnprotectedLeftTurn' ? '비보호 좌회전' : '좌회전'; icon = 'return-up-back-outline'; }
  else if (code === 'RightTurn') { label = '우회전'; icon = 'return-up-forward-outline'; }
  else if (code === 'Straight') { label = '직진'; icon = 'arrow-up-outline'; }
  else if (code === 'LeftStraight' || code === 'RightStraight') { label = code === 'LeftStraight' ? '왼쪽 도로로 직진' : '오른쪽 도로로 직진'; icon = 'arrow-up-outline'; }
  else if (code === 'ChangeLeftHighway' || code === 'ChangeRightHighway') {
    const left = code === 'ChangeLeftHighway';
    label = left ? '왼쪽 고속도로로 이동' : '오른쪽 고속도로로 이동';
    icon = 'arrow-up-outline'; rotation = left ? -45 : 45;
  } else {
    const side = code.match(/^(Left|Right)(Direction|OutHighway|InHighway|OutCityway|InCityway|Tunnel|TunnelSide|OverPath|OverPathSide|UnderPath|UnderPathSide)$/);
    if (!side) return null;
    const destinations = { Direction: '도로', OutHighway: '고속도로 출구', InHighway: '고속도로 입구',
      OutCityway: '도시고속도로 출구', InCityway: '도시고속도로 입구', Tunnel: '터널', TunnelSide: '터널 옆길',
      OverPath: '고가도로', OverPathSide: '고가도로 옆길', UnderPath: '지하차도', UnderPathSide: '지하차도 옆길' };
    label = `${side[1] === 'Left' ? '왼쪽' : '오른쪽'} ${destinations[side[2]]}`;
    icon = side[1] === 'Left' ? 'return-up-back-outline' : 'return-up-forward-outline';
  }
  return { code, label, icon, rotation, distance: Math.round(step.distance), road: String(step.road || '').trim() };
}
export function maneuverGuide(data, destinationKey) {
  if (!data || data.visible !== true || !destinationKey || data.destinationKey !== destinationKey) return null;
  const primary = maneuverStep(data.primary);
  return primary ? { destinationKey, primary, secondary: maneuverStep(data.secondary) } : null;
}
export const maneuverDistance = distance => distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`;
