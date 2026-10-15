import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { PlaceRow } from './PlaceSearchOverlay';
import { isRegisteredPlace, sheetDrag } from '../utils/placeSearch';

export default function SearchResultSheet({ height, results, query, locations, onPick, onAdd }) {
  const maxHeight = Math.max(180, height - 100); const collapsed = Math.max(0, maxHeight - height * 0.50);
  const y = useRef(new Animated.Value(collapsed)).current; const list = useRef(null);
  const metrics = useRef({ y: collapsed, scroll: 0, maxScroll: 0, collapsed, startY: collapsed, startScroll: 0 });
  const [expanded, setExpanded] = useState(false); const [contentHeight, setContentHeight] = useState(0); const [viewport, setViewport] = useState(0);
  const [listAtTop, setListAtTop] = useState(true);
  metrics.current.collapsed = collapsed; metrics.current.maxScroll = Math.max(0, contentHeight - viewport);
  useEffect(() => { metrics.current.y = collapsed; metrics.current.scroll = 0; y.setValue(collapsed); list.current?.scrollTo({ y: 0, animated: false }); setExpanded(false); setListAtTop(true); }, [query, collapsed]);
  const trackScroll = scroll => { metrics.current.scroll = Math.max(0, scroll); setListAtTop(metrics.current.scroll <= 1); };
  const move = (position, scroll) => {
    const m = metrics.current;
    if (m.y !== position) { m.y = position; y.setValue(position); }
    if (m.scroll !== scroll) { trackScroll(scroll); list.current?.scrollTo({ y: scroll, animated: false }); }
  };
  const snap = (target, velocity = 0) => {
    Animated.spring(y, { toValue: target, velocity, stiffness: 240, damping: 28, mass: 1, useNativeDriver: true, overshootClamping: true }).start(({ finished }) => {
      if (finished) { metrics.current.y = target; setExpanded(target === 0); }
    });
  };
  const shouldDrag = (_, g) => {
    if (Math.abs(g.dy) <= 5 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
    const m = metrics.current;
    // At the first row, own both directions across the whole sheet so the
    // native scroller cannot swallow a downward pull starting on a result.
    // Upward pulls still flow into list scrolling through sheetDrag.
    return m.y > 1 || m.scroll <= 1;
  };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: shouldDrag,
    onMoveShouldSetPanResponderCapture: shouldDrag,
    onPanResponderGrant: (_, g) => { metrics.current.startDy = g.dy; y.stopAnimation(value => { metrics.current.y = value; metrics.current.startY = value; }); metrics.current.startScroll = metrics.current.scroll; setExpanded(false); },
    onPanResponderMove: (_, g) => {
      const m = metrics.current; const dy = g.dy - m.startDy;
      const next = sheetDrag(m.startY, m.startScroll, dy, m.collapsed, m.maxScroll);
      const excess = Math.max(0, dy - m.startScroll - (m.collapsed - m.startY));
      // Resist over-pulling instead of stopping abruptly at the lower edge.
      move(next.y + 48 * (1 - Math.exp(-excess / 160)), next.scroll);
    },
    onPanResponderRelease: (_, g) => { const m = metrics.current; snap(g.vy < -0.3 ? 0 : g.vy > 0.3 ? m.collapsed : m.y < m.collapsed / 2 ? 0 : m.collapsed, g.vy); },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { const m = metrics.current; if (m.y > 0) snap(m.y < m.collapsed / 2 ? 0 : m.collapsed); },
  }), []);
  return <Animated.View {...pan.panHandlers} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: maxHeight, zIndex: 35, backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, elevation: 8, transform: [{ translateY: y }] }}>
    <TouchableOpacity onPress={() => snap(expanded ? collapsed : 0)} accessibilityLabel={expanded ? '검색 결과 시트 내리기' : '검색 결과 시트 펼치기'} style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}><View style={{ height: 5, width: 42, borderRadius: 4, backgroundColor: '#D7DFE7' }} /><Text style={{ color: '#101820', fontWeight: '700', marginTop: 10 }}>검색 결과 {results.length}건</Text></TouchableOpacity>
    <ScrollView ref={list} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} scrollEnabled={expanded && !listAtTop} nestedScrollEnabled bounces={false} scrollEventThrottle={16} onScroll={event => trackScroll(event.nativeEvent.contentOffset.y)} keyboardShouldPersistTaps="handled" onLayout={event => setViewport(event.nativeEvent.layout.height)} onContentSizeChange={(_, h) => setContentHeight(h)} accessibilityActions={[{ name: 'increment', label: '다음 검색 결과' }, { name: 'decrement', label: '이전 검색 결과' }]} onAccessibilityAction={event => { const m = metrics.current; move(0, Math.max(0, Math.min(m.maxScroll, m.scroll + (event.nativeEvent.actionName === 'increment' ? 100 : -100)))); setExpanded(true); }}>
      {results.map(place => <PlaceRow key={`${place.id}:${place.x}:${place.y}`} place={place} query={query} registered={isRegisteredPlace(place, locations)} onPress={() => { snap(collapsed); onPick(place); }} onAdd={() => onAdd(place)} />)}
      <View style={{ height: 28 }} />
    </ScrollView>
  </Animated.View>;
}
