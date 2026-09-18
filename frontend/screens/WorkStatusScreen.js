import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { BackButton } from '../components/ui';
import { groupApi } from '../utils/groupApi';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const KAKAO_JAVASCRIPT_KEY =
  process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY ||
  process.env.EXPO_PUBLIC_KAKAO_MAP_API_KEY;
const MEMBER_COLORS = ['#2E8BFF', '#8B5CF6', '#F97316', '#14B8A6', '#EC4899', '#6366F1'];
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
  pending: { label: '작업 전', color: '#E53935' },
  working: { label: '작업 중', color: '#F5B400' },
  complete: { label: '완료', color: '#16A05D' },
};

const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const shortAreaName = (value) =>
  (String(value || '').trim().split(/\s+/).pop() || '').replace(/제(?=\d+동$)/, '');

const buildMapHtml = ({ boundaries, assignments, memberColors, selectedMemberId, focusedAreaBounds }) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden}body{background:#eaf0f5;font-family:Arial,sans-serif}
.pin{width:30px;height:38px;position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}.pin-body{width:28px;height:28px;border-radius:50% 50% 50% 0;border:3px solid #fff;transform:rotate(-45deg);box-sizing:border-box}.pin-body:after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;left:8px;top:8px}
.place-callout{position:relative;min-width:190px;max-width:245px;padding:10px 12px 12px;border-radius:12px;background:#fff;box-shadow:0 3px 12px rgba(0,0,0,.24);color:#172b3f}.place-callout:after{content:'';position:absolute;left:50%;bottom:-9px;margin-left:-9px;border-left:9px solid transparent;border-right:9px solid transparent;border-top:10px solid #fff}.place-title{font-size:12px;font-weight:900;line-height:1.35}.place-address{margin-top:3px;font-size:10px;color:#64748b;line-height:1.35}.place-status{display:inline-block;margin-top:7px;padding:4px 8px;border-radius:10px;color:#fff;font-size:9px;font-weight:900}
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY || ''}&autoload=false"></script>
</head><body><div id="map"></div><script>
const boundaries=${safeJson(boundaries || { type: 'FeatureCollection', features: [] })};
const assignments=${safeJson(assignments || [])};
const memberColors=${safeJson(memberColors || {})};
const selectedMemberId=${safeJson(selectedMemberId ? String(selectedMemberId) : '')};
const focusedAreaBounds=${safeJson(focusedAreaBounds || null)};
const statusColors={pending:'#E53935',working:'#F5B400',complete:'#16A05D'};
function statusOf(v){v=String(v||'pending').toLowerCase();if(['complete','completed','done'].includes(v))return'complete';if(['working','progress','in_progress'].includes(v))return'working';return'pending'}
function shortName(v){const p=String(v||'').trim().split(/\\s+/);return(p[p.length-1]||'').replace(/제(?=\\d+동$)/,'')}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function post(v){window.ReactNativeWebView.postMessage(JSON.stringify(v))}
kakao.maps.load(function(){
 const map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(35.1046,128.9747),level:7});
 const bounds=new kakao.maps.LatLngBounds();let hasBounds=false;const byArea={};
 assignments.forEach(i=>{const a=shortName(i.adminDong||i.admin_dong);if(a)(byArea[a]||(byArea[a]=[])).push(i)});
 function addRing(feature,ring,areaBounds,areaKey){
  const area=shortName(feature.properties&&feature.properties.adm_nm),items=byArea[area]||[];if(!items.length||!Array.isArray(ring))return;
  const owner=items[0],ownerId=String(owner.assigneeUserId||'unknown'),color=memberColors[ownerId]||'#2E8BFF',dimmed=selectedMemberId&&selectedMemberId!==ownerId;
  const path=ring.map(p=>{const ll=new kakao.maps.LatLng(Number(p[1]),Number(p[0]));bounds.extend(ll);hasBounds=true;return ll});
  const polygon=new kakao.maps.Polygon({path,strokeWeight:dimmed?1:3,strokeColor:color,strokeOpacity:dimmed?0.25:1,fillColor:color,fillOpacity:dimmed?0.05:0.24});polygon.setMap(map);
  kakao.maps.event.addListener(polygon,'click',()=>{
   map.setBounds(areaBounds,35,35,35,35);
   const sw=areaBounds.getSouthWest(),ne=areaBounds.getNorthEast();
   post({type:'AREA_SELECT',areaKey,memberId:ownerId,bounds:{south:sw.getLat(),west:sw.getLng(),north:ne.getLat(),east:ne.getLng()}});
  });
 }
 (boundaries.features||[]).forEach((f,index)=>{const g=f.geometry||{},rings=[];if(g.type==='Polygon'&&g.coordinates&&g.coordinates[0])rings.push(g.coordinates[0]);else if(g.type==='MultiPolygon')(g.coordinates||[]).forEach(p=>p[0]&&rings.push(p[0]));if(!rings.length)return;const areaBounds=new kakao.maps.LatLngBounds(),properties=f.properties||{},areaKey=String(properties.adm_cd||properties.adm_nm||index);rings.forEach(r=>r.forEach(p=>areaBounds.extend(new kakao.maps.LatLng(Number(p[1]),Number(p[0])))));rings.forEach(r=>addRing(f,r,areaBounds,areaKey));});
 let openedCallout=null,openedMarkerKey=null;
 assignments.forEach((i,index)=>{const lat=Number(i.lat!=null?i.lat:i.latitude),lng=Number(i.lng!=null?i.lng:i.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const s=statusOf(i.status||i.taskStatus),ownerId=String(i.assigneeUserId||'unknown'),markerKey=String(i.taskId||i.assignmentId||i.id||index),dimmed=selectedMemberId&&selectedMemberId!==ownerId,position=new kakao.maps.LatLng(lat,lng);bounds.extend(position);hasBounds=true;const content=document.createElement('div');content.className='pin';content.style.opacity=dimmed?'.22':'1';content.innerHTML='<div class="pin-body" style="background:'+statusColors[s]+'"></div>';const markerOverlay=new kakao.maps.CustomOverlay({map,position,content,yAnchor:1,zIndex:5});content.onclick=(event)=>{event.stopPropagation();if(openedMarkerKey===markerKey){if(openedCallout)openedCallout.setMap(null);openedCallout=null;openedMarkerKey=null;return;}if(openedCallout)openedCallout.setMap(null);const box=document.createElement('div');box.className='place-callout';const title=document.createElement('div');title.className='place-title';title.textContent=i.detailAddress||i.roadAddress||('방문지 '+i.taskId);const address=document.createElement('div');address.className='place-address';address.textContent=i.roadAddress||i.detailAddress||'주소 정보 없음';const status=document.createElement('span');status.className='place-status';status.style.background=statusColors[s];status.textContent=s==='complete'?'완료':s==='working'?'작업 중':'작업 전';box.appendChild(title);box.appendChild(address);box.appendChild(status);openedCallout=new kakao.maps.CustomOverlay({map,position,content:box,yAnchor:1.65,zIndex:10});openedMarkerKey=markerKey;};});
 kakao.maps.event.addListener(map,'click',()=>{if(openedCallout)openedCallout.setMap(null);openedCallout=null;openedMarkerKey=null;});
 if(focusedAreaBounds&&Number.isFinite(Number(focusedAreaBounds.south))&&Number.isFinite(Number(focusedAreaBounds.west))&&Number.isFinite(Number(focusedAreaBounds.north))&&Number.isFinite(Number(focusedAreaBounds.east))){const focused=new kakao.maps.LatLngBounds(new kakao.maps.LatLng(Number(focusedAreaBounds.south),Number(focusedAreaBounds.west)),new kakao.maps.LatLng(Number(focusedAreaBounds.north),Number(focusedAreaBounds.east)));map.setBounds(focused,35,35,35,35);}else if(hasBounds)map.setBounds(bounds,35,35,35,35);
});
</script></body></html>`;

export default function WorkStatusScreen({ user, group, assignments = [], onBack, onRefresh }) {
  const [loadingBoundary, setLoadingBoundary] = useState(true);
  const [boundaryError, setBoundaryError] = useState('');
  const [boundaries, setBoundaries] = useState({ type: 'FeatureCollection', features: [] });
  const [resolvedAssignments, setResolvedAssignments] = useState(assignments);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [selectedAreaKey, setSelectedAreaKey] = useState(null);
  const [focusedAreaBounds, setFocusedAreaBounds] = useState(null);
  const [mapInteracting, setMapInteracting] = useState(false);
  const isLeader = group?.role === 'LEADER';
  const personalWorkspace = isPersonalGroup(group);

  const loadBoundaries = useCallback(async () => {
    setLoadingBoundary(true);
    setBoundaryError('');
    try {
      if (!group?.regionAdmCode) {
        setBoundaries({ type: 'FeatureCollection', features: [] });
        if (!personalWorkspace) {
          setBoundaryError('그룹 활동 구·군을 먼저 설정해주세요.');
        }
        return;
      }
      const data = await groupApi(
        `/api/sgis/boundaries?admCode=${encodeURIComponent(group.regionAdmCode)}`
      );
      setBoundaries(data?.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [] });
    } catch (error) {
      setBoundaryError(error.message || '행정동 경계를 불러오지 못했습니다.');
    } finally {
      setLoadingBoundary(false);
    }
  }, [group?.regionAdmCode, personalWorkspace]);

  useEffect(() => { onRefresh?.(); loadBoundaries(); }, [loadBoundaries, onRefresh]);

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
    return isLeader ? source : source.filter((i) => Number(i.assigneeUserId) === Number(user?.userId));
  }, [resolvedAssignments, isLeader, user?.userId]);

  const memberColors = useMemo(() => {
    const result = {}; let index = 0;
    visibleAssignments.forEach((item) => { const id = String(item.assigneeUserId || 'unknown'); if (!result[id]) result[id] = MEMBER_COLORS[index++ % MEMBER_COLORS.length]; });
    return result;
  }, [visibleAssignments]);

  const counts = useMemo(() => {
    const value = { pending: 0, working: 0, complete: 0 };
    visibleAssignments.forEach((item) => { value[normalizeStatus(item.status || item.taskStatus)] += 1; });
    return value;
  }, [visibleAssignments]);

  const memberProgress = useMemo(() => {
    const members = new Map();
    visibleAssignments.forEach((item) => {
      const id = String(item.assigneeUserId || 'unknown');
      if (!members.has(id)) {
        members.set(id, {
          id,
          name: item.assigneeName || item.assigneeLoginId || '담당자 미지정',
          total: 0,
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
  }, [visibleAssignments, memberColors]);

  const mapHtml = useMemo(() => buildMapHtml({
    boundaries,
    assignments: visibleAssignments,
    memberColors,
    selectedMemberId,
    focusedAreaBounds,
  }), [boundaries, visibleAssignments, memberColors, selectedMemberId, focusedAreaBounds]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>업무 현황</Text>
          <Text style={styles.title}>
            {personalWorkspace ? '내 업무 현황' : isLeader ? '팀 작업현황' : '내 담당 업무'}
          </Text>
          <Text style={styles.desc}>
            {group?.groupName || '현재 그룹'} · {personalWorkspace ? '1인 그룹' : isLeader ? '팀장 화면' : '팀원 화면'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.screenScroll}
        contentContainerStyle={styles.body}
        scrollEnabled={!mapInteracting}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryCard}>
          <Summary value={visibleAssignments.length} label="전체" />
          <View style={styles.summaryDivider} /><Summary value={counts.pending} label="작업 전" color="#FFB6B6" />
          <View style={styles.summaryDivider} /><Summary value={counts.working} label="작업 중" color="#FFE08A" />
          <View style={styles.summaryDivider} /><Summary value={counts.complete} label="완료" color="#8DE0AD" />
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
          </View>
        </View>

        {!!boundaryError && <Text style={styles.boundaryWarning}>경계 표시 오류: {boundaryError}</Text>}

        <View style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <Text style={styles.memberTitle}>
              {personalWorkspace ? '내 진행 현황' : '팀원별 진행 현황'}
            </Text>
            {!!selectedMemberId && (
              <TouchableOpacity onPress={() => { setSelectedMemberId(null); setSelectedAreaKey(null); setFocusedAreaBounds(null); }}>
                <Text style={styles.showAllText}>전체 보기</Text>
              </TouchableOpacity>
            )}
          </View>
          {memberProgress.length === 0 ? (
            <Text style={styles.emptyText}>
              {personalWorkspace ? '등록된 업무가 없습니다.' : '배정된 팀 업무가 없습니다.'}
            </Text>
          ) : (
            <ScrollView style={styles.memberList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {memberProgress.map((member) => {
                const percent = member.total ? Math.round((member.complete / member.total) * 100) : 0;
                const selected = selectedMemberId === member.id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    activeOpacity={0.75}
                    style={[styles.memberRow, selected && styles.memberRowSelected]}
                    onPress={() => {
                      setSelectedMemberId(selected ? null : member.id);
                      setSelectedAreaKey(null);
                      setFocusedAreaBounds(null);
                    }}
                  >
                    <View style={[styles.ownerDot, { backgroundColor: member.color }]} />
                    <View style={styles.memberInfo}>
                      <View style={styles.memberTextRow}>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.memberMeta}>
                          {member.total}곳 중 {member.complete}곳 완료{member.working ? ` · ${member.working}곳 진행 중` : ''}
                        </Text>
                        <Text style={styles.memberPercent}>{percent}%</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: member.color }]} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Summary({ value, label, color = '#FFFFFF' }) {
  return <View style={styles.summaryItem}><Text style={[styles.summaryValue, { color }]}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F5' },
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
  body: { padding: 14, gap: 12, paddingBottom: 32 },
  summaryCard: { backgroundColor: '#1551A6', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: '#BFD0DE', fontSize: 9, fontWeight: '800', marginTop: 4 },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#2F725E' },
  mapCard: { height: 430, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: '#DCE5E0', backgroundColor: '#EAF0F5' },
  map: { flex: 1, backgroundColor: '#EAF0F5' },
  mapState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  mapStateText: { fontSize: 11, color: '#637269' },
  errorText: { fontSize: 11, color: '#D14343', fontWeight: '700', textAlign: 'center', padding: 20 },
  legend: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 12, padding: 10, gap: 7, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 9, color: '#334155', fontWeight: '800' },
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
