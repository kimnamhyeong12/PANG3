import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import KakaoMapWebView from '../components/KakaoMapWebView';
import { showAlert } from '../components/CustomAlert';
import { groupApi } from '../utils/groupApi';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const CATEGORIES = [
  { key: 'tree', label: '가로수', icon: 'leaf-outline' },
  { key: 'manhole', label: '맨홀뚜껑', icon: 'disc-outline' },
  { key: 'bus', label: '버스정류장', icon: 'bus-outline' },
];

// 예전에 만든 부산 그룹은 regionAdmCode가 비어 있을 수 있어
// 저장된 구·군 이름으로 SGIS 코드를 보완한다.
const BUSAN_DISTRICT_CODES = {
  중구: '21010',
  서구: '21020',
  동구: '21030',
  영도구: '21040',
  부산진구: '21050',
  동래구: '21060',
  남구: '21070',
  북구: '21080',
  해운대구: '21090',
  사하구: '21100',
  금정구: '21110',
  강서구: '21120',
  연제구: '21130',
  수영구: '21140',
  사상구: '21150',
  기장군: '21310',
};

const OFFSETS = [
  [0.0002, 0.0001],
  [0.0012, 0.0011],
  [-0.001, 0.00135],
];

const simplifyRingForMap = (ring = [], maxPoints = 160) => {
  if (!Array.isArray(ring) || ring.length <= maxPoints) {
    return ring;
  }

  const lastIndex = ring.length - 1;
  const simplified = [];

  for (let index = 0; index < maxPoints - 1; index += 1) {
    const point =
      ring[Math.round((index * lastIndex) / (maxPoints - 1))];

    if (point && point !== simplified[simplified.length - 1]) {
      simplified.push(point);
    }
  }

  simplified.push(ring[lastIndex]);

  return simplified;
};

const simplifyGeometryForMap = (geometry) => {
  if (!geometry?.coordinates) {
    return geometry;
  }

  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) =>
        simplifyRingForMap(ring)
      ),
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => simplifyRingForMap(ring))
      ),
    };
  }

  return geometry;
};

const getDongName = (name = '') =>
  String(name).trim().split(/\s+/).pop() || '행정동';

const getFeatureName = (feature, index = 0) => {
  const properties = feature?.properties || {};

  return (
    properties.adm_nm ||
    properties.adm_name ||
    properties.name ||
    `행정동 ${index + 1}`
  );
};

const collectGeometryPoints = (geometry) => {
  if (!geometry?.coordinates) {
    return [];
  }

  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];

  return polygons.flatMap((polygon) =>
    (polygon || []).flatMap((ring) =>
      Array.isArray(ring) ? ring : []
    )
  );
};

const toBoundaryOption = (feature, index) => {
  const points = collectGeometryPoints(feature?.geometry);

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  points.forEach((point) => {
    const lng = Number(point?.[0]);
    const lat = Number(point?.[1]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  const name = getFeatureName(feature, index);

  return {
    id: String(
      feature?.properties?.adm_cd ||
      `${name}-${index}`
    ),
    name,
    dongName: getDongName(name),
    latitude: Number.isFinite(minLat)
      ? (minLat + maxLat) / 2
      : 35.1796,
    longitude: Number.isFinite(minLng)
      ? (minLng + maxLng) / 2
      : 129.0756,
    properties: feature?.properties || {},
    feature,
  };
};

const getRegionParts = (
  boundary,
  workSido,
  regionSigungu
) => {
  const fullName = String(boundary?.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const properties = boundary?.properties || {};

  return {
    sido:
      properties.sido_nm ||
      parts[0] ||
      workSido,

    sigungu:
      properties.sgg_nm ||
      regionSigungu ||
      (parts.length >= 3
        ? parts[parts.length - 2]
        : ''),

    adminDong: properties.adm_nm
      ? getDongName(properties.adm_nm)
      : getDongName(fullName),
  };
};

const createMockItems = (
  boundary,
  category,
  workSido,
  regionSigungu
) => {
  if (!boundary || !category) {
    return [];
  }

  const categoryInfo = CATEGORIES.find(
    (item) => item.key === category
  );

  const region = getRegionParts(
    boundary,
    workSido,
    regionSigungu
  );

  const baseLat = Number(boundary.latitude);
  const baseLng = Number(boundary.longitude);

  return OFFSETS.map(
    ([latOffset, lngOffset], index) => ({
      id: `public-${category}-${region.adminDong}-${index + 1}`,

      detailAddress:
        `${region.adminDong} ` +
        `${categoryInfo?.label || '공공시설'} ` +
        `${index + 1}`,

      roadAddress:
        `${region.sido} ` +
        `${region.sigungu} ` +
        `${region.adminDong} ` +
        `공공시설 ${index + 1}`
          .replace(/\s+/g, ' ')
          .trim(),

      lat: baseLat + latOffset,
      lng: baseLng + lngOffset,

      task: categoryInfo?.label || '',
      status: 'pending',
      markerColor: '#2477F3',

      ...region,
    })
  );
};

export default function PublicDataMapMode({
  user,
  activeGroup,
  onBack,
  onDataChanged,
}) {
  const workSido =
    activeGroup?.regionSido ||
    user?.workSido ||
    '부산광역시';

  const regionSigungu =
    activeGroup?.regionSigungu ||
    '사하구';

  const activityAdmCode =
    activeGroup?.regionAdmCode ||
    (
      workSido === '부산광역시'
        ? BUSAN_DISTRICT_CODES[regionSigungu]
        : ''
    );

  const [dongOptions, setDongOptions] = useState([]);
  const [boundaryLoading, setBoundaryLoading] =
    useState(true);
  const [boundaryError, setBoundaryError] =
    useState('');
  const [
    renderedBoundaryCount,
    setRenderedBoundaryCount,
  ] = useState(null);

  const [
    selectedBoundary,
    setSelectedBoundary,
  ] = useState(null);

  const [
    categoryMenuOpen,
    setCategoryMenuOpen,
  ] = useState(false);

  const [category, setCategory] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [members, setMembers] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);

  const sheetTranslateY = useRef(
    new Animated.Value(0)
  ).current;

  const isLeader =
    activeGroup?.role === 'LEADER' ||
    members.some(
      (member) =>
        Number(member.userId) === Number(user?.userId) &&
        member.role === 'LEADER'
    );

  const assignableMembers = isLeader
    ? members
    : members.filter(
        (member) =>
          Number(member.userId) === Number(user?.userId)
      );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setBoundaryLoading(true);
        setBoundaryError('');
        setDongOptions([]);

        if (!activityAdmCode) {
          throw new Error(
            '그룹 활동 구·군이 설정되지 않았습니다. ' +
            '그룹 활동지역을 먼저 설정해 주세요.'
          );
        }

        const response = await fetch(
          `${API_BASE_URL}/api/sgis/boundaries` +
          `?admCode=${encodeURIComponent(activityAdmCode)}`
        );

        const text = await response.text();

        if (!response.ok) {
          throw new Error(
            text || 'SGIS 행정동 조회 실패'
          );
        }

        const parsed = JSON.parse(text);

        const features = Array.isArray(parsed?.features)
          ? parsed.features
          : [];

        if (!features.length) {
          throw new Error(
            `${regionSigungu} 행정동 데이터가 비어 있습니다.`
          );
        }

        const options = features
          .map(toBoundaryOption)
          .sort((a, b) =>
            a.dongName.localeCompare(b.dongName, 'ko')
          );

        if (!cancelled) {
          setDongOptions(options);
        }
      } catch (error) {
        if (!cancelled) {
          setBoundaryError(
            error.message ||
            '행정동 목록을 불러오지 못했습니다.'
          );
        }
      } finally {
        if (!cancelled) {
          setBoundaryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityAdmCode, regionSigungu]);

  useEffect(() => {
    let cancelled = false;

    if (!activeGroup?.groupId || !user?.userId) {
      return undefined;
    }

    groupApi(
      `/api/groups/${activeGroup.groupId}/members` +
      `?userId=${user.userId}`
    )
      .then((data) => {
        if (!cancelled) {
          setMembers(
            Array.isArray(data) ? data : []
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          showAlert(
            '팀원 조회 실패',
            error.message
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeGroup?.groupId, user?.userId]);

  useEffect(() => {
    setCategory('');
    setSelectedIds([]);
    setAssigneeId('');
    setCategoryMenuOpen(false);
    setRenderedBoundaryCount(null);
    sheetTranslateY.setValue(0);
  }, [selectedBoundary?.id, sheetTranslateY]);

  useEffect(() => {
    setSelectedIds([]);
  }, [category]);

  const closeBottomSheet = useCallback(() => {
    Animated.timing(sheetTranslateY, {
      toValue: 420,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setCategory('');
      setSelectedIds([]);
      setAssigneeId('');
      sheetTranslateY.setValue(0);
    });
  }, [sheetTranslateY]);

  const handleBack = useCallback(() => {
    // 카테고리 선택 메뉴가 열려 있으면
    // 메뉴만 먼저 닫는다.
    if (categoryMenuOpen) {
      setCategoryMenuOpen(false);
      return true;
    }

    // 공공데이터 목록이 올라와 있으면
    // 현재 화면을 나가지 않고 목록만 내린다.
    if (category) {
      closeBottomSheet();
      return true;
    }

    // 열린 메뉴와 목록이 없을 때만
    // 이전 화면으로 이동한다.
    onBack?.();
    return true;
  }, [
    categoryMenuOpen,
    category,
    closeBottomSheet,
    onBack,
  ]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBack
    );

    return () => {
      subscription.remove();
    };
  }, [handleBack]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,

        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 4 &&
          Math.abs(gesture.dy) >
            Math.abs(gesture.dx),

        onPanResponderMove: (_, gesture) => {
          sheetTranslateY.setValue(
            Math.max(0, gesture.dy)
          );
        },

        onPanResponderRelease: (_, gesture) => {
          if (
            gesture.dy > 45 ||
            gesture.vy > 0.65
          ) {
            closeBottomSheet();
            return;
          }

          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 90,
            friction: 10,
          }).start();
        },

        onPanResponderTerminate: () => {
          Animated.spring(sheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 90,
            friction: 10,
          }).start();
        },
      }),
    [closeBottomSheet, sheetTranslateY]
  );

  const selectedBoundaries = useMemo(() => {
    if (!selectedBoundary?.feature) {
      return null;
    }

    return {
      type: 'FeatureCollection',

      features: [
        {
          ...selectedBoundary.feature,

          geometry: simplifyGeometryForMap(
            selectedBoundary.feature.geometry
          ),
        },
      ],
    };
  }, [selectedBoundary]);

  const publicItems = useMemo(
    () =>
      createMockItems(
        selectedBoundary,
        category,
        workSido,
        regionSigungu
      ),
    [
      selectedBoundary,
      category,
      workSido,
      regionSigungu,
    ]
  );

  const mapItems = useMemo(
    () =>
      publicItems.map((item) => ({
        ...item,

        markerColor: selectedIds.includes(item.id)
          ? '#0F9D82'
          : '#2477F3',
      })),
    [publicItems, selectedIds]
  );

  const toggleItem = (item) => {
    setSelectedIds((previous) =>
      previous.includes(item.id)
        ? previous.filter(
            (id) => id !== item.id
          )
        : [...previous, item.id]
    );
  };

  const assignSelectedItems = async () => {
    if (!activeGroup?.groupId) {
      showAlert(
        '그룹 선택 필요',
        '공공업무를 등록할 그룹을 먼저 선택하세요.'
      );

      return;
    }

    if (!selectedIds.length) {
      showAlert(
        '시설 선택 필요',
        '지도나 목록에서 시설을 선택하세요.'
      );

      return;
    }

    if (!assigneeId) {
      showAlert(
        '담당자 선택 필요',
        '업무를 배정할 팀원을 선택하세요.'
      );

      return;
    }

    try {
      setSaving(true);

      const selected = publicItems.filter((item) =>
        selectedIds.includes(item.id)
      );

      for (const item of selected) {
        const createResponse = await fetch(
          `${API_BASE_URL}/api/locations`,
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/json',
            },

            body: JSON.stringify({
              detailAddress: item.detailAddress,
              roadAddress: item.roadAddress,

              lat: item.lat,
              lng: item.lng,

              taskCategory: item.task,
              status: 'pending',

              sido: item.sido,
              sigungu: item.sigungu,
              adminDong: item.adminDong,

              createdByUserId: user.userId,
              groupId: activeGroup.groupId,
            }),
          }
        );

        const createText =
          await createResponse.text();

        if (!createResponse.ok) {
          throw new Error(
            createText ||
            '공공업무 등록 실패'
          );
        }

        const saved = JSON.parse(createText);

        const taskId =
          saved.id ??
          saved.taskId ??
          saved.task_id;

        if (isLeader) {
          await groupApi(
            `/api/groups/${activeGroup.groupId}` +
            `/assignments/${taskId}`,
            {
              method: 'PUT',

              body: JSON.stringify({
                leaderUserId: user.userId,
                assigneeUserId: Number(assigneeId),
              }),
            }
          );
        }
      }

      const assignee = members.find(
        (member) =>
          String(member.userId) === assigneeId
      );

      showAlert(
        '공공업무 배정 완료',
        `${selectedBoundary?.dongName} ` +
        `${selected.length}건을 ` +
        `${assignee?.name || assignee?.loginId || '담당자'}` +
        '에게 배정했습니다.'
      );

      setSelectedIds([]);
      setAssigneeId('');

      onDataChanged?.();
    } catch (error) {
      showAlert(
        '공공업무 배정 실패',
        error.message ||
        '등록 중 문제가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!selectedBoundary) {
    return (
      <View style={styles.selectionScreen}>
        <View style={styles.selectionHeader}>
          <TouchableOpacity
            style={styles.plainBackButton}
            onPress={handleBack}
          >
            <Ionicons
              name="arrow-back"
              size={25}
              color="#10285B"
            />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.selectionTitle}>
              행정동 선택
            </Text>

            <Text style={styles.selectionSubtitle}>
              {workSido} · {regionSigungu}
            </Text>
          </View>
        </View>

        <View style={styles.regionCard}>
          <View style={styles.regionIcon}>
            <Ionicons
              name="map-outline"
              size={22}
              color="#2477F3"
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.regionTitle}>
              공공업무를 확인할 행정동
            </Text>

            <Text style={styles.regionDescription}>
              선택한 행정동 경계 하나만 지도에 표시합니다.
            </Text>
          </View>
        </View>

        {boundaryLoading ? (
          <View style={styles.selectionState}>
            <ActivityIndicator color="#2477F3" />

            <Text style={styles.stateText}>
              {regionSigungu} 행정동을 불러오는 중...
            </Text>
          </View>
        ) : boundaryError ? (
          <View
            style={[
              styles.selectionState,
              styles.errorCard,
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={24}
              color="#C43D4B"
            />

            <Text style={styles.errorStateText}>
              {boundaryError}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.dongGrid}
            showsVerticalScrollIndicator={false}
          >
            {dongOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={styles.dongCard}
                activeOpacity={0.76}
                onPress={() =>
                  setSelectedBoundary(option)
                }
              >
                <View style={styles.dongIcon}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color="#2477F3"
                  />
                </View>

                <Text style={styles.dongName}>
                  {option.dongName}
                </Text>

                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color="#8A98A8"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  const categoryInfo = CATEGORIES.find(
    (item) => item.key === category
  );

  return (
    <View style={styles.container}>
      <KakaoMapWebView
        locations={mapItems}
        boundaries={selectedBoundaries}
        panelOpen={false}
        setPanelOpen={() => {}}
        directMarkerPress
        onBoundaryReady={setRenderedBoundaryCount}
        onMarkerClick={toggleItem}
        onLocationsChange={() => {}}
      />

      <View style={styles.topOverlay}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
          >
            <Ionicons
              name="chevron-back"
              size={21}
              color="#10285B"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dongSelector}
            onPress={() =>
              setSelectedBoundary(null)
            }
          >
            <Ionicons
              name="location-outline"
              size={17}
              color="#2477F3"
            />

            <Text
              style={styles.dongSelectorText}
              numberOfLines={1}
            >
              {selectedBoundary.dongName}
            </Text>

            <Ionicons
              name="chevron-down"
              size={16}
              color="#10285B"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selector}
            activeOpacity={0.9}
            onPress={() =>
              setCategoryMenuOpen(
                (value) => !value
              )
            }
          >
            <Ionicons
              name={
                categoryInfo?.icon ||
                'layers-outline'
              }
              size={18}
              color="#2477F3"
            />

            <Text
              style={styles.selectorText}
              numberOfLines={1}
            >
              {categoryInfo?.label ||
                '카테고리 선택'}
            </Text>

            <Ionicons
              name={
                categoryMenuOpen
                  ? 'chevron-up'
                  : 'chevron-down'
              }
              size={17}
              color="#10285B"
            />
          </TouchableOpacity>
        </View>

        {categoryMenuOpen ? (
          <View style={styles.categoryMenu}>
            {CATEGORIES.map((item, index) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.categoryRow,

                  index === CATEGORIES.length - 1 &&
                    styles.categoryLast,
                ]}
                onPress={() => {
                  setCategory(item.key);
                  setCategoryMenuOpen(false);
                }}
              >
                <View style={styles.categoryIcon}>
                  <Ionicons
                    name={item.icon}
                    size={19}
                    color="#2477F3"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryTitle}>
                    {item.label}
                  </Text>

                  <Text style={styles.categoryDesc}>
                    {selectedBoundary.dongName}의{' '}
                    {item.label}만 표시
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color="#8A98A8"
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {renderedBoundaryCount === null ? (
          <View style={styles.notice}>
            <ActivityIndicator
              size="small"
              color="#2477F3"
            />

            <Text style={styles.noticeText}>
              {selectedBoundary.dongName} 경계를 표시하는 중...
            </Text>
          </View>
        ) : renderedBoundaryCount === 0 ? (
          <View
            style={[
              styles.notice,
              styles.errorNotice,
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color="#C43D4B"
            />

            <Text style={styles.errorText}>
              선택한 행정동 경계를 표시하지 못했습니다.
            </Text>
          </View>
        ) : !category ? (
          <View style={styles.notice}>
            <Ionicons
              name="layers-outline"
              size={16}
              color="#2477F3"
            />

            <Text style={styles.noticeText}>
              공공데이터 카테고리를 선택하세요.
            </Text>
          </View>
        ) : null}
      </View>

      {category ? (
        <Animated.View
          style={[
            styles.bottomSheet,

            {
              transform: [
                {
                  translateY: sheetTranslateY,
                },
              ],
            },
          ]}
        >
          <View
            style={styles.handleTouchArea}
            {...sheetPanResponder.panHandlers}
          >
            <View style={styles.handle} />
          </View>

          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>
                {selectedBoundary.dongName} ·{' '}
                {categoryInfo?.label}
              </Text>

              <Text style={styles.sheetSub}>
                시설 {publicItems.length}건 · 선택{' '}
                {selectedIds.length}건
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setSelectedIds(
                  selectedIds.length === publicItems.length
                    ? []
                    : publicItems.map(
                        (item) => item.id
                      )
                )
              }
            >
              <Text style={styles.selectAll}>
                {selectedIds.length ===
                publicItems.length
                  ? '전체 해제'
                  : '전체 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.itemList}
            nestedScrollEnabled
          >
            {publicItems.map((item) => {
              const checked =
                selectedIds.includes(item.id);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.itemRow}
                  onPress={() => toggleItem(item)}
                >
                  <View
                    style={[
                      styles.checkbox,

                      checked &&
                        styles.checkboxChecked,
                    ]}
                  >
                    {checked ? (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color="#FFFFFF"
                      />
                    ) : null}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>
                      {item.detailAddress}
                    </Text>

                    <Text
                      style={styles.itemAddress}
                      numberOfLines={1}
                    >
                      {item.roadAddress}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.memberLabel}>
            담당자 선택
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memberRow}
          >
            {assignableMembers.map((member) => {
              const active =
                assigneeId === String(member.userId);

              return (
                <TouchableOpacity
                  key={member.userId}
                  style={[
                    styles.memberChip,

                    active &&
                      styles.memberChipActive,
                  ]}
                  onPress={() =>
                    setAssigneeId(
                      String(member.userId)
                    )
                  }
                >
                  <Text
                    style={[
                      styles.memberText,

                      active &&
                        styles.memberTextActive,
                    ]}
                  >
                    {member.name ||
                      member.loginId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.assignButton,

              (
                !selectedIds.length ||
                !assigneeId ||
                saving
              ) &&
                styles.disabledButton,
            ]}
            disabled={
              !selectedIds.length ||
              !assigneeId ||
              saving
            }
            onPress={assignSelectedItems}
          >
            {saving ? (
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />
            ) : (
              <Ionicons
                name="person-add-outline"
                size={18}
                color="#FFFFFF"
              />
            )}

            <Text style={styles.assignText}>
              {saving
                ? '등록 중...'
                : `선택한 ${selectedIds.length}건 업무로 배정`}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
    </View>
  );
}

const androidTop =
  Platform.OS === 'android'
    ? StatusBar.currentHeight || 0
    : 0;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF5FC',
  },

  selectionScreen: {
    flex: 1,
    backgroundColor: '#F4F8FD',
    paddingTop: androidTop,
  },

  selectionHeader: {
    minHeight: 78,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  plainBackButton: {
    width: 38,
    height: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  selectionTitle: {
    color: '#10285B',
    fontSize: 22,
    fontWeight: '900',
  },

  selectionSubtitle: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },

  regionCard: {
    marginHorizontal: 18,
    minHeight: 76,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  regionIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  regionTitle: {
    color: '#10285B',
    fontSize: 14,
    fontWeight: '900',
  },

  regionDescription: {
    color: '#718096',
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 4,
  },

  selectionState: {
    margin: 18,
    minHeight: 150,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#DCE7F5',
    padding: 20,
  },

  stateText: {
    color: '#50627A',
    fontSize: 11,
    fontWeight: '700',
  },

  errorCard: {
    borderColor: '#F3CDD2',
  },

  errorStateText: {
    color: '#C43D4B',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '700',
  },

  dongGrid: {
    padding: 18,
    paddingTop: 14,
    paddingBottom: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  dongCard: {
    width: '48.4%',
    minHeight: 58,
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE7F5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  dongIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dongName: {
    flex: 1,
    color: '#10285B',
    fontSize: 12,
    fontWeight: '900',
  },

  topOverlay: {
    position: 'absolute',
    top: androidTop + 10,
    left: 12,
    right: 12,
    gap: 8,
  },

  topRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10285B',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  dongSelector: {
    flex: 0.8,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    shadowColor: '#10285B',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  dongSelectorText: {
    flex: 1,
    color: '#10285B',
    fontSize: 11,
    fontWeight: '900',
  },

  selector: {
    flex: 1.2,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#10285B',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  selectorText: {
    flex: 1,
    color: '#10285B',
    fontSize: 10.5,
    fontWeight: '800',
  },

  categoryMenu: {
    marginLeft: 49,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    shadowColor: '#10285B',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },

  categoryRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E4EBF3',
  },

  categoryLast: {
    borderBottomWidth: 0,
  },

  categoryIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#EAF3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  categoryTitle: {
    color: '#10285B',
    fontSize: 12,
    fontWeight: '900',
  },

  categoryDesc: {
    color: '#718096',
    fontSize: 9,
    marginTop: 3,
  },

  notice: {
    alignSelf: 'center',
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#10285B',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },

  noticeText: {
    color: '#50627A',
    fontSize: 10,
    fontWeight: '700',
  },

  errorNotice: {
    borderWidth: 1,
    borderColor: '#F3CDD2',
  },

  errorText: {
    color: '#C43D4B',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },

  bottomSheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    maxHeight: '52%',
    borderRadius: 22,
    padding: 15,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    shadowColor: '#10285B',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },

  handleTouchArea: {
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    marginBottom: 2,
  },

  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C6D0DC',
  },

  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },

  sheetTitle: {
    color: '#10285B',
    fontSize: 16,
    fontWeight: '900',
  },

  sheetSub: {
    color: '#718096',
    fontSize: 9,
    marginTop: 3,
  },

  selectAll: {
    color: '#2477F3',
    fontSize: 10,
    fontWeight: '900',
  },

  itemList: {
    maxHeight: 152,
  },

  itemRow: {
    minHeight: 49,
    borderTopWidth: 1,
    borderTopColor: '#E4EBF3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#A8B6C8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkboxChecked: {
    backgroundColor: '#2477F3',
    borderColor: '#2477F3',
  },

  itemName: {
    color: '#10285B',
    fontSize: 11,
    fontWeight: '800',
  },

  itemAddress: {
    color: '#718096',
    fontSize: 8.5,
    marginTop: 2,
  },

  memberLabel: {
    color: '#10285B',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 8,
  },

  memberRow: {
    gap: 6,
    paddingVertical: 7,
  },

  memberChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF3F8',
  },

  memberChipActive: {
    backgroundColor: '#2477F3',
  },

  memberText: {
    color: '#50627A',
    fontSize: 10,
    fontWeight: '800',
  },

  memberTextActive: {
    color: '#FFFFFF',
  },

  assignButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: '#2477F3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  disabledButton: {
    backgroundColor: '#A9B7C8',
  },

  assignText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});