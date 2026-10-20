import * as MediaLibrary from 'expo-media-library/legacy';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mergeOriginalPhotoPage, originalPhotoAsset } from '../utils/originalPhotoAssets';

// Android's system picker may omit assetId and return only a cache URI.
// Selecting actual MediaLibrary assets keeps the original ID and photo paired.
export default function OriginalPhotoPicker({ visible, maximum = 20, onCancel, onConfirm }) {
  const [assets, setAssets] = useState([]);
  const [chosen, setChosen] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasNext, setHasNext] = useState(true);
  const cursor = useRef(null);
  const generation = useRef(0);
  const fetching = useRef(false);

  const load = async (reset = false) => {
    if (fetching.current || (!reset && !hasNext)) return;
    fetching.current = true; setLoading(true); setError('');
    const version = generation.current;
    try {
      const page = await MediaLibrary.getAssetsAsync({ first: 60, mediaType: ['photo'],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        ...(reset || !cursor.current ? {} : { after: cursor.current }) });
      if (version !== generation.current) return;
      setAssets(previous => mergeOriginalPhotoPage(reset ? [] : previous, page.assets));
      const canAdvance = !!page.endCursor && page.endCursor !== cursor.current;
      cursor.current = page.endCursor;
      setHasNext(page.hasNextPage && canAdvance);
    } catch {
      if (version === generation.current) setError('원본 사진 목록을 읽지 못했습니다. 앱에 허용된 사진이 있는지 확인하고 다시 불러와 주세요.');
    } finally {
      if (version === generation.current) { fetching.current = false; setLoading(false); }
    }
  };
  useEffect(() => {
    generation.current++;
    fetching.current = false;
    if (visible) {
      cursor.current = null; setAssets([]); setChosen({}); setHasNext(true);
      load(true);
    }
    return () => { generation.current++; };
  }, [visible]);

  const count = Object.keys(chosen).length;
  const toggle = asset => {
    if (!chosen[asset.id] && count >= maximum) {
      Alert.alert('선택 장수 안내', `한 번에 ${maximum}장까지 선택할 수 있습니다.`); return;
    }
    setChosen(previous => {
      const next = { ...previous };
      if (next[asset.id]) delete next[asset.id]; else next[asset.id] = asset;
      return next;
    });
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>원본 사진 선택 · {count}/{maximum}</Text>
        <TouchableOpacity onPress={onCancel}><Text style={styles.link}>취소</Text></TouchableOpacity>
      </View>
      <Text style={styles.description}>원본 사진의 위치를 조회합니다. 최근 사진부터 표시하며, 선택을 마친 뒤 실제 GPS를 확인합니다.</Text>
      <FlatList data={assets} numColumns={3} keyExtractor={asset => asset.id} extraData={chosen}
        renderItem={({ item }) => <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !!chosen[item.id] }}
          accessibilityLabel={item.filename || '원본 사진'} style={[styles.cell, chosen[item.id] && styles.chosen]} onPress={() => toggle(item)}>
          <Image source={{ uri: item.uri }} style={styles.image} />
          <Text numberOfLines={1} style={styles.filename}>{chosen[item.id] ? '✓ ' : ''}{item.filename}</Text>
        </TouchableOpacity>}
        ListEmptyComponent={!loading && !error ? <Text style={styles.description}>접근 가능한 사진이 없습니다. 선택한 사진만 허용했다면 앱 권한 설정에서 대상 사진을 추가해 주세요.</Text> : null}
        ListFooterComponent={<View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          {loading ? <ActivityIndicator /> : (hasNext || !!error) && <TouchableOpacity style={styles.button} onPress={() => load(!assets.length)}>
            <Text style={styles.buttonText}>{error ? '다시 불러오기' : '다음 사진 더 보기'}</Text>
          </TouchableOpacity>}
        </View>} />
      <TouchableOpacity disabled={!count} style={[styles.button, !count && styles.disabled]}
        onPress={() => {
          try { onConfirm(Object.values(chosen).map(originalPhotoAsset)); }
          catch (failure) { Alert.alert('사진 확인 실패', failure.message); }
        }}><Text style={styles.buttonText}>선택한 {count}장 GPS 확인</Text></TouchableOpacity>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6F9', padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#10285B' },
  link: { color: '#2477F3', padding: 8 },
  description: { color: '#5C6675', lineHeight: 21, marginVertical: 8 },
  cell: { width: '31.3%', margin: '1%', padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 8 },
  chosen: { borderColor: '#2477F3' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#E8ECF2', borderRadius: 4 },
  filename: { fontSize: 11, color: '#23344D', paddingVertical: 4 },
  button: { backgroundColor: '#2477F3', padding: 15, borderRadius: 10, alignItems: 'center', marginVertical: 8 },
  buttonText: { color: 'white', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  error: { color: '#A62B2B', marginVertical: 8, lineHeight: 21 },
});
