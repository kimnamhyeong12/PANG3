import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library/legacy';

// Every entry comes from MediaStore, so its ID can be used to read original GPS.
export default function PhotoLibraryPicker({ maxSelection = 20, limited, onCancel, onSelect }) {
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const cursor = useRef(null);
  const loadingRef = useRef(false);
  const active = useRef(true);
  const { width } = useWindowDimensions();

  const load = async () => {
    if (loadingRef.current || !active.current) return;
    loadingRef.current = true;
    setLoading(true); setError('');
    try {
      const page = await MediaLibrary.getAssetsAsync({
        first: 60, mediaType: ['photo'], sortBy: [['creationTime', false]],
        ...(cursor.current ? { after: cursor.current } : {}),
      });
      if (!active.current) return;
      setAssets(previous => {
        const known = new Set(previous.map(asset => asset.id));
        return [...previous, ...page.assets.filter(asset => asset.id && asset.uri && !known.has(asset.id))];
      });
      const next = page.endCursor;
      setHasMore(Boolean(page.hasNextPage && next && next !== cursor.current));
      cursor.current = next;
    } catch {
      if (active.current) setError('사진 목록을 읽지 못했습니다. 사진 접근 권한을 확인한 뒤 다시 시도해 주세요.');
    } finally {
      loadingRef.current = false;
      if (active.current) setLoading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    load();
    return () => { active.current = false; };
  }, []);

  const toggle = (asset) => setSelected(previous => {
    if (previous.some(entry => entry.id === asset.id)) return previous.filter(entry => entry.id !== asset.id);
    if (previous.length >= maxSelection) return previous;
    return [...previous, asset];
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>원본 사진 선택</Text>
          <TouchableOpacity onPress={onCancel} accessibilityRole="button"><Text style={styles.link}>취소</Text></TouchableOpacity>
        </View>
        <Text style={styles.description}>최근 사진부터 표시합니다. 최대 {maxSelection}장까지 선택한 뒤 위치를 확인하세요.</Text>
        {limited && <Text style={styles.description}>허용한 사진만 표시됩니다. 다른 사진이 필요하면 앱 설정에서 사진 접근 범위를 변경해 주세요.</Text>}
        <FlatList
          data={assets} extraData={selected} numColumns={3} keyExtractor={asset => asset.id}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => {
            const order = selected.findIndex(asset => asset.id === item.id);
            const atLimit = order < 0 && selected.length >= maxSelection;
            return <TouchableOpacity
              style={[styles.tile, { width: (width - 32) / 3 }, atLimit && styles.disabled]}
              disabled={atLimit} onPress={() => toggle(item)} accessibilityRole="checkbox"
              accessibilityState={{ checked: order >= 0, disabled: atLimit }}
              accessibilityLabel={item.filename || '사진'}>
              <Image source={{ uri: item.uri }} style={styles.image} />
              {order >= 0 && <View style={styles.selection}><Text style={styles.selectionText}>{order + 1}</Text></View>}
            </TouchableOpacity>;
          }}
          ListEmptyComponent={!loading && !error ? <Text style={styles.description}>접근 가능한 사진이 없습니다. 앱의 사진 접근 범위를 확인해 주세요.</Text> : null}
          ListFooterComponent={<View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            {loading ? <ActivityIndicator color="#2477F3" /> : (hasMore || error) && <TouchableOpacity onPress={load} style={styles.loadMore}><Text style={styles.link}>{error ? '다시 시도' : '사진 더 보기'}</Text></TouchableOpacity>}
          </View>}
        />
        <TouchableOpacity style={[styles.button, !selected.length && styles.disabled]} disabled={!selected.length}
          onPress={() => onSelect(selected)} accessibilityRole="button">
          <Text style={styles.buttonText}>선택한 {selected.length}장 위치 확인</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F9' },
  header: { padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF' },
  title: { fontSize: 19, fontWeight: '700', color: '#10285B' },
  description: { margin: 12, color: '#5C6675', lineHeight: 20 },
  grid: { padding: 10 },
  tile: { aspectRatio: 1, margin: 2, backgroundColor: '#E8ECF2', borderRadius: 6, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  selection: { position: 'absolute', right: 5, top: 5, borderRadius: 15, backgroundColor: '#2477F3', minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  selectionText: { color: '#FFF', fontWeight: '700' },
  disabled: { opacity: 0.45 },
  link: { color: '#2477F3', padding: 8 },
  loadMore: { alignItems: 'center', padding: 12 },
  error: { margin: 12, color: '#A62B2B' },
  button: { backgroundColor: '#2477F3', margin: 16, padding: 16, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
