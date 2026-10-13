import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { PlaceRow } from './PlaceSearchOverlay';
import { isRegisteredPlace, sheetDrag } from '../utils/placeSearch';

export default function SearchResultSheet({ height, results, query, locations, onPick, onAdd }) {
  const maxHeight = Math.max(180, height - 100); const collapsed = Math.max(0, maxHeight - height * 0.40);
  const y = useRef(new Animated.Value(collapsed)).current; const list = useRef(null);
  const metrics = useRef({ y: collapsed, scroll: 0, maxScroll: 0, collapsed, startY: collapsed, startScroll: 0 });
  const [expanded, setExpanded] = useState(false); const [contentHeight, setContentHeight] = useState(0); const [viewport, setViewport] = useState(0);
  metrics.current.collapsed = collapsed; metrics.current.maxScroll = Math.max(0, contentHeight - viewport);
  useEffect(() => { metrics.current.y = collapsed; metrics.current.scroll = 0; y.setValue(collapsed); list.current?.scrollTo({ y: 0, animated: false }); setExpanded(false); }, [query, collapsed]);
  const move = (position, scroll) => { const m = metrics.current; m.y = position; m.scroll = scroll; y.setValue(position); list.current?.scrollTo({ y: scroll, animated: false }); setExpanded(position < 1); };
  const snap = target => { metrics.current.y = target; setExpanded(target === 0); Animated.spring(y, { toValue: target, useNativeDriver: true, overshootClamping: true }).start(); };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 5 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => { y.stopAnimation(value => { metrics.current.y = value; metrics.current.startY = value; }); metrics.current.startScroll = metrics.current.scroll; },
    onPanResponderMove: (_, g) => { const m = metrics.current; const next = sheetDrag(m.startY, m.startScroll, g.dy, m.collapsed, m.maxScroll); move(next.y, next.scroll); },
    onPanResponderRelease: (_, g) => { const m = metrics.current; if (m.y > 0) snap(g.vy < -0.3 ? 0 : g.vy > 0.3 ? m.collapsed : m.y < m.collapsed / 2 ? 0 : m.collapsed); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { const m = metrics.current; if (m.y > 0) snap(m.y < m.collapsed / 2 ? 0 : m.collapsed); },
  }), []);
  return <Animated.View {...pan.panHandlers} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: maxHeight, zIndex: 35, backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, elevation: 8, transform: [{ translateY: y }] }}>
    <TouchableOpacity onPress={() => snap(expanded ? collapsed : 0)} accessibilityLabel={expanded ? '검색 결과 시트 내리기' : '검색 결과 시트 펼치기'} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}><View style={{ height: 5, width: 42, borderRadius: 4, backgroundColor: '#D7DFE7' }} /><Text style={{ color: '#101820', fontWeight: '700', marginTop: 10 }}>검색 결과 {results.length}건</Text></TouchableOpacity>
    <ScrollView ref={list} scrollEnabled={false} keyboardShouldPersistTaps="handled" onLayout={event => setViewport(event.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setContentHeight(h)} accessibilityActions={[{ name: 'increment', label: '다음 검색 결과' }, { name: 'decrement', label: '이전 검색 결과' }]} onAccessibilityAction={event => { const m = metrics.current; move(0, Math.max(0, Math.min(m.maxScroll, m.scroll + (event.nativeEvent.actionName === 'increment' ? 100 : -100)))); }}>
      {results.map(place => <PlaceRow key={`${place.id}:${place.x}:${place.y}`} place={place} query={query} registered={isRegisteredPlace(place, locations)} onPress={() => { snap(collapsed); onPick(place); }} onAdd={() => onAdd(place)} />)}
      <View style={{ height: 28 }} />
    </ScrollView>
  </Animated.View>;
}
