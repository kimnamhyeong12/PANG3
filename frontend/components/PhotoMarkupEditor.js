import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  PanResponder,
  PixelRatio,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from './ui';
import { colors } from '../constants/design';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';
import { showAlert } from './CustomAlert';
import { localImageForEditing } from '../utils/auth';

const SCREEN = Dimensions.get('window');

// 화면에는 작은 박스(MAX_W/MAX_H) 안에 축소해서 보여주지만, 저장(캡처)할 때는
// 이 화면 배율만큼 확대해서 캡처해야 레티나/고밀도 화면에서 화질이 깨지지 않는다.
const CAPTURE_SCALE = PixelRatio.get();

const MAX_W = Math.min(SCREEN.width - 24, 520);
const MAX_H = Math.min(SCREEN.height * 0.56, 520);

const HANDLE_VISUAL_SIZE = 24;
const HANDLE_HIT_RADIUS = 54;
const MIN_CROP = 56;

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), max);

function fitSize(width, height) {
  if (!width || !height) {
    return {
      width: MAX_W,
      height: Math.min(MAX_W * 0.75, MAX_H),
    };
  }

  const scale = Math.min(
    MAX_W / width,
    MAX_H / height
  );

  return {
    width: Math.max(
      1,
      Math.round(width * scale)
    ),
    height: Math.max(
      1,
      Math.round(height * scale)
    ),
  };
}

export default function PhotoMarkupEditor({
  visible,
  uri,
  onCancel,
  onComplete,
}) {
  const insets = useSafeAreaInsets();
  const stageRef = useRef(null);
  const originalSizeRef = useRef(null);
  const sessionRef = useRef(0);
  const operationRef = useRef(false);
  const originalUriRef = useRef(uri);
  const snapshotRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const cropCommitRef = useRef(null);
  const strokeCommitRef = useRef(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [imageReady, setImageReady] = useState(false);

  const cropRef = useRef({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  });

  const displaySizeRef = useRef({
    width: 0,
    height: 0,
  });

  const penModeRef = useRef(false);
  const canEditRef = useRef(false);
  const dragRef = useRef(null);
  const activePathRef = useRef([]);

  const [currentUri, setCurrentUri] =
    useState(uri);

  const [imageSize, setImageSize] =
    useState({
      width: 0,
      height: 0,
    });

  const [crop, setCrop] =
    useState({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });

  const [penMode, setPenMode] =
    useState(false);

  const [cropMode, setCropMode] =
    useState(true);

  const [paths, setPaths] =
    useState([]);

  const [activePath, setActivePath] =
    useState([]);

  const [saving, setSaving] =
    useState(false);

  const displaySize = useMemo(
    () =>
      fitSize(
        imageSize.width,
        imageSize.height
      ),
    [imageSize]
  );

  snapshotRef.current = { uri: currentUri, width: imageSize.width, height: imageSize.height, paths };
  const pushHistory = () => {
    historyRef.current = { past: [...historyRef.current.past, snapshotRef.current], future: [] };
    setHistoryVersion(value => value + 1);
  };
  strokeCommitRef.current = path => {
    if (operationRef.current) return;
    pushHistory();
    setPaths(previous => [...previous, path]);
  };

  const canEdit = imageReady && imageSize.width > 0 && imageSize.height > 0;
  canEditRef.current = canEdit;

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useEffect(() => {
    displaySizeRef.current =
      displaySize;
  }, [displaySize]);

  useEffect(() => {
    penModeRef.current =
      penMode;
  }, [penMode]);

  const resetCrop = (
    w = displaySize.width,
    h = displaySize.height
  ) => {
    const nextCrop = {
      left: 0,
      top: 0,
      right: w,
      bottom: h,
    };

    cropRef.current = nextCrop;
    setCrop(nextCrop);
  };

  useEffect(() => {
    const session = ++sessionRef.current;
    operationRef.current = false;
    setSaving(false);
    setImageReady(false);
    originalSizeRef.current = null;
    if (!visible || !uri) return;

    setCurrentUri(null);
    setImageSize({ width: 0, height: 0 });

    setPaths([]);
    setActivePath([]);
    activePathRef.current = [];
    setPenMode(false);
    setCropMode(true);
    penModeRef.current = false;
    historyRef.current = { past: [], future: [] };
    setHistoryVersion(value => value + 1);

    const load = (localUri) => {
    if (session !== sessionRef.current) return;
    originalUriRef.current = localUri;
    setCurrentUri(localUri);
    Image.getSize(
      localUri,

      (width, height) => {
        if (session !== sessionRef.current) return;
        originalSizeRef.current = { width, height };
        setImageSize({ width, height });
      },
      () => {
        if (session !== sessionRef.current) return;
        originalSizeRef.current = { width: 1200, height: 900 };
        setImageSize(originalSizeRef.current);
      }
    );
    };
    if (/^https?:/.test(uri)) localImageForEditing(uri).then(load).catch(() => {
      if (session === sessionRef.current) showAlert('사진 불러오기 실패', '연결과 사진 접근 권한을 확인해 주세요.');
    });
    else load(uri);
  }, [uri, visible]);

  useEffect(() => {
    if (
      !visible ||
      !displaySize.width ||
      !displaySize.height
    ) {
      return;
    }

    resetCrop(
      displaySize.width,
      displaySize.height
    );
  }, [
    displaySize.width,
    displaySize.height,
    visible,
  ]);

  const getNearestCorner = (
    x,
    y
  ) => {
    const c = cropRef.current;

    const corners = [
      {
        key: 'left-top',
        x: c.left,
        y: c.top,
      },
      {
        key: 'right-top',
        x: c.right,
        y: c.top,
      },
      {
        key: 'left-bottom',
        x: c.left,
        y: c.bottom,
      },
      {
        key: 'right-bottom',
        x: c.right,
        y: c.bottom,
      },
    ];

    let best = null;
    let bestDistance =
      Infinity;

    for (const corner of corners) {
      const dx =
        x - corner.x;

      const dy =
        y - corner.y;

      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy
        );

      if (
        distance <
        bestDistance
      ) {
        best = corner;
        bestDistance =
          distance;
      }
    }

    return bestDistance <=
      HANDLE_HIT_RADIUS
      ? best?.key
      : null;
  };

  const cropResponder =
    useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder:
            (event) => {
              if (
                penModeRef.current || operationRef.current || !canEditRef.current
              ) {
                return false;
              }

              const {
                locationX,
                locationY,
              } =
                event.nativeEvent;

              return Boolean(
                getNearestCorner(
                  locationX,
                  locationY
                )
              );
            },

          onMoveShouldSetPanResponder:
            () =>
              Boolean(
                dragRef.current
              ),

          onPanResponderTerminationRequest:
            () => false,

          onPanResponderGrant:
            (event) => {
              if (
                penModeRef.current || operationRef.current || !canEditRef.current
              ) {
                return;
              }

              const {
                locationX,
                locationY,
              } =
                event.nativeEvent;

              const corner =
                getNearestCorner(
                  locationX,
                  locationY
                );

              if (!corner) {
                return;
              }

              dragRef.current =
                {
                  corner,

                  startCrop: {
                    ...cropRef.current,
                  },
                };
            },

          onPanResponderMove:
            (_, gesture) => {
              if (operationRef.current || !canEditRef.current) return;
              const drag =
                dragRef.current;

              if (!drag) {
                return;
              }

              const {
                corner,
                startCrop,
              } = drag;

              const size =
                displaySizeRef.current;

              const next = {
                ...startCrop,
              };

              if (
                corner.includes(
                  'left'
                )
              ) {
                next.left =
                  clamp(
                    startCrop.left +
                      gesture.dx,
                    0,
                    startCrop.right -
                      MIN_CROP
                  );
              }

              if (
                corner.includes(
                  'right'
                )
              ) {
                next.right =
                  clamp(
                    startCrop.right +
                      gesture.dx,
                    startCrop.left +
                      MIN_CROP,
                    size.width
                  );
              }

              if (
                corner.includes(
                  'top'
                )
              ) {
                next.top =
                  clamp(
                    startCrop.top +
                      gesture.dy,
                    0,
                    startCrop.bottom -
                      MIN_CROP
                  );
              }

              if (
                corner.includes(
                  'bottom'
                )
              ) {
                next.bottom =
                  clamp(
                    startCrop.bottom +
                      gesture.dy,
                    startCrop.top +
                      MIN_CROP,
                    size.height
                  );
              }

              cropRef.current =
                next;

              setCrop(next);
            },

          onPanResponderRelease:
            () => {
              dragRef.current = null;
              return cropCommitRef.current?.();
            },

          onPanResponderTerminate:
            () => {
              dragRef.current =
                null;
            },
        }),
      []
    );

  const drawResponder =
    useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder:
            () =>
              penModeRef.current,

          onMoveShouldSetPanResponder:
            () =>
              penModeRef.current,

          onPanResponderGrant:
            (event) => {
              if (
                !penModeRef.current
              ) {
                return;
              }

              const {
                locationX,
                locationY,
              } =
                event.nativeEvent;

              if (operationRef.current) return;
              activePathRef.current = [{ x: locationX, y: locationY }];
              setActivePath(activePathRef.current);
            },

          onPanResponderMove:
            (event) => {
              if (
                !penModeRef.current
              ) {
                return;
              }

              const {
                locationX,
                locationY,
              } =
                event.nativeEvent;

              if (operationRef.current) return;
              activePathRef.current = [...activePathRef.current, { x: locationX, y: locationY }];
              setActivePath(activePathRef.current);
            },

          onPanResponderRelease: () => {
            const path = activePathRef.current;
            activePathRef.current = []; setActivePath([]);
            if (path.length > 1) strokeCommitRef.current?.(path);
          },
          onPanResponderTerminate: () => { activePathRef.current = []; setActivePath([]); },
        }),
      []
    );

  const points = (path) =>
    path
      .map(
        (p) =>
          `${p.x},${p.y}`
      )
      .join(' ');

  const captureStage =
    async () => {
      if (
        !stageRef.current
      ) {
        throw new Error(
          '편집 화면을 캡처할 수 없습니다.'
        );
      }

      return captureRef(
        stageRef,
        {
          format: 'jpg',
          quality: 0.95,

          // 화면에 보이는 크기(displaySize) 그대로 캡처하면 실제 픽셀 수가
          // 너무 작아서 화질이 깨지므로, 기기 화면 배율만큼 키워서 캡처한다.
          width:
            Math.round(
              displaySize.width * CAPTURE_SCALE
            ),

          height:
            Math.round(
              displaySize.height * CAPTURE_SCALE
            ),

          result: 'tmpfile',
        }
      );
    };

  // Crop the actual base image before changing tools. Existing pen marks are
  // flattened first so their position is preserved through crops and rotations.
  const hasPendingCrop = () => {
    const selected = cropRef.current;
    return Math.abs(selected.left) > 0.5 || Math.abs(selected.top) > 0.5
      || Math.abs(selected.right - displaySize.width) > 0.5 || Math.abs(selected.bottom - displaySize.height) > 0.5;
  };
  const renderImage = async (includeCrop, extraActions = []) => {
    let source = { uri: currentUri, ...imageSize };
    if (paths.length || activePath.length > 1) {
      source = {
        uri: await captureStage(),
        width: Math.round(displaySize.width * CAPTURE_SCALE),
        height: Math.round(displaySize.height * CAPTURE_SCALE),
      };
    }
    const actions = [];
    if (includeCrop && hasPendingCrop()) {
      const selected = cropRef.current;
      const scaleX = source.width / displaySize.width;
      const scaleY = source.height / displaySize.height;
      const originX = clamp(Math.round(selected.left * scaleX), 0, source.width - 1);
      const originY = clamp(Math.round(selected.top * scaleY), 0, source.height - 1);
      const right = clamp(Math.round(selected.right * scaleX), originX + 1, source.width);
      const bottom = clamp(Math.round(selected.bottom * scaleY), originY + 1, source.height);
      actions.push({ crop: { originX, originY, width: right - originX, height: bottom - originY } });
    }
    actions.push(...extraActions);
    if (!actions.length) return source;
    return ImageManipulator.manipulateAsync(source.uri, actions, {
      compress: 0.95, format: ImageManipulator.SaveFormat.JPEG,
    });
  };

  const replaceImage = (result) => {
    if (result.uri !== currentUri) setImageReady(false);
    setCurrentUri(result.uri);
    setImageSize({ width: result.width, height: result.height });
    const size = fitSize(result.width, result.height);
    resetCrop(size.width, size.height);
    setPaths([]);
    setActivePath([]);
    activePathRef.current = [];
    dragRef.current = null;
  };

  const runEdit = async (operation, commit) => {
    if (operationRef.current || !imageReady || !imageSize.width || !imageSize.height) return;
    const session = sessionRef.current;
    operationRef.current = true;
    setSaving(true);
    try {
      const result = await operation();
      if (session === sessionRef.current) commit(result);
    } catch (error) {
      if (session === sessionRef.current) {
        showAlert('사진 편집 실패', '편집을 적용하지 못했습니다. 다시 시도해 주세요.');
      }
    } finally {
      if (session === sessionRef.current) {
        operationRef.current = false;
        setSaving(false);
      }
    }
  };

  const commitImage = result => { pushHistory(); replaceImage(result); };
  const applyCrop = () => {
    if (!hasPendingCrop()) return;
    return runEdit(() => renderImage(true), commitImage);
  };
  cropCommitRef.current = applyCrop;

  const toggleCrop = () => {
    setCropMode(true); setPenMode(false); penModeRef.current = false;
  };
  const togglePen = () => {
    if (hasPendingCrop()) return runEdit(() => renderImage(true), result => {
      commitImage(result); setCropMode(false); setPenMode(true); penModeRef.current = true;
    });
    setCropMode(false); setPenMode(true); penModeRef.current = true;
  };
  const rotate90 = () => runEdit(() => renderImage(cropMode, [{ rotate: 90 }]), commitImage);
  const restoreOriginal = () => {
    if (operationRef.current || !originalSizeRef.current) return;
    pushHistory();
    replaceImage({ uri: originalUriRef.current, ...originalSizeRef.current });
    setCropMode(true); setPenMode(false); penModeRef.current = false;
  };
  const moveHistory = direction => {
    if (operationRef.current || !imageReady) return;
    const history = historyRef.current;
    const source = direction === 'undo' ? history.past : history.future;
    if (!source.length) return;
    const target = source[source.length - 1];
    historyRef.current = direction === 'undo'
      ? { past: history.past.slice(0, -1), future: [...history.future, snapshotRef.current] }
      : { past: [...history.past, snapshotRef.current], future: history.future.slice(0, -1) };
    replaceImage(target); setPaths(target.paths);
    setHistoryVersion(value => value + 1);
  };

  const save = () => runEdit(
    () => renderImage(cropMode),
    (result) => onComplete?.(result.uri)
  );

  if (
    !visible ||
    !currentUri
  ) {
    return null;
  }

  const cropWidth =
    crop.right -
    crop.left;

  const cropHeight =
    crop.bottom -
    crop.top;

  const Corner = ({ left, top, horizontal, vertical }) => (
    <View
      pointerEvents="none"
      style={[
        styles.handleVisual,

        {
          left: horizontal === 'left' ? left : left - HANDLE_VISUAL_SIZE,
          top: vertical === 'top' ? top : top - HANDLE_VISUAL_SIZE,
          borderLeftWidth: horizontal === 'left' ? 4 : 0,
          borderRightWidth: horizontal === 'right' ? 4 : 0,
          borderTopWidth: vertical === 'top' ? 4 : 0,
          borderBottomWidth: vertical === 'bottom' ? 4 : 0,
        },
      ]}
    />
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => { if (!operationRef.current) onCancel?.(); }}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <ScreenHeader title="사진편집" onBack={() => { if (!operationRef.current) onCancel?.(); }} />
        <View style={styles.actionRow}>
          <View style={styles.historyPill}>
            <TouchableOpacity accessibilityLabel="이전" onPress={() => moveHistory('undo')} disabled={saving || !canEdit || !historyRef.current.past.length} style={styles.historyButton}>
              <Ionicons name="arrow-undo-outline" size={23} color={historyRef.current.past.length && !saving ? colors.text : colors.textFaint} />
            </TouchableOpacity>
            <View style={styles.pillDivider} />
            <TouchableOpacity accessibilityLabel="이후" onPress={() => moveHistory('redo')} disabled={saving || !canEdit || !historyRef.current.future.length} style={styles.historyButton}>
              <Ionicons name="arrow-redo-outline" size={23} color={historyRef.current.future.length && !saving ? colors.text : colors.textFaint} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.historyPill}>
            <TouchableOpacity accessibilityLabel="원본 복원" onPress={restoreOriginal} disabled={saving || !canEdit} style={styles.textAction}><Text style={styles.headerButton}>원본 복원</Text></TouchableOpacity>
            <View style={styles.pillDivider} />
            <TouchableOpacity accessibilityLabel="저장" onPress={save} disabled={saving || !canEdit} style={styles.textAction}><Text style={styles.headerButton}>{saving ? '처리 중' : '저장'}</Text></TouchableOpacity>
          </View>
        </View>

        <View
          style={
            styles.editorArea
          }
        >
          <View
            style={{
              width:
                displaySize.width,

              height:
                displaySize.height,
            }}
          >
            <View
              ref={stageRef}
              collapsable={
                false
              }
              style={{
                width:
                  displaySize.width,

                height:
                  displaySize.height,
              }}
              {...drawResponder.panHandlers}
            >
              <Image
                source={{
                  uri:
                    currentUri,
                }}
                style={{
                  width:
                    displaySize.width,

                  height:
                    displaySize.height,
                }}
                onLoad={() => setImageReady(true)}
                onError={() => setImageReady(false)}
                resizeMode="stretch"
              />

              <Svg
                pointerEvents="none"
                width={
                  displaySize.width
                }
                height={
                  displaySize.height
                }
                style={
                  StyleSheet.absoluteFill
                }
              >
                {paths.map(
                  (
                    path,
                    index
                  ) => (
                    <Polyline
                      key={
                        index
                      }
                      points={
                        points(
                          path
                        )
                      }
                      fill="none"
                      stroke="#E53935"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                )}

                {activePath.length >
                  1 && (
                  <Polyline
                    points={
                      points(
                        activePath
                      )
                    }
                    fill="none"
                    stroke="#E53935"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
            </View>

            {cropMode && !penMode && (
              <View
                style={[
                  styles.cropLayer,

                  {
                    width:
                      displaySize.width,

                    height:
                      displaySize.height,
                  },
                ]}
                {...cropResponder.panHandlers}
              >
                <View
                  pointerEvents="none"
                  style={[
                    styles.mask,
                    {
                      left: 0,
                      top: 0,
                      right: 0,
                      height:
                        crop.top,
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.mask,
                    {
                      left: 0,
                      top:
                        crop.top,
                      width:
                        crop.left,
                      height:
                        cropHeight,
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.mask,
                    {
                      left:
                        crop.right,
                      top:
                        crop.top,
                      right: 0,
                      height:
                        cropHeight,
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.mask,
                    {
                      left: 0,
                      top:
                        crop.bottom,
                      right: 0,
                      bottom: 0,
                    },
                  ]}
                />

                <View
                  pointerEvents="none"
                  style={[
                    styles.cropBorder,
                    {
                      left:
                        crop.left,
                      top:
                        crop.top,
                      width:
                        cropWidth,
                      height:
                        cropHeight,
                    },
                  ]}
                />

                <Corner
                  left={
                    crop.left
                  }
                  top={
                    crop.top
                  }
                  horizontal="left"
                  vertical="top"
                />

                <Corner
                  left={
                    crop.right
                  }
                  top={
                    crop.top
                  }
                  horizontal="right"
                  vertical="top"
                />

                <Corner
                  left={
                    crop.left
                  }
                  top={
                    crop.bottom
                  }
                  horizontal="left"
                  vertical="bottom"
                />

                <Corner
                  left={
                    crop.right
                  }
                  top={
                    crop.bottom
                  }
                  horizontal="right"
                  vertical="bottom"
                />
              </View>
            )}
          </View>
        </View>

        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.iconTool} accessibilityLabel="자르기" accessibilityState={{ selected: cropMode }} onPress={toggleCrop} disabled={saving || !canEdit}>
            <Ionicons name="crop-outline" size={29} color={cropMode ? colors.primary : colors.textSoft} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconTool} accessibilityLabel="펜" accessibilityState={{ selected: penMode }} onPress={togglePen} disabled={saving || !canEdit}>
            <Ionicons name="pencil-outline" size={29} color={penMode ? colors.primary : colors.textSoft} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconTool} accessibilityLabel="회전" onPress={rotate90} disabled={saving || !canEdit}>
            <Ionicons name="refresh-outline" size={29} color={colors.textSoft} />
          </TouchableOpacity>
        </View>


      </View>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,

      backgroundColor: colors.background,

      // 상단 상태바를 피함
      marginTop: 0,

      // 갤럭시 하단 내비게이션 영역을 피함
      paddingBottom: 28,
    },

    actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
    historyPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: '#E5EBF3', overflow: 'hidden' },
    historyButton: { width: 43, height: 44, alignItems: 'center', justifyContent: 'center' },
    pillDivider: { width: 1, height: 22, backgroundColor: '#CCD5E2' },
    textAction: { minHeight: 44, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
    iconTool: { width: 64, height: 52, alignItems: 'center', justifyContent: 'center' },
    header: {
      height: 58,

      paddingHorizontal: 16,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      backgroundColor:
        '#F4F7FA',

      borderBottomWidth: 1,

      borderBottomColor:
        '#D9E1EA',
    },

    headerTouch: {
      minWidth: 60,

      minHeight: 48,

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    cancelHeaderTouch: {
      backgroundColor: '#FDE9EB',
      borderRadius: 10,
    },

    cancelHeaderButton: {
      color: '#B94D59',
    },

    title: {
      fontSize: 17,

      fontWeight: '900',

      color: '#10285B',
    },

    headerButton: {
      fontSize: 14,

      fontWeight: '900',

      color: '#10285B',
    },

    editorArea: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center',

      padding: 12,
    },

    cropLayer: {
      position:
        'absolute',

      left: 0,

      top: 0,
    },

    mask: {
      position:
        'absolute',

      backgroundColor:
        'rgba(0,0,0,0.52)',
    },

    cropBorder: {
      position:
        'absolute',

      borderWidth: 2,

      borderColor:
        'white',
    },

    handleVisual: {
      position:
        'absolute',

      width:
        HANDLE_VISUAL_SIZE,

      height:
        HANDLE_VISUAL_SIZE,

      borderColor:
        'white',

      zIndex: 20,
    },

    toolbar: {
      flexDirection:
        'row',
      justifyContent: 'space-evenly',

      gap: 8,

      paddingHorizontal: 12,

      paddingTop: 12,

      paddingBottom: 12,
    },

    toolButton: {
      flex: 1,

      minHeight: 40,

      borderRadius: 12,

      backgroundColor:
        'white',

      borderWidth: 1,

      borderColor:
        '#D9E1EA',

      alignItems:
        'center',

      justifyContent:
        'center',
    },

    toolButtonActive: {
      backgroundColor:
        '#10285B',

      borderColor:
        '#10285B',
    },

    toolText: {
      color: '#10285B',

      fontSize: 12,

      fontWeight: '900',
    },

    toolTextActive: {
      color: 'white',
    },

    guide: {
      textAlign:
        'center',

      color: '#607195',

      fontSize: 11,

      paddingTop: 8,

      paddingBottom: 6,
    },
  });
