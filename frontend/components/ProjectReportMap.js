import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { projectReportMarkerLayerSource, projectReportPinSource, projectReportPinCss } from '../utils/projectReportMarkerSource';
import { stableMapViewportSource } from '../utils/stableMapViewport';
import { colors } from '../constants/design';
import { SecondaryButton } from './ui';

const AUTHOR_COLORS = ['#2477F3', '#12A9A5', '#BE9446', '#7A5BD6', '#E34D59', '#1551A6', '#C87973', '#078A88'];
export function projectReportAuthors(items) {
  const authors = new Map();
  items.forEach(item => { const name = item.author?.name ?? item.authorName ?? '-'; if (!authors.has(name)) authors.set(name, AUTHOR_COLORS[authors.size % AUTHOR_COLORS.length]); });
  return authors;
}
export function projectReportMarkers(items) {
  const authors = projectReportAuthors(items);
  return items.map((item, index) => ({ n: index + 1, lat: item.lat, lng: item.lng, title: item.title || '', color: authors.get(item.author?.name ?? item.authorName ?? '-') }))
    .filter(point => point.lat != null && point.lng != null && point.lat !== '' && point.lng !== '' && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180)
    .map(point => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }));
}
export function projectReportMapHtml(markers, key) {
  const data = JSON.stringify(markers).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
  :root{--green:#1E9A6C}html,body,#map{width:100%;height:100%;margin:0;overflow:hidden;background:#E8F2FF;font-family:sans-serif}
  ${projectReportPinCss}
  </style><script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false" onerror="window.ReactNativeWebView.postMessage('MAP_ERROR')"></script></head><body><div id="map"></div><script>
  ${projectReportMarkerLayerSource}
  ${projectReportPinSource}
  ${stableMapViewportSource}
  var markers=${data};
  function fail(){window.ReactNativeWebView.postMessage('MAP_ERROR');}
  if(!window.kakao || !window.kakao.maps) fail(); else kakao.maps.load(function(){
    try{
      var box=document.getElementById('map'),map=new kakao.maps.Map(box,{center:new kakao.maps.LatLng(markers.length?markers[0].lat:36.3,markers.length?markers[0].lng:127.8),level:5});
      var bounds=null,layer=null,active=null,coordinateKey='';
      map.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT);
      var viewport=createStableMapViewport(map,box,function(){
        if(!markers.length)return false;
        if(markers.length>1)map.setBounds(bounds,72,64,72,64);
        else{map.setLevel(5);map.setCenter(new kakao.maps.LatLng(markers[0].lat,markers[0].lng));}
      });
      window.updateReportMarkers=function(next){
        markers=next||[];
        var key=markers.map(function(p){return p.n+':'+p.lat+':'+p.lng;}).join('|');
        bounds=new kakao.maps.LatLngBounds();
        markers.forEach(function(p){bounds.extend(new kakao.maps.LatLng(p.lat,p.lng));});
        if(layer)layer.destroy();
        layer=createReportMarkerLayer(map,kakao,box,markers,pinElement,function(n){
          active=n;layer.setActive(n);
          window.ReactNativeWebView.postMessage(JSON.stringify({type:'REPORT_MARKER_PICK',n:n}));
        },active);
        if(key!==coordinateKey){coordinateKey=key;viewport.requestFit();}
      };
      window.setReportActiveMarker=function(n){active=n;if(layer)layer.setActive(n);};
      window.relayoutReportMap=function(){viewport.relayout();};
      window.updateReportMarkers(markers);
      window.ReactNativeWebView.postMessage('MAP_READY');
    }catch(error){fail();}
  });</script></body></html>`;
}

export default function ProjectReportMap({ items, activeN = null, onPick }) {
  const view = useRef(null), selection = useRef(activeN), latestMarkers = useRef([]), ready = useRef(false); selection.current = activeN;
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const markers = projectReportMarkers(items);
  const signature = JSON.stringify(markers);
  latestMarkers.current = markers;
  useEffect(() => { setFailed(false); }, [signature]);
  useEffect(() => { view.current?.injectJavaScript(`window.setReportActiveMarker?.(${JSON.stringify(activeN)});true;`); }, [activeN, signature]);
  useEffect(() => { if (ready.current) view.current?.injectJavaScript(`window.updateReportMarkers?.(${JSON.stringify(markers).replace(/</g, '\\u003c')});true;`); }, [signature]);
  const source = useMemo(() => ({ html: projectReportMapHtml([], process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || ''), baseUrl: 'https://localhost/' }), []);
  if (!markers.length) return <Text style={{ color: colors.textSoft, fontSize: 12 }}>표시할 위치 정보가 없습니다.</Text>;
  return <View style={{ gap: 10 }}>
    {failed ? <><Text style={{ color: colors.textSoft }}>지도를 불러오지 못했습니다.</Text><SecondaryButton title="지도 다시 불러오기" onPress={() => { setFailed(false); setRetry(n => n + 1); }}/></> : <View style={{ height: 300, borderRadius: 14, overflow: 'hidden' }}><WebView ref={view} key={retry} source={source} originWhitelist={['*']} javaScriptEnabled domStorageEnabled scrollEnabled={false} nestedScrollEnabled onLoadStart={() => { ready.current = false; }} onLayout={() => view.current?.injectJavaScript('window.relayoutReportMap?.();true;')} onError={() => setFailed(true)} onMessage={event => {
        const data = event.nativeEvent.data;
        if (data === 'MAP_ERROR') { setFailed(true); return; }
        if (data === 'MAP_READY') { ready.current = true; view.current?.injectJavaScript(`window.updateReportMarkers?.(${JSON.stringify(latestMarkers.current).replace(/</g, '\\u003c')});window.setReportActiveMarker?.(${JSON.stringify(selection.current)});true;`); return; }
        try { const message = JSON.parse(data); if (message.type === 'REPORT_MARKER_PICK' && Number.isInteger(message.n)) onPick?.(message.n); } catch {}
      }}/></View>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{[...projectReportAuthors(items)].map(([name, color]) => <View key={name} style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: color }}/><Text style={{ color: colors.textSoft, fontSize: 12 }}>{name}</Text></View>)}</View>
  </View>;
}
