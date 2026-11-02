import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { reportMarkerLayoutSource } from '../utils/mapMarkerLayout';
import { colors } from '../constants/design';
import { SecondaryButton } from './ui';

export function projectReportMarkers(items) {
  return items.map((item, index) => ({ n: index + 1, lat: item.lat, lng: item.lng, title: item.title || '' }))
    .filter(point => point.lat != null && point.lng != null && point.lat !== '' && point.lng !== '' && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180)
    .map(point => ({ ...point, lat: Number(point.lat), lng: Number(point.lng) }));
}
export function projectReportMapHtml(markers, key) {
  const data = JSON.stringify(markers).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
  html,body,#map{width:100%;height:100%;margin:0;overflow:hidden;background:#E8F2FF}.pin{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:3px solid #2477F3;background:white;color:#10285B;font:bold 14px sans-serif;box-shadow:0 2px 5px #10285B44}
  </style><script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false" onerror="window.ReactNativeWebView.postMessage('MAP_ERROR')"></script></head><body><div id="map"></div><script>
  ${reportMarkerLayoutSource}
  var markers=${data};
  function fail(){window.ReactNativeWebView.postMessage('MAP_ERROR');}
  if(!window.kakao || !window.kakao.maps) fail(); else kakao.maps.load(function(){
    try{
      var box=document.getElementById('map'),map=new kakao.maps.Map(box,{center:new kakao.maps.LatLng(markers[0].lat,markers[0].lng),level:4});
      var bounds=new kakao.maps.LatLngBounds(), overlays=[];
      markers.forEach(function(p){bounds.extend(new kakao.maps.LatLng(p.lat,p.lng));});
      map.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT);
      function draw(){
        overlays.forEach(function(o){o.setMap(null);});overlays=[];
        var projection=map.getProjection();
        var points=markers.map(function(p){var pixel=projection.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng));return {n:p.n,x:pixel.x,y:pixel.y};});
        layoutReportMarkers(points,box.clientWidth,box.clientHeight).forEach(function(label){
          var original=markers.find(function(p){return p.n===label.point.n;}), node=document.createElement('div');node.className='pin';node.textContent=original.n;node.title=original.title;
          var point=projection.coordsFromContainerPoint(new kakao.maps.Point(label.x,label.y));
          var pin=new kakao.maps.CustomOverlay({map:map,position:point,content:node,xAnchor:0.5,yAnchor:0.5,zIndex:10});overlays.push(pin);
          if(label.moved){var line=new kakao.maps.Polyline({map:map,path:[new kakao.maps.LatLng(original.lat,original.lng),point],strokeWeight:2,strokeColor:'#2477F3'});overlays.push(line);}
        });
      }
      kakao.maps.event.addListener(map,'idle',draw);
      if(markers.length>1)map.setBounds(bounds,48,36,48,36);draw();
      window.ReactNativeWebView.postMessage('MAP_READY');
    }catch(error){fail();}
  });</script></body></html>`;
}

export default function ProjectReportMap({ items }) {
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const markers = projectReportMarkers(items);
  const signature = JSON.stringify(markers);
  useEffect(() => { setFailed(false); }, [signature]);
  const source = useMemo(() => ({ html: projectReportMapHtml(JSON.parse(signature), process.env.EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY || ''), baseUrl: 'https://localhost/' }), [signature, retry]);
  if (!markers.length) return <Text style={{ color: colors.textSoft, fontSize: 12 }}>표시할 위치 정보가 없습니다.</Text>;
  return <View style={{ gap: 10 }}>
    {failed ? <><Text style={{ color: colors.textSoft }}>지도를 불러오지 못했습니다.</Text><SecondaryButton title="지도 다시 불러오기" onPress={() => { setFailed(false); setRetry(n => n + 1); }}/></> : <View style={{ height: 300, borderRadius: 14, overflow: 'hidden' }}><WebView key={signature + retry} source={source} originWhitelist={['*']} javaScriptEnabled domStorageEnabled scrollEnabled={false} nestedScrollEnabled onError={() => setFailed(true)} onMessage={event => { if (event.nativeEvent.data === 'MAP_ERROR') setFailed(true); }}/></View>}
  </View>;
}
