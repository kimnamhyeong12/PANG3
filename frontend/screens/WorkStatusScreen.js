import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

const buildMapHtml = ({ boundaries, assignments, memberColors }) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<style>
html,body,#map{width:100%;height:100%;margin:0;padding:0;overflow:hidden}body{background:#eaf0f5;font-family:Arial,sans-serif}
.area-label{padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.93);box-shadow:0 2px 8px rgba(0,0,0,.18);color:#17324b;font-size:11px;font-weight:800;line-height:1.35;text-align:center;white-space:nowrap}
.pin{width:30px;height:38px;position:relative;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}.pin-body{width:28px;height:28px;border-radius:50% 50% 50% 0;border:3px solid #fff;transform:rotate(-45deg);box-sizing:border-box}.pin-body:after{content:'';position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;left:8px;top:8px}
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JAVASCRIPT_KEY || ''}&autoload=false"></script>
</head><body><div id="map"></div><script>
const boundaries=${safeJson(boundaries || { type: 'FeatureCollection', features: [] })};
const assignments=${safeJson(assignments || [])};
const memberColors=${safeJson(memberColors || {})};
const statusColors={pending:'#E53935',working:'#F5B400',complete:'#16A05D'};
function statusOf(v){v=String(v||'pending').toLowerCase();if(['complete','completed','done'].includes(v))return'complete';if(['working','progress','in_progress'].includes(v))return'working';return'pending'}
function shortName(v){const p=String(v||'').trim().split(/\\s+/);return(p[p.length-1]||'').replace(/제(?=\\d+동$)/,'')}
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function post(v){window.ReactNativeWebView.postMessage(JSON.stringify(v))}
kakao.maps.load(function(){
 const map=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(35.1046,128.9747),level:7});
 const bounds=new kakao.maps.LatLngBounds();let hasBounds=false;const byArea={};
 assignments.forEach(i=>{const a=shortName(i.adminDong||i.admin_dong);if(a)(byArea[a]||(byArea[a]=[])).push(i)});
 function addRing(feature,ring){
  const area=shortName(feature.properties&&feature.properties.adm_nm),items=byArea[area]||[];if(!items.length||!Array.isArray(ring))return;
  const owner=items[0],color=memberColors[String(owner.assigneeUserId||'unknown')]||'#2E8BFF';
  const path=ring.map(p=>{const ll=new kakao.maps.LatLng(Number(p[1]),Number(p[0]));bounds.extend(ll);hasBounds=true;return ll});
  const polygon=new kakao.maps.Polygon({path,strokeWeight:2,strokeColor:color,strokeOpacity:1,fillColor:color,fillOpacity:.2});polygon.setMap(map);
  kakao.maps.event.addListener(polygon,'click',()=>post({type:'AREA_SELECT',area}));
  let lat=0,lng=0;path.forEach(p=>{lat+=p.getLat();lng+=p.getLng()});const center=new kakao.maps.LatLng(lat/path.length,lng/path.length);
  new kakao.maps.CustomOverlay({map,position:center,content:'<div class="area-label">'+esc(area)+'<br/>담당자 '+esc(owner.assigneeName||owner.assigneeLoginId||'미지정')+'</div>',yAnchor:.5,zIndex:2});
 }
 (boundaries.features||[]).forEach(f=>{const g=f.geometry||{};if(g.type==='Polygon'&&g.coordinates&&g.coordinates[0])addRing(f,g.coordinates[0]);else if(g.type==='MultiPolygon')(g.coordinates||[]).forEach(p=>p[0]&&addRing(f,p[0]))});
 assignments.forEach(i=>{const lat=Number(i.lat!=null?i.lat:i.latitude),lng=Number(i.lng!=null?i.lng:i.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const s=statusOf(i.status||i.taskStatus),position=new kakao.maps.LatLng(lat,lng);bounds.extend(position);hasBounds=true;const content=document.createElement('div');content.className='pin';content.innerHTML='<div class="pin-body" style="background:'+statusColors[s]+'"></div>';content.onclick=()=>post({type:'VISIT_SELECT',taskId:i.taskId,area:shortName(i.adminDong||i.admin_dong)});new kakao.maps.CustomOverlay({map,position,content,yAnchor:1,zIndex:5})});
 if(hasBounds)map.setBounds(bounds,35,35,35,35);
});
</script></body></html>`;

export default function WorkStatusScreen({ user, group, assignments = [], onBack, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const [loadingBoundary, setLoadingBoundary] = useState(true);
  const [boundaryError, setBoundaryError] = useState('');
  const [boundaries, setBoundaries] = useState({ type: 'FeatureCollection', features: [] });
  const [resolvedAssignments, setResolvedAssignments] = useState(assignments);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const isLeader = group?.role === 'LEADER';

  const loadBoundaries = useCallback(async () => {
    setLoadingBoundary(true);
    setBoundaryError('');
    try {
      const data = await groupApi('/api/sgis/sahagu-boundaries');
      setBoundaries(data?.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: [] });
    } catch (error) {
      setBoundaryError(error.message || '행정동 경계를 불러오지 못했습니다.');
    } finally {
      setLoadingBoundary(false);
    }
  }, []);

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

  const selectedItems = useMemo(() => selectedArea ? visibleAssignments.filter((i) => shortAreaName(i.adminDong || i.admin_dong) === selectedArea) : [], [selectedArea, visibleAssignments]);
  const selectedAssignment = useMemo(() => visibleAssignments.find((i) => Number(i.taskId) === Number(selectedTaskId)) || null, [selectedTaskId, visibleAssignments]);
  const mapHtml = useMemo(() => buildMapHtml({ boundaries, assignments: visibleAssignments, memberColors }), [boundaries, visibleAssignments, memberColors]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([onRefresh?.(), loadBoundaries()]); } finally { setRefreshing(false); }
  }, [loadBoundaries, onRefresh]);

  const selectedComplete = selectedItems.filter((i) => normalizeStatus(i.status || i.taskStatus) === 'complete').length;
  const selectedWorking = selectedItems.filter((i) => normalizeStatus(i.status || i.taskStatus) === 'working').length;
  const selectedOwner = selectedItems[0]?.assigneeName || selectedItems[0]?.assigneeLoginId || '담당자 미지정';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>TEAM STATUS</Text>
          <Text style={styles.title}>{isLeader ? '팀 작업현황' : '내 담당 업무'}</Text>
          <Text style={styles.desc}>{group?.groupName || '현재 그룹'} · {isLeader ? '팀장 화면' : '팀원 화면'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.summaryCard}>
          <Summary value={visibleAssignments.length} label="전체" />
          <View style={styles.summaryDivider} /><Summary value={counts.pending} label="작업 전" color="#FFB6B6" />
          <View style={styles.summaryDivider} /><Summary value={counts.working} label="작업 중" color="#FFE08A" />
          <View style={styles.summaryDivider} /><Summary value={counts.complete} label="완료" color="#8DE0AD" />
        </View>

        <View style={styles.mapCard}>
          {loadingBoundary ? (
            <View style={styles.mapState}><ActivityIndicator color="#123F63" /><Text style={styles.mapStateText}>행정동 경계를 불러오는 중입니다.</Text></View>
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
              style={styles.map}
              onMessage={(event) => {
                try {
                  const message = JSON.parse(event.nativeEvent.data);
                  if (message.type === 'AREA_SELECT') { setSelectedArea(message.area || null); setSelectedTaskId(null); }
                  if (message.type === 'VISIT_SELECT') { setSelectedArea(message.area || null); setSelectedTaskId(message.taskId || null); }
                } catch (_error) {}
              }}
            />
          )}
          <View style={styles.legend} pointerEvents="none">
            {Object.entries(STATUS).map(([key, value]) => <View key={key} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: value.color }]} /><Text style={styles.legendText}>{value.label}</Text></View>)}
          </View>
        </View>

        {!!boundaryError && <Text style={styles.boundaryWarning}>경계 표시 오류: {boundaryError}</Text>}

        <View style={styles.detailCard}>
          {selectedAssignment ? (
            <View style={styles.detailHeadingRow}>
              <View style={[styles.ownerDot, { backgroundColor: memberColors[String(selectedAssignment.assigneeUserId)] || '#2E8BFF' }]} />
              <View style={{ flex: 1 }}><Text style={styles.detailTitle}>{selectedAssignment.detailAddress || selectedAssignment.roadAddress || `방문지 ${selectedAssignment.taskId}`}</Text><Text style={styles.detailMeta}>{shortAreaName(selectedAssignment.adminDong || selectedAssignment.admin_dong) || '행정동 확인 중'} · {selectedAssignment.assigneeName || selectedAssignment.assigneeLoginId || '담당자 미지정'}</Text></View>
              <Text style={[styles.statusText, { color: STATUS[normalizeStatus(selectedAssignment.status || selectedAssignment.taskStatus)].color }]}>{STATUS[normalizeStatus(selectedAssignment.status || selectedAssignment.taskStatus)].label}</Text>
            </View>
          ) : selectedArea && selectedItems.length ? (
            <><Text style={styles.detailTitle}>{selectedArea} · {selectedOwner}</Text><Text style={styles.detailMeta}>{selectedItems.length}곳 중 {selectedComplete}곳 완료 · {selectedWorking}곳 진행 중</Text><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round((selectedComplete / selectedItems.length) * 100)}%` }]} /></View><Text style={styles.hint}>구역 또는 마커를 눌러 상세 내용을 확인하세요.</Text></>
          ) : (
            <><Text style={styles.detailTitle}>담당 구역을 선택하세요</Text><Text style={styles.detailMeta}>지도에서 색칠된 행정동이나 방문지 마커를 누르세요.</Text></>
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
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderBottomWidth: 1, borderBottomColor: '#D9E1EA' },
  eyebrow: { fontSize: 10, fontWeight: '900', color: '#607086', letterSpacing: 1.6 },
  title: { fontSize: 20, fontWeight: '900', color: '#1F2D3D' },
  desc: { fontSize: 10, color: '#718096', marginTop: 2 },
  body: { padding: 14, gap: 12, paddingBottom: 30 },
  summaryCard: { backgroundColor: '#123F63', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { color: '#BFD0DE', fontSize: 9, fontWeight: '800', marginTop: 4 },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#315779' },
  mapCard: { height: 470, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: '#D9E1EA', backgroundColor: '#EAF0F5' },
  map: { flex: 1, backgroundColor: '#EAF0F5' },
  mapState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  mapStateText: { fontSize: 11, color: '#607086' },
  errorText: { fontSize: 11, color: '#D14343', fontWeight: '700', textAlign: 'center', padding: 20 },
  legend: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 12, padding: 10, gap: 7, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 9, color: '#334155', fontWeight: '800' },
  boundaryWarning: { fontSize: 10, lineHeight: 15, color: '#B45309', backgroundColor: '#FFF8E6', borderRadius: 10, padding: 10 },
  detailCard: { minHeight: 106, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#D9E1EA' },
  detailHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ownerDot: { width: 12, height: 12, borderRadius: 6 },
  detailTitle: { fontSize: 14, fontWeight: '900', color: '#1F2D3D' },
  detailMeta: { fontSize: 10, color: '#718096', marginTop: 5 },
  statusText: { fontSize: 10, fontWeight: '900' },
  progressTrack: { height: 7, backgroundColor: '#E5E7EB', borderRadius: 5, overflow: 'hidden', marginTop: 13 },
  progressFill: { height: '100%', backgroundColor: '#16A05D', borderRadius: 5 },
  hint: { fontSize: 9, color: '#8A98A9', marginTop: 10 },
});
