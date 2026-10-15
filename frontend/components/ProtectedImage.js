import React, { useEffect, useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { localImageForEditing } from '../utils/auth';

export default function ProtectedImage({ source, ...props }) {
  const [resolved, setResolved] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setResolved(null);
    setError(false);
    // Fetch through the session client so expiry/401 recovery also applies to
    // photos. Native image loaders do not participate in that lifecycle.
    localImageForEditing(source?.uri).then(uri => { if (active) setResolved({ ...source, uri }); }).catch(failure => {
      if (active) setError(true);
      console.warn('[ProtectedImage] 사진 불러오기 실패:', failure.message);
    });
    return () => { active = false; };
  }, [source?.uri, retry]);
  if (error) return <View style={[props.style, { alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
    <Text>사진을 불러오지 못했습니다.</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(value => value + 1)}><Text>다시 불러오기</Text></TouchableOpacity>
  </View>;
  return <Image {...props} source={resolved || undefined} onError={event => {
    console.warn('[ProtectedImage] 이미지 표시 실패:', event.nativeEvent?.error);
    setError(true);
    props.onError?.(event);
  }} />;
}
