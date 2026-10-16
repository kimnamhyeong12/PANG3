import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { ScreenHeader } from '../components/ui';
import { groupApi } from '../utils/groupApi';
import { BUSAN_DISTRICT_CODES } from '../constants/busanDistricts';
import { koreaDayKey, isCurrentWork } from '../utils/completionDay';
import { buildMemberColors } from '../utils/memberColors';
import GroupDashboardScreen from './GroupDashboardScreen';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const KAKAO_JAVASCRIPT_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY ||
  process.env.EXPO_PUBLIC_KAKAO_MAP_API_KEY;
const MIXED_AREA_COLOR = '#64748B';
const UNASSIGNED_COLOR = '#94A3B8';
const isPersonalGroup = (group) =>
  Boolean(
    group?.personalWorkspace ||
    group?.personal ||
    group?.workspaceType === 'PERSONAL'
  );

const normalizeStatus = (value) => {
  const status = String(value || 'pending').toLowerCase();
  if (['complete', 'completed', 'done'].includes(status)) return 'complete';
  if (['working', 'progress', 'in_progress'].includes(status)) return 'working';
  return 'pending';
};

const STATUS = {
  pending: { label: '작업 전', color: colors.pending },
  working: { label: '작업 중', color: colors.warning },
  complete: { label: '완료', color: colors.success },
};

const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const buildMapHtml = ({ boundaries, assignments, memberColors, selectedMemberId, focusedAreaBounds, districtView }) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden}body{background:#eaf0f5;font-family:Arial,sans-serif}
.pin{width:32px;height:40px;position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}.pin-body{width:30px;height:30px;border-radius:50% 50% 50% 0;border:4px solid #94A3B8;box-shadow:0 0 0 1px rgba(255,255,255,.95);transform:rotate(-45deg);box-sizing:border-box}.pin-body:after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;left:8px;top:8px}
.place-callout{position:relative;min-width:190px;max-width:245px;padding:10px 12px 12px;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.24);color:#172b3f}.place-callout:after{content:'';position:absolute;left:50%;bottom:-9px;margin-left:-9px;border-left:9px solid transparent;border-right:9px solid transparent;border-top:10px solid #fff}.place-title{font-size:12px;font-weight:900;line-height:1.35}.place-address{margin-top:3px;font-size:10px;color:#64748b;line-height:1.35}.place-status{display:inline-block;margin-top:7px;padding:4px 8px;border-radius:10px;color:#fff;font-size:9px;font-weight:900}
.place-assignee{margin-top:7px;font-size:10px;font-weight:900}
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY || ''}&autoload=false"></script>
</head><body><div id="map"></div><script>
const boundaries=${safeJson(boundaries || { type: 'FeatureCollection', features: [] })};
const assignments=${safeJson(assignments || [])};
const memberColors=${safeJson(memberColors || {})};
const selectedMemberId=${safeJson(selectedMemberId ? String(selectedMemberId) : '')};
const focusedAreaBounds=${safeJson(focusedAreaBounds || null)};
const districtView=${safeJson(districtView || null)};
const statusColors=${safeJson({ pending: colors.pending, working: colors.warning, complete: colors.success })};
function statusOf(v){v=String(v||'pending').toLowerCase();if(['complete','completed','done'].includes(v))return'complete';if(['working','progress','in_progress'].includes(v))return'working';return'pending'}
function shortName(v){const p=String(v||'').trim().split(/\\s+/);return(p[p.length-1]||'').replace(/제(?=\\d+동$)/,'')}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function post(v){window.ReactNativeWebView.postMessage(JSON.stringify(v))}
kakao.maps.load(function(){
 const map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(35.1046,128.9747),level:7});
 const bounds=new kakao.maps.LatLngBounds();let hasBounds=false;const regionBounds=new kakao.maps.LatLngBounds();let hasRegionBounds=false;const byArea={};
 assignments.forEach(i=>{const a=shortName(i.adminDong||i.admin_dong);if(a)(byArea[a]||(byArea[a]=[])).push(i)});
 function addRing(feature,ring,areaBounds,areaKey){
  const area=shortName(feature.properties&&feature.properties.adm_nm),items=byArea[area]||[];if(!items.length||!Array.isArray(ring))return;
  const ownerIds=Array.from(new Set(items.map(item=>String(item.assigneeUserId||'unknown'))));
  const singleOwner=ownerIds.length===1,ownerId=singleOwner?ownerIds[0]:'',color=singleOwner?(memberColors[ownerId]||'${UNASSIGNED_COLOR}'):'${MIXED_AREA_COLOR}',dimmed=selectedMemberId&&!ownerIds.includes(selectedMemberId);
  const path=ring.map(p=>{const ll=new kakao.maps.LatLng(Number(p[1]),Number(p[0]));bounds.extend(ll);hasBounds=true;return ll});
  const polygon=new kakao.maps.Polygon({path,strokeWeight:dimmed?1:3,strokeColor:color,strokeOpacity:dimmed?0.25:1,fillColor:color,fillOpacity:dimmed?0.05:0.24});polygon.setMap(map);
  kakao.maps.event.addListener(polygon,'click',()=>{
   map.setBounds(areaBounds,35,35,35,35);
   const sw=areaBounds.getSouthWest(),ne=areaBounds.getNorthEast();
   post({type:'AREA_SELECT',areaKey,memberId:ownerId,bounds:{south:sw.getLat(),west:sw.getLng(),north:ne.getLat(),east:ne.getLng()}});
  });
 }
 (boundaries.features||[]).forEach((f,index)=>{const g=f.geometry||{},rings=[];if(g.type==='Polygon'&&g.coordinates&&g.coordinates[0])rings.push(g.coordinates[0]);else if(g.type==='MultiPolygon')(g.coordinates||[]).forEach(p=>p[0]&&rings.push(p[0]));if(!rings.length)return;const areaBounds=new kakao.maps.LatLngBounds(),properties=f.properties||{},areaKey=String(properties.adm_cd||properties.adm_nm||index);rings.forEach(r=>r.forEach(p=>{const ll=new kakao.maps.LatLng(Number(p[1]),Number(p[0]));areaBounds.extend(ll);regionBounds.extend(ll);hasRegionBounds=true;}));rings.forEach(r=>addRing(f,r,areaBounds,areaKey));});
 let openedCallout=null,openedMarkerKey=null;
 assignments.forEach((i,index)=>{const lat=Number(i.lat!=null?i.lat:i.latitude),lng=Number(i.lng!=null?i.lng:i.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const s=statusOf(i.status||i.taskStatus),ownerId=String(i.assigneeUserId||'unknown'),ownerColor=memberColors[ownerId]||'${UNASSIGNED_COLOR}',markerKey=String(i.taskId||i.assignmentId||i.id||index),dimmed=selectedMemberId&&selectedMemberId!==ownerId,position=new kakao.maps.LatLng(lat,lng);bounds.extend(position);hasBounds=true;const content=document.createElement('div');content.className='pin';content.style.opacity=dimmed?'.22':'1';content.innerHTML='<div class="pin-body" style="background:#E34D59;border-color:'+ownerColor+'"></div>';const markerOverlay=new kakao.maps.CustomOverlay({map,position,content,yAnchor:1,zIndex:5});content.onclick=(event)=>{event.stopPropagation();if(openedMarkerKey===markerKey){if(openedCallout)openedCallout.setMap(null);openedCallout=null;openedMarkerKey=null;return;}if(openedCallout)openedCallout.setMap(null);const box=document.createElement('div');box.className='place-callout';const title=document.createElement('div');title.className='place-title';title.textContent=i.detailAddress||i.roadAddress||('방문지 '+i.taskId);const address=document.createElement('div');address.className='place-address';address.textContent=i.roadAddress||i.detailAddress||'주소 정보 없음';const assignee=document.createElement('div');assignee.className='place-assignee';assignee.style.color=ownerColor;assignee.textContent='담당자: '+(i.assigneeName||i.assigneeLoginId||'미배정');const status=document.createElement('span');status.className='place-status';status.style.background=statusColors[s];status.textContent=s==='complete'?'완료':s==='working'?'작업 중':'작업 전';box.appendChild(title);box.appendChild(address);box.appendChild(assignee);box.appendChild(status);openedCallout=new kakao.maps.CustomOverlay({map,position,content:box,yAnchor:1.65,zIndex:10});openedMarkerKey=markerKey;};});
 kakao.maps.event.addListener(map,'click',()=>{if(openedCallout)openedCallout.setMap(null);openedCallout=null;openedMarkerKey=null;});
 // 사용자가 행정동을 직접 눌렀을 때만 해당 동으로 확대한다.
 // 그 외 최초 진입/재진입은 SGIS 시군구 전체 경계를 최우선으로 사용한다.
 // 방문지 좌표 bounds는 SGIS 경계를 못 불러온 경우에만 최후의 fallback이다.
 if(focusedAreaBounds&&Number.isFinite(Number(focusedAreaBounds.south))&&Number.isFinite(Number(focusedAreaBounds.west))&&Number.isFinite(Number(focusedAreaBounds.north))&&Number.isFinite(Number(focusedAreaBounds.east))){const focused=new kakao.maps.LatLngBounds(new kakao.maps.LatLng(Number(focusedAreaBounds.south),Number(focusedAreaBounds.west)),new kakao.maps.LatLng(Number(focusedAreaBounds.north),Number(focusedAreaBounds.east)));map.setBounds(focused,35,35,35,35);}else if(hasRegionBounds)map.setBounds(regionBounds,35,35,35,35);else if(districtView){map.setCenter(new kakao.maps.LatLng(districtView.lat,districtView.lng));map.setLevel(districtView.level);}else if(hasBounds)map.setBounds(bounds,35,35,35,35);
});
</script></body></html>`;

export default function WorkStatusScreen({ user, group, assignments = [], onBack, onRefresh, embedded = false, showDashboard = false }) {
  const [loadingBoundary, setLoadingBoundary] = useState(true);
  const [boundaryError, setBoundaryError] = useState('');
  const [boundaries, setBoundaries] = useState({ type: 'FeatureCollection', features: [] });
  const [resolvedAssignments, setResolvedAssignments] = useState(assignments);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [selectedAreaKey, setSelectedAreaKey] = useState(null);
  const [focusedAreaBounds, setFocusedAreaBounds] = useState(null);
  const [mapInteracting, setMapInteracting] = useState(false);
  const [districtView, setDistrictView] = useState(null);
  useEffect(() => {
    let active = true;
    setDistrictView(null); setFocusedAreaBounds(null); setSelectedAreaKey(null);
    const sido = group?.regionSido || user?.workSido || '부산광역시';
    const district = group?.regionSigungu || user?.workSigungu;
    if (!district || !KAKAO_REST_API_KEY) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(`${sido} ${district}`)}`, {
      signal: controller.signal, headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
    }).then(response => response.ok ? response.json() : null).then(data => {
      const point = data?.documents?.[0];
      if (active && point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
        setDistrictView({ lat: Number(point.y), lng: Number(point.x), level: district.endsWith('군') ? 9 : 8 });
      }
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [group?.groupId, group?.regionSido, group?.regionSigungu, user?.workSido, user?.workSigungu]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [today, setToday] = useState(() => koreaDayKey());
  const personalWorkspace = isPersonalGroup(group);

  useEffect(() => {
    const updateToday = () => setToday(koreaDayKey());
    const timer = setInterval(updateToday, 60 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') updateToday();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  const loadBoundaries = useCallback(async () => {
    setLoadingBoundary(true);
    setBoundaryError('');
    try {
      // 그룹 업무현황의 최초 지도 범위는 '방문지 좌표'가 아니라
      // 그룹에 설정된 시/군/구 전체 SGIS 경계를 기준으로 잡는다.
      //
      // 중요: group.regionAdmCode가 행정동 코드로 저장돼 있을 수 있으므로
      // 사하구/영도구 같은 regionSigungu 값이 있으면 반드시 구·군 코드를 우선한다.
      const districtCode =
        ((!group?.regionSido || String(group.regionSido).includes('부산'))
          ? BUSAN_DISTRICT_CODES[group?.regionSigungu]
          : null) ||
        (personalWorkspace && (!user?.workSido || String(user.workSido).includes('부산'))
          ? BUSAN_DISTRICT_CODES[user?.workSigungu]
          : null);

      const primaryCode = districtCode || group?.regionAdmCode || null;

      const fallbackCodes = assignments.map((item) =>
        (!item.sido || String(item.sido).includes('부산'))
          ? BUSAN_DISTRICT_CODES[item.sigungu]
          : null
      ).filter(Boolean);

      // 그룹 시군구가 정해져 있으면 그 경계 하나만 요청한다.
      // 방문지 데이터에 잘못된 시군구/좌표가 섞여도 최초 화면 범위에 영향을 주지 않는다.
      const codes = Array.from(
        new Set((primaryCode ? [primaryCode] : fallbackCodes).filter(Boolean))
      );
      if (!codes.length) {
        setBoundaries({ type: 'FeatureCollection', features: [] });
        if (!personalWorkspace) {
          setBoundaryError('표시할 행정동 경계를 찾지 못했습니다.');
        }
        return;
      }
      const results = await Promise.allSettled(codes.map((code) => groupApi(
        `/api/sgis/boundaries?admCode=${encodeURIComponent(code)}`
      )));
      const features = results.flatMap((result) => result.status === 'fulfilled' && result.value?.type === 'FeatureCollection'
        ? result.value.features || [] : []);
      setBoundaries({ type: 'FeatureCollection', features });
      if (features.length === 0) setBoundaryError('행정동 경계를 불러오지 못했습니다.');
    } catch (error) {
      setBoundaryError(error.message || '행정동 경계를 불러오지 못했습니다.');
    } finally {
      setLoadingBoundary(false);
    }
  }, [group?.regionAdmCode, group?.regionSido, group?.regionSigungu, personalWorkspace, user?.workSido, user?.workSigungu, assignments]);

  useEffect(() => { onRefresh?.(); }, [onRefresh]);
  useEffect(() => { loadBoundaries(); }, [loadBoundaries]);
  useEffect(() => {
    if (!group?.groupId || !user?.userId) return undefined;
    let active = true;
    groupApi(`/api/groups/${group.groupId}/members?userId=${user.userId}`)
      .then((rows) => { if (active) setGroupMembers(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (active) setGroupMembers([]); });
    return () => { active = false; };
  }, [group?.groupId, user?.userId]);

  useEffect(() => {
    let cancelled = false;
    const resolveAreas = async () => {
      const source = Array.isArray(assignments) ? assignments : [];
      if (!KAKAO_REST_API_KEY) { setResolvedAssignments(source); return; }
      const cache = new Map();
      const enriched = await Promise.all(source.map(async (item) => {
        if (item.adminDong || item.admin_dong) return item;
        const lat = Number(item.lat ?? item.latitude), lng = Number(item.lng ?? item.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return item;
        const key = `${lat},${lng}`;
        if (!cache.has(key)) cache.set(key, (async () => {
          try {
            const response = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`, { headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` } });
            if (!response.ok) return null;
            const data = await response.json();
            return data.documents?.find((v) => v.region_type === 'H')?.region_3depth_name || null;
          } catch (_error) { return null; }
        })());
        const adminDong = await cache.get(key);
        return adminDong ? { ...item, adminDong } : item;
      }));
      if (!cancelled) setResolvedAssignments(enriched);
    };
    resolveAreas();
    return () => { cancelled = true; };
  }, [assignments]);

  const visibleAssignments = useMemo(() => {
    const source = Array.isArray(resolvedAssignments) ? resolvedAssignments : [];
    return source.filter((item) => isCurrentWork(item, today));
  }, [resolvedAssignments, today]);

  const mapAssignments = visibleAssignments;

  const memberColors = useMemo(() => {
    return { unknown: UNASSIGNED_COLOR, ...buildMemberColors(groupMembers, resolvedAssignments) };
  }, [resolvedAssignments, groupMembers]);

  const counts = useMemo(() => {
    const value = { pending: 0, working: 0, complete: 0 };
    visibleAssignments.forEach((item) => { value[normalizeStatus(item.status || item.taskStatus)] += 1; });
    return value;
  }, [visibleAssignments]);

  const memberProgress = useMemo(() => {
    const members = new Map();
    groupMembers.forEach((person) => {
      const id = String(person.userId);
      members.set(id, {
        id,
        name: person.name || person.loginId || '팀원',
        total: 0,
        pending: 0,
        working: 0,
        complete: 0,
        color: memberColors[id] || '#2E8BFF',
      });
    });
    visibleAssignments.forEach((item) => {
      const id = String(item.assigneeUserId || 'unknown');
      if (!members.has(id)) {
        members.set(id, {
          id,
          name: item.assigneeName || item.assigneeLoginId || '담당자 미지정',
          total: 0,
          pending: 0,
          working: 0,
          complete: 0,
          color: memberColors[id] || '#2E8BFF',
        });
      }
      const member = members.get(id);
      member.total += 1;
      member[normalizeStatus(item.status || item.taskStatus)] += 1;
    });
    return Array.from(members.values());
  }, [visibleAssignments, memberColors, groupMembers]);

  const mapHtml = useMemo(() => buildMapHtml({
    boundaries,
    assignments: mapAssignments,
    memberColors,
    selectedMemberId,
    focusedAreaBounds,
    districtView,
  }), [boundaries, mapAssignments, memberColors, selectedMemberId, focusedAreaBounds, districtView]);
  const selectedMember = memberProgress.find((member) => member.id === selectedMemberId);

  return (
    <View style={styles.container}>
      {!embedded && <ScreenHeader title={personalWorkspace ? '내 업무 현황' : '팀 작업현황'} subtitle={personalWorkspace ? undefined : `${group?.groupName || '현재 그룹'} · 팀 전체 현황`} onBack={onBack} />}

      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.body}
        scrollEnabled={!mapInteracting}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Summary value={visibleAssignments.length} label="전체" />
          <View style={styles.summaryDivider} /><Summary value={counts.pending} label="작업 전" color={colors.pendingInk} />
          <View style={styles.summaryDivider} /><Summary value={counts.working} label="작업 중" color={colors.warningInk} />
          <View style={styles.summaryDivider} /><Summary value={counts.complete} label="완료" color={colors.successInk} />
        </View>

        <View
          style={styles.mapCard}
          onTouchStart={() => setMapInteracting(true)}
          onTouchEnd={() => setMapInteracting(false)}
          onTouchCancel={() => setMapInteracting(false)}
        >
          {loadingBoundary ? (
            <View style={styles.mapState}><ActivityIndicator color="#1551A6" /><Text style={styles.mapStateText}>행정동 경계를 불러오는 중입니다.</Text></View>
          ) : !KAKAO_JAVASCRIPT_KEY ? (
            <View style={styles.mapState}><Text style={styles.errorText}>카카오 JavaScript 키가 설정되지 않았습니다.</Text></View>
          ) : (
            <WebView
              key={mapHtml}
              originWhitelist={['*']}
              source={{ html: mapHtml }}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="always"
              nestedScrollEnabled
              style={styles.map}
              onMessage={(event) => {
                try {
                  const message = JSON.parse(event.nativeEvent.data);
                  if (message.type === 'AREA_SELECT') {
                    const id = String(message.memberId || '');
                    const areaKey = String(message.areaKey || '');
                    if (selectedAreaKey === areaKey) {
                      setSelectedMemberId(null);
                      setSelectedAreaKey(null);
                      setFocusedAreaBounds(null);
                    } else {
                      setSelectedMemberId(id || null);
                      setSelectedAreaKey(areaKey || null);
                      setFocusedAreaBounds(message.bounds || null);
                    }
                  }
                } catch (_error) {}
              }}
            />
          )}
          <View style={styles.legend} pointerEvents="none">
            {Object.entries(STATUS).map(([key, value]) => <View key={key} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: value.color }]} /><Text style={styles.legendText}>{value.label}</Text></View>)}
            <View style={styles.legendDivider} />
            <View style={styles.legendRow}><View style={[styles.legendArea, { backgroundColor: MIXED_AREA_COLOR }]} /><Text style={styles.legendText}>공통 업무</Text></View>
          </View>
          {!personalWorkspace && <View style={styles.mapMemberPicker}>
            <TouchableOpacity style={styles.mapMemberToggle} onPress={() => setMemberPickerOpen((open) => !open)} accessibilityRole="button" accessibilityLabel="팀원 현황 선택">
              <Text style={styles.mapMemberToggleText} numberOfLines={1}>팀원 현황{selectedMember ? ` · ${selectedMember.name}` : ''}</Text>
              <Ionicons name={memberPickerOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#1769A0" />
            </TouchableOpacity>
            {memberPickerOpen && <ScrollView style={styles.mapMemberList} nestedScrollEnabled>
              {memberProgress.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.mapMemberRow, selectedMemberId === member.id && styles.mapMemberRowSelected]}
                  onPress={() => {
                    setSelectedMemberId(selectedMemberId === member.id ? null : member.id);
                    setSelectedAreaKey(null);
                    setFocusedAreaBounds(null);
                    setMemberPickerOpen(false);
                  }}
                >
                  <View style={[styles.ownerDot, { backgroundColor: member.color }]} />
                  <Text style={styles.mapMemberName} numberOfLines={1}>{member.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>}
          </View>}
          {!personalWorkspace && selectedMember && <View style={styles.mapMemberDetail}>
            <Text style={styles.mapMemberDetailTitle}>{selectedMember.name}</Text>
            <Text style={styles.mapMemberDetailText}>
              작업 전 {selectedMember.pending}곳 · 작업 중 {selectedMember.working}곳 · 완료 {selectedMember.complete}곳
            </Text>
          </View>}
        </View>

        {!!boundaryError && <Text style={styles.boundaryWarning}>경계 표시 오류: {boundaryError}</Text>}

        {showDashboard && <GroupDashboardScreen assignments={assignments} group={group} embedded />}


      </ScrollView>
    </View>
  );
}

function Summary({ value, label, color = colors.text }) {
  return <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
  flexDirection: 'row',
  gap: 12,
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 14,
  paddingBottom: 14,
  paddingTop: 30,
  borderBottomWidth: 1,
  borderBottomColor: '#DCE5E0',
},
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#637269', letterSpacing: 1.6 },
  title: { fontSize: 20, fontWeight: '900', color: '#15231D' },
  desc: { fontSize: 10, color: '#637269', marginTop: 2 },
  screenScroll: { flex: 1 },
  body: { padding: 14, gap: 12, paddingBottom: 32, paddingHorizontal: 20, },
  summaryCard: {    paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingVertical: 12, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: colors.line, },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900' },
  summaryLabel: {   fontWeight: '800', marginTop: 4, color: colors.textSoft, fontSize: 12, },
  summaryDivider: { width: 1, height: 36, backgroundColor: 'transparent', },
  mapCard: {  overflow: 'hidden',   borderColor: '#DCE5E0', backgroundColor: '#EAF0F5', height: 300, borderWidth: 0, borderRadius: 16, },
  mapMemberPicker: { position: 'absolute', top: 10, right: 10, width: 185, zIndex: 8, alignItems: 'flex-end' },
  mapMemberToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 185, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, elevation: 4 },
  mapMemberToggleText: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: '#15231D' },
  mapMemberList: { width: 185, maxHeight: 190, marginTop: 5, backgroundColor: '#FFFFFF', borderRadius: 12, elevation: 5 },
  mapMemberRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: '#EEF3F0' },
  mapMemberRowSelected: { backgroundColor: '#F0F7FC' },
  mapMemberName: { flex: 1, fontSize: 11, fontWeight: '800', color: '#15231D' },
  mapMemberDetail: { position: 'absolute', left: 10, right: 105, bottom: 10, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 10 },
  mapMemberDetailTitle: { fontSize: 12, fontWeight: '900', color: '#15231D' },
  mapMemberDetailText: { fontSize: 10, color: '#475569', marginTop: 3 },
  map: { flex: 1, backgroundColor: '#EAF0F5' },
  mapState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  mapStateText: { fontSize: 11, color: '#637269' },
  errorText: { fontSize: 11, color: '#D14343', fontWeight: '700', textAlign: 'center', padding: 20 },
  legend: {     borderRadius: 12,   shadowColor: '#000',  shadowRadius: 8, position: 'relative', right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, padding: 0, gap: 12, shadowOpacity: 0, elevation: 0, marginTop: 12, },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendArea: { width: 11, height: 9, borderRadius: 2 },
  legendDivider: {  backgroundColor: '#E2E8F0', marginVertical: 1, width: 0, height: 0, },
  legendText: {  color: '#334155', fontWeight: '800', fontSize: 11, },
  boundaryWarning: { fontSize: 10, lineHeight: 15, color: '#B45309', backgroundColor: '#FFF8E6', borderRadius: 10, padding: 10 },
  memberCard: { maxHeight: 190, minHeight: 106, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#DCE5E0' },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  memberTitle: { fontSize: 14, fontWeight: '900', color: '#15231D' },
  showAllText: { fontSize: 10, fontWeight: '900', color: '#1769A0' },
  memberList: { flexGrow: 0 },
  memberRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EEF3F0', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10 },
  memberRowSelected: { backgroundColor: '#F0F7FC' },
  ownerDot: { width: 12, height: 12, borderRadius: 6 },
  memberInfo: { flex: 1 },
  memberTextRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  memberName: { minWidth: 42, fontSize: 11, fontWeight: '900', color: '#15231D' },
  memberMeta: { flex: 1, fontSize: 9, color: '#64748B' },
  memberPercent: { fontSize: 11, fontWeight: '900', color: '#15231D' },
  progressTrack: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', borderRadius: 4 },
  emptyText: { fontSize: 10, color: '#637269', textAlign: 'center', paddingVertical: 18 },
});
