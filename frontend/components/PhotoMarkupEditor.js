import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';

const SCREEN = Dimensions.get('window');
const MAX_W = Math.min(SCREEN.width - 24, 520);
const MAX_H = Math.min(SCREEN.height * 0.56, 520);
const HANDLE_VISUAL_SIZE = 26;
const HANDLE_TOUCH_SIZE = 58;
const MIN_CROP = 56;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function fitSize(width, height) {
  if (!width || !height) {
    return { width: MAX_W, height: Math.min(MAX_W * 0.75, MAX_H) };
  }

  const scale = Math.min(MAX_W / width, MAX_H / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export default function PhotoMarkupEditor({ visible, uri, onCancel, onComplete }) {
  const stageRef = useRef(null);
  const cropRef = useRef({ left: 0, top: 0, right: 0, bottom: 0 });
  const displaySizeRef = useRef({ width: 0, height: 0 });
  const penModeRef = useRef(false);

  const [currentUri, setCurrentUri] = useState(uri);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState({ left: 0, top: 0, right: 0, bottom: 0 });
  const [penMode, setPenMode] = useState(false);
  const [paths, setPaths] = useState([]);
  const [activePath, setActivePath] = useState([]);
  const [saving, setSaving] = useState(false);

  const displaySize = useMemo(
    () => fitSize(imageSize.width, imageSize.height),
    [imageSize]
  );

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    displaySizeRef.current = displaySize;
  }, [displaySize]);

  useEffect(() => {
    penModeRef.current = penMode;
  }, [penMode]);

  const resetCrop = (w = displaySize.width, h = displaySize.height) => {
    const inset = 12;
    const nextCrop = {
      left: inset,
      top: inset,
      right: Math.max(inset + MIN_CROP, w - inset),
      bottom: Math.max(inset + MIN_CROP, h - inset),
    };
    cropRef.current = nextCrop;
    setCrop(nextCrop);
  };

  useEffect(() => {
    if (!visible || !uri) return;

    setCurrentUri(uri);
    setPaths([]);
    setActivePath([]);
    setPenMode(false);

    Image.getSize(
      uri,
      (width, height) => setImageSize({ width, height }),
      () => setImageSize({ width: 1200, height: 900 })
    );
  }, [uri, visible]);

  useEffect(() => {
    if (!visible || !displaySize.width || !displaySize.height) return;
    resetCrop(displaySize.width, displaySize.height);
  }, [displaySize.width, displaySize.height, visible]);

  const createHandleResponder = (corner) => {
    let startCrop = null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => !penModeRef.current,
      onStartShouldSetPanResponderCapture: () => !penModeRef.current,
      onMoveShouldSetPanResponder: () => !penModeRef.current,
      onMoveShouldSetPanResponderCapture: () => !penModeRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startCrop = { ...cropRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        if (!startCrop) return;

        const size = displaySizeRef.current;
        const next = { ...startCrop };

        if (corner.includes('left')) {
          next.left = clamp(
            startCrop.left + gesture.dx,
            0,
            startCrop.right - MIN_CROP
          );
        }
        if (corner.includes('right')) {
          next.right = clamp(
            startCrop.right + gesture.dx,
            startCrop.left + MIN_CROP,
            size.width
          );
        }
        if (corner.includes('top')) {
          next.top = clamp(
            startCrop.top + gesture.dy,
            0,
            startCrop.bottom - MIN_CROP
          );
        }
        if (corner.includes('bottom')) {
          next.bottom = clamp(
            startCrop.bottom + gesture.dy,
            startCrop.top + MIN_CROP,
            size.height
          );
        }

        cropRef.current = next;
        setCrop(next);
      },
      onPanResponderRelease: () => {
        startCrop = null;
      },
      onPanResponderTerminate: () => {
        startCrop = null;
      },
    });
  };

  // 리렌더링 때 PanResponder가 새로 만들어지지 않게 고정한다.
  // 기존 구현은 드래그 도중 responder가 재생성되어 이동량이 끊기는 문제가 있었다.
  const topLeftResponder = useMemo(() => createHandleResponder('left-top'), []);
  const topRightResponder = useMemo(() => createHandleResponder('right-top'), []);
  const bottomLeftResponder = useMemo(() => createHandleResponder('left-bottom'), []);
  const bottomRightResponder = useMemo(() => createHandleResponder('right-bottom'), []);

  const drawResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => penModeRef.current,
        onMoveShouldSetPanResponder: () => penModeRef.current,
        onPanResponderGrant: (event) => {
          if (!penModeRef.current) return;
          const { locationX, locationY } = event.nativeEvent;
          setActivePath([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (event) => {
          if (!penModeRef.current) return;
          const { locationX, locationY } = event.nativeEvent;
          setActivePath((prev) => [...prev, { x: locationX, y: locationY }]);
        },
        onPanResponderRelease: () => {
          setActivePath((prev) => {
            if (prev.length > 1) {
              setPaths((all) => [...all, prev]);
            }
            return [];
          });
        },
        onPanResponderTerminate: () => setActivePath([]),
      }),
    []
  );

  const points = (path) => path.map((p) => `${p.x},${p.y}`).join(' ');

  const captureStage = async () => {
    if (!stageRef.current) {
      throw new Error('편집 화면을 캡처할 수 없습니다.');
    }

    return captureRef(stageRef, {
      format: 'jpg',
      quality: 0.95,
      width: Math.round(displaySize.width),
      height: Math.round(displaySize.height),
      result: 'tmpfile',
    });
  };

  const rotate90 = async () => {
    try {
      setSaving(true);
      const captured = await captureStage();
      const result = await ImageManipulator.manipulateAsync(
        captured,
        [{ rotate: 90 }],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(result.uri);
      setPaths([]);
      setActivePath([]);
      setPenMode(false);

      Image.getSize(
        result.uri,
        (width, height) => setImageSize({ width, height }),
        () => setImageSize({ width: displaySize.height, height: displaySize.width })
      );
    } catch (error) {
      console.log('사진 회전 실패:', error);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    try {
      setSaving(true);
      const captured = await captureStage();
      const width = Math.max(1, Math.round(crop.right - crop.left));
      const height = Math.max(1, Math.round(crop.bottom - crop.top));

      const result = await ImageManipulator.manipulateAsync(
        captured,
        [
          {
            crop: {
              originX: Math.round(crop.left),
              originY: Math.round(crop.top),
              width,
              height,
            },
          },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
      );

      onComplete?.(result.uri);
    } catch (error) {
      console.log('사진 편집 저장 실패:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !currentUri) return null;

  const cropWidth = crop.right - crop.left;
  const cropHeight = crop.bottom - crop.top;

  const Handle = ({ style, responder }) => (
    <View
      style={[styles.handleTouchArea, style]}
      {...responder.panHandlers}
    >
      <View style={styles.handleVisual} />
    </View>
  );

  const handleOffset = HANDLE_TOUCH_SIZE / 2;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} disabled={saving}>
            <Text style={styles.headerButton}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.title}>사진 편집</Text>
          <TouchableOpacity onPress={save} disabled={saving}>
            <Text style={styles.headerButton}>{saving ? '처리 중' : '저장'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.editorArea}>
          <View style={{ width: displaySize.width, height: displaySize.height }}>
            <View
              ref={stageRef}
              collapsable={false}
              style={{ width: displaySize.width, height: displaySize.height }}
              {...drawResponder.panHandlers}
            >
              <Image
                source={{ uri: currentUri }}
                style={{ width: displaySize.width, height: displaySize.height }}
                resizeMode="stretch"
              />
              <Svg
                pointerEvents="none"
                width={displaySize.width}
                height={displaySize.height}
                style={StyleSheet.absoluteFill}
              >
                {paths.map((path, index) => (
                  <Polyline
                    key={index}
                    points={points(path)}
                    fill="none"
                    stroke="#E53935"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {activePath.length > 1 && (
                  <Polyline
                    points={points(activePath)}
                    fill="none"
                    stroke="#E53935"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
            </View>

            {!penMode && (
              <View
                pointerEvents="box-none"
                style={[
                  styles.cropLayer,
                  { width: displaySize.width, height: displaySize.height },
                ]}
              >
                <View style={[styles.mask, { left: 0, top: 0, right: 0, height: crop.top }]} />
                <View style={[styles.mask, { left: 0, top: crop.top, width: crop.left, height: cropHeight }]} />
                <View style={[styles.mask, { left: crop.right, top: crop.top, right: 0, height: cropHeight }]} />
                <View style={[styles.mask, { left: 0, top: crop.bottom, right: 0, bottom: 0 }]} />

                <View
                  pointerEvents="none"
                  style={[
                    styles.cropBorder,
                    {
                      left: crop.left,
                      top: crop.top,
                      width: cropWidth,
                      height: cropHeight,
                    },
                  ]}
                />

                <Handle
                  responder={topLeftResponder}
                  style={{ left: crop.left - handleOffset, top: crop.top - handleOffset }}
                />
                <Handle
                  responder={topRightResponder}
                  style={{ left: crop.right - handleOffset, top: crop.top - handleOffset }}
                />
                <Handle
                  responder={bottomLeftResponder}
                  style={{ left: crop.left - handleOffset, top: crop.bottom - handleOffset }}
                />
                <Handle
                  responder={bottomRightResponder}
                  style={{ left: crop.right - handleOffset, top: crop.bottom - handleOffset }}
                />
              </View>
            )}
          </View>
        </View>

        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolButton} onPress={rotate90} disabled={saving}>
            <Text style={styles.toolText}>↻ 90° 회전</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolButton, penMode && styles.toolButtonActive]}
            onPress={() => setPenMode((v) => !v)}
            disabled={saving}
          >
            <Text style={[styles.toolText, penMode && styles.toolTextActive]}>✎ 펜</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={() => setPaths((prev) => prev.slice(0, -1))}
            disabled={saving || paths.length === 0}
          >
            <Text style={styles.toolText}>↶ 되돌리기</Text>
          </TouchableOpacity>
        </View>

        {penMode && (
          <Text style={styles.guide}>사진 위를 손가락으로 그리세요.</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },
  header: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
  },
  title: { fontSize: 17, fontWeight: '900', color: '#1F2D3D' },
  headerButton: { fontSize: 14, fontWeight: '900', color: '#12395B' },
  editorArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  cropLayer: { position: 'absolute' },
  mask: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.52)' },
  cropBorder: { position: 'absolute', borderWidth: 2, borderColor: 'white' },
  handleTouchArea: {
    position: 'absolute',
    width: HANDLE_TOUCH_SIZE,
    height: HANDLE_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  handleVisual: {
    width: HANDLE_VISUAL_SIZE,
    height: HANDLE_VISUAL_SIZE,
    borderRadius: HANDLE_VISUAL_SIZE / 2,
    backgroundColor: 'white',
    borderWidth: 4,
    borderColor: '#12395B',
  },
  toolbar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  toolButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    backgroundColor: 'white',
    paddingVertical: 12,
    alignItems: 'center',
  },
  toolButtonActive: { backgroundColor: '#12395B', borderColor: '#12395B' },
  toolText: { color: '#12395B', fontSize: 11, fontWeight: '900' },
  toolTextActive: { color: 'white' },
  guide: {
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#607086',
    fontSize: 11,
    fontWeight: '700',
  },
});
