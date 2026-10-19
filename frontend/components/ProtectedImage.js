import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import { localImageForEditing } from '../utils/auth';

export default function ProtectedImage({ source, ...props }) {
  const uri = typeof source?.uri === 'string' ? source.uri : '';
  const [load, setLoad] = useState(null);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const attempt = ++request.current;
    let active = true;
    setLoad(null);
    if (!uri) return () => { active = false; };
    // Do not mount a native Image until its asynchronous file download is ready.
    // An undefined source can otherwise resolve to the app bundle on iOS.
    Promise.resolve().then(() => localImageForEditing(uri)).then(localUri => {
      if (!active) return;
      if (typeof localUri !== 'string' || !localUri.trim()) throw new Error('사진 경로가 비어 있습니다.');
      setLoad({ uri, attempt, source: { ...source, uri: localUri }, error: false });
    }).catch(failure => {
      if (!active) return;
      setLoad({ uri, attempt, error: true });
      console.warn('[ProtectedImage] 사진 불러오기 실패:', failure?.message);
    });
    return () => { active = false; if (request.current === attempt) request.current++; };
  }, [uri, retry]);
  if (typeof source === 'number') return <Image {...props} source={source} />;
  if (!uri || (load?.uri === uri && load.error)) return (
    <View style={[props.style, styles.placeholder]}>
      <Text>사진을 불러오지 못했습니다.</Text>
      {!!uri && <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text>다시 불러오기</Text></TouchableOpacity>}
    </View>
  );
  if (!load || load.uri !== uri || !load.source?.uri) return (
    <View style={[props.style, styles.placeholder]}>
      <ActivityIndicator color="#2477F3" />
      <Text>사진을 불러오는 중...</Text>
    </View>
  );
  return <Image {...props} source={load.source} onError={event => {
    if (request.current !== load.attempt) return;
    console.warn('[ProtectedImage] 이미지 표시 실패:', event.nativeEvent?.error);
    setLoad(previous => previous?.attempt === load.attempt ? { ...previous, error: true } : previous);
    props.onError?.(event);
  }} />;
}

const styles = { placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8 } };
