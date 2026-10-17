export function maneuverStep(step) {
  if (!step || typeof step.distance !== 'number' || !Number.isFinite(step.distance) || step.distance < 0) return null;
  const code = String(step.code || '');
  let label = '경로 따라 이동', icon = 'navigate-outline';
  if (code === 'Goal' || code === 'Via') { label = code === 'Goal' ? '목적지 도착' : '경유지 도착'; icon = 'location-outline'; }
  else if (code === 'UTurn') { label = '유턴'; icon = 'return-down-back-outline'; }
  else if (/Rotary|Roundabout/.test(code)) { label = '회전교차로'; icon = 'sync-outline'; }
  else if (/LeftTurn/.test(code)) { label = code === 'UnprotectedLeftTurn' ? '비보호 좌회전' : '좌회전'; icon = 'return-up-back-outline'; }
  else if (/RightTurn/.test(code)) { label = '우회전'; icon = 'return-up-forward-outline'; }
  else if (/Left/.test(code)) { label = '왼쪽 방향'; icon = 'return-up-back-outline'; }
  else if (/Right/.test(code)) { label = '오른쪽 방향'; icon = 'return-up-forward-outline'; }
  else if (code === 'Straight') { label = '직진'; icon = 'arrow-up-outline'; }
  else if (code === 'Start') { label = '출발'; icon = 'navigate-outline'; }
  else if (/OutHighway|OutCityway/.test(code)) { label = '출구 방향'; icon = 'git-branch-outline'; }
  else if (/InHighway|InCityway/.test(code)) { label = '진입'; icon = 'git-branch-outline'; }
  else if (/Tunnel/.test(code)) { label = '터널 방향'; icon = 'arrow-up-outline'; }
  else if (/Tollgate|Tolling/.test(code)) { label = '요금소'; icon = 'arrow-up-outline'; }
  return { code, label, icon, distance: Math.round(step.distance), road: String(step.road || '').trim() };
}
export function maneuverGuide(data, destinationKey) {
  if (!data || data.visible !== true || !destinationKey || data.destinationKey !== destinationKey) return null;
  const primary = maneuverStep(data.primary);
  return primary ? { destinationKey, primary, secondary: maneuverStep(data.secondary) } : null;
}
export const maneuverDistance = distance => distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`;
