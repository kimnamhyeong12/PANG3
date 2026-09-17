import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BackButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';
import { groupApi } from '../utils/groupApi';

const KAKAO_REST_API_KEY =
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

const normalizeStatus = (value) => {
  const status = String(value || '')
    .toLowerCase()
    .trim();

  if (
    status === 'complete' ||
    status === 'completed' ||
    status === 'done'
  ) {
    return 'complete';
  }

  if (status === 'working') {
    return 'working';
  }

  return 'pending';
};

const getAdministrativeRegion = async (
  lat,
  lng
) => {
  if (!KAKAO_REST_API_KEY) {
    return null;
  }

  try {
    const url =
      'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json' +
      `?x=${encodeURIComponent(lng)}` +
      `&y=${encodeURIComponent(lat)}`;

    const response = await fetch(url, {
      headers: {
        Authorization:
          `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const region = data.documents?.find(
      (item) => item.region_type === 'H'
    );

    if (!region) {
      return null;
    }

    return {
      sido: region.region_1depth_name,
      sigungu: region.region_2depth_name,
      adminDong: region.region_3depth_name,
    };
  } catch (error) {
    console.log(
      '대시보드 행정동 조회 오류:',
      error
    );

    return null;
  }
};

export default function DashboardScreen({
  user,
  activeGroup,
  onBack,
  onLogout,
}) {
  const today = new Date().toLocaleDateString(
    'ko-KR',
    {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }
  );

  const [locations, setLocations] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState('');

  /*
   * =============================
   * 현재 그룹 실제 방문지 조회
   * =============================
   */
  const loadDashboard = useCallback(
    async () => {
      if (
        !activeGroup?.groupId ||
        !user?.userId
      ) {
        setLocations([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError('');

        /*
         * 현재 그룹 담당자 배정 목록
         *
         * 이 데이터 안의 taskId로
         * 현재 그룹에 연결된 방문지를 찾는다.
         */
        const assignmentData =
          await groupApi(
            `/api/groups/${activeGroup.groupId}/assignments?userId=${user.userId}`
          );

        /*
         * 전체 방문지 정보
         */
        const locationResponse =
          await fetch(
            `${API_BASE_URL}/api/locations?userId=${encodeURIComponent(user.userId)}&groupId=${encodeURIComponent(activeGroup.groupId)}`
          );

        if (!locationResponse.ok) {
          throw new Error(
            '방문지를 불러오지 못했습니다.'
          );
        }

        const locationData =
          await locationResponse.json();

        const assignments =
          Array.isArray(assignmentData)
            ? assignmentData
            : [];

        const allLocations =
          Array.isArray(locationData)
            ? locationData
            : [];

        /*
         * 현재 그룹에 배정된 방문지 taskId
         */
        const groupTaskIds =
          new Set(
            assignments
              .map((item) =>
                Number(item.taskId)
              )
              .filter(
                (id) =>
                  !Number.isNaN(id)
              )
          );

        /*
         * 전체 방문지 중 현재 그룹 방문지만 선택
         */
        const groupLocations =
          allLocations.filter((loc) => {
            const id = Number(
              loc.id ??
              loc.taskId ??
              loc.task_id
            );

            return groupTaskIds.has(id);
          });

        /*
         * 행정동이 이미 저장돼 있으면 사용.
         *
         * 예전 방문지처럼 adminDong이 없는 경우는
         * 위도/경도로 행정동을 다시 판별.
         */
        const resolvedLocations =
          await Promise.all(
            groupLocations.map(
              async (loc) => {
                const id =
                  loc.id ??
                  loc.taskId ??
                  loc.task_id;

                const existingAdminDong =
                  loc.adminDong ||
                  loc.admin_dong;

                if (existingAdminDong) {
                  return {
                    ...loc,
                    id,
                    adminDong:
                      existingAdminDong,
                    status:
                      normalizeStatus(
                        loc.status ??
                        loc.taskStatus ??
                        loc.task_status ??
                        loc.progressStatus ??
                        loc.progress_status
                      ),
                  };
                }

                const lat = Number(
                  loc.lat ??
                  loc.latitude
                );

                const lng = Number(
                  loc.lng ??
                  loc.longitude
                );

                if (
                  Number.isNaN(lat) ||
                  Number.isNaN(lng)
                ) {
                  return {
                    ...loc,
                    id,
                    adminDong:
                      '행정동 미확인',
                    status:
                      normalizeStatus(
                        loc.status ??
                        loc.taskStatus ??
                        loc.task_status ??
                        loc.progressStatus ??
                        loc.progress_status
                      ),
                  };
                }

                const region =
                  await getAdministrativeRegion(
                    lat,
                    lng
                  );

                return {
                  ...loc,
                  id,

                  sido:
                    loc.sido ||
                    region?.sido ||
                    '',

                  sigungu:
                    loc.sigungu ||
                    region?.sigungu ||
                    '',

                  adminDong:
                    region?.adminDong ||
                    '행정동 미확인',

                  status:
                    normalizeStatus(
                      loc.status ??
                      loc.taskStatus ??
                      loc.task_status ??
                      loc.progressStatus ??
                      loc.progress_status
                    ),
                };
              }
            )
          );

        setLocations(
          resolvedLocations
        );
      } catch (error) {
        console.log(
          '대시보드 조회 실패:',
          error
        );

        setLoadError(
          error.message ||
          '대시보드 데이터를 불러오지 못했습니다.'
        );

        setLocations([]);
      } finally {
        setLoading(false);
      }
    },
    [
      activeGroup?.groupId,
      user?.userId,
    ]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /*
   * =============================
   * KPI 실제 데이터
   * =============================
   */
  const totalCount =
    locations.length;

  const pendingCount =
    locations.filter(
      (loc) =>
        normalizeStatus(loc.status) ===
        'pending'
    ).length;

  const workingCount =
    locations.filter(
      (loc) =>
        normalizeStatus(loc.status) ===
        'working'
    ).length;

  const completeCount =
    locations.filter(
      (loc) =>
        normalizeStatus(loc.status) ===
        'complete'
    ).length;

  /*
   * =============================
   * 행정동별 실제 업무 집계
   * =============================
   *
   * 예:
   *
   * 하단1동 5
   * 다대1동 3
   * 괴정1동 1
   */
  const regionData = useMemo(() => {
    const map = new Map();

    locations.forEach((loc) => {
      const region =
        loc.adminDong ||
        loc.admin_dong ||
        '행정동 미확인';

      if (!map.has(region)) {
        map.set(region, {
          region,
          count: 0,
          pending: 0,
          working: 0,
          complete: 0,
        });
      }

      const target =
        map.get(region);

      target.count += 1;

      const status =
        normalizeStatus(loc.status);

      if (status === 'complete') {
        target.complete += 1;
      } else if (
        status === 'working'
      ) {
        target.working += 1;
      } else {
        target.pending += 1;
      }
    });

    return Array.from(
      map.values()
    ).sort(
      (a, b) =>
        b.count - a.count
    );
  }, [locations]);

  const maxRegionCount =
    Math.max(
      1,
      ...regionData.map(
        (item) => item.count
      )
    );

  /*
   * 히트맵에서 가장 큰 숫자.
   *
   * 숫자가 클수록 색을 진하게 표시.
   */
  const maxHeatCount =
    Math.max(
      1,
      ...regionData.flatMap(
        (item) => [
          item.pending,
          item.working,
          item.complete,
        ]
      )
    );

  const heatColor = (value) => {
    if (value === 0) {
      return '#EAF1F7';
    }

    const p =
      value / maxHeatCount;

    if (p > 0.75) {
      return '#12395B';
    }

    if (p > 0.5) {
      return '#2E6D9C';
    }

    if (p > 0.25) {
      return '#6EA5C8';
    }

    return '#BFD4E3';
  };

  const handleLogoutPress = () => {
    Alert.alert(
      '로그아웃',
      '로그아웃하시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: () =>
            onLogout?.(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <BackButton onPress={onBack} />

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            SAHA-GU OFFICE
          </Text>

          <Text style={styles.title}>
            외근 분석 대시보드
          </Text>
        </View>

        {/* 로그아웃 + 이름 + 원 */}
        <View style={styles.userArea}>
          <TouchableOpacity
            style={
              styles.logoutButton
            }
            onPress={
              handleLogoutPress
            }
            activeOpacity={0.8}
          >
            <Text
              style={
                styles.logoutText
              }
            >
              로그아웃
            </Text>
          </TouchableOpacity>

          <Text
            style={styles.userName}
            numberOfLines={1}
          >
            {user?.name ||
              user?.loginId ||
              '사용자'}
          </Text>

          <View
            style={
              styles.userCircle
            }
          >
            <Text
              style={
                styles.userText
              }
            >
              {String(
                user?.name ||
                user?.loginId ||
                '사'
              ).slice(0, 1)}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View
          style={
            styles.loadingBox
          }
        >
          <ActivityIndicator
            size="large"
            color="#12395B"
          />

          <Text
            style={
              styles.loadingText
            }
          >
            그룹 방문지 현황을 불러오는 중...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.body
          }
          showsVerticalScrollIndicator={
            false
          }
        >
          {!activeGroup ? (
            <View
              style={styles.card}
            >
              <Text
                style={
                  styles.cardTitle
                }
              >
                선택된 그룹이 없습니다
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                메인 화면에서 그룹을 선택한 후 다시 확인해 주세요.
              </Text>
            </View>
          ) : loadError ? (
            <View
              style={styles.card}
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {loadError}
              </Text>
            </View>
          ) : (
            <>
              {/* 실제 KPI */}
              <View
                style={
                  styles.kpiRow
                }
              >
                <Kpi
                  label="전체"
                  value={`${totalCount}건`}
                />

                <Kpi
                  label="작업 전"
                  value={`${pendingCount}건`}
                />

                <Kpi
                  label="작업 중"
                  value={`${workingCount}건`}
                />

                <Kpi
                  label="완료"
                  value={`${completeCount}건`}
                />
              </View>

              {/* 지역별 실제 업무 집중도 */}
              <View
                style={styles.card}
              >
                <Text
                  style={
                    styles.cardEyebrow
                  }
                >
                  AREA ANALYSIS
                </Text>

                <Text
                  style={
                    styles.cardTitle
                  }
                >
                  지역별 업무 집중도
                </Text>

                {regionData.length ===
                0 ? (
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    현재 그룹에 배정된 방문지가 없습니다.
                  </Text>
                ) : (
                  regionData.map(
                    (item) => (
                      <View
                        key={
                          item.region
                        }
                        style={
                          styles.barRow
                        }
                      >
                        <Text
                          style={
                            styles.region
                          }
                          numberOfLines={
                            1
                          }
                        >
                          {
                            item.region
                          }
                        </Text>

                        <View
                          style={
                            styles.barTrack
                          }
                        >
                          <View
                            style={[
                              styles.barFill,
                              {
                                width:
                                  `${
                                    (
                                      item.count /
                                      maxRegionCount
                                    ) *
                                    100
                                  }%`,
                              },
                            ]}
                          >
                            <Text
                              style={
                                styles.barText
                              }
                            >
                              {
                                item.count
                              }
                              건
                            </Text>
                          </View>
                        </View>
                      </View>
                    )
                  )
                )}
              </View>

              {/* 실제 상태 히트맵 */}
              <View
                style={styles.card}
              >
                <Text
                  style={
                    styles.cardEyebrow
                  }
                >
                  FIELDWORK HEATMAP
                </Text>

                <Text
                  style={
                    styles.cardTitle
                  }
                >
                  지역별 업무 상태 히트맵
                </Text>

                {regionData.length ===
                0 ? (
                  <Text
                    style={
                      styles.emptyText
                    }
                  >
                    표시할 업무 현황이 없습니다.
                  </Text>
                ) : (
                  <>
                    <View
                      style={
                        styles.heatHeader
                      }
                    >
                      <View
                        style={{
                          width: 70,
                        }}
                      />

                      <Text
                        style={
                          styles.heatDay
                        }
                      >
                        작업 전
                      </Text>

                      <Text
                        style={
                          styles.heatDay
                        }
                      >
                        작업 중
                      </Text>

                      <Text
                        style={
                          styles.heatDay
                        }
                      >
                        완료
                      </Text>
                    </View>

                    {regionData.map(
                      (item) => (
                        <View
                          key={
                            `heat-${item.region}`
                          }
                          style={
                            styles.heatRow
                          }
                        >
                          <Text
                            style={
                              styles.week
                            }
                            numberOfLines={
                              1
                            }
                          >
                            {
                              item.region
                            }
                          </Text>

                          <HeatCell
                            value={
                              item.pending
                            }
                            color={heatColor(
                              item.pending
                            )}
                          />

                          <HeatCell
                            value={
                              item.working
                            }
                            color={heatColor(
                              item.working
                            )}
                          />

                          <HeatCell
                            value={
                              item.complete
                            }
                            color={heatColor(
                              item.complete
                            )}
                          />
                        </View>
                      )
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({
  label,
  value,
}) {
  return (
    <View style={styles.kpi}>
      <Text
        style={
          styles.kpiValue
        }
      >
        {value}
      </Text>

      <Text
        style={
          styles.kpiLabel
        }
      >
        {label}
      </Text>
    </View>
  );
}

function HeatCell({
  value,
  color,
}) {
  return (
    <View
      style={[
        styles.heatCell,
        {
          backgroundColor:
            color,
        },
      ]}
    >
      <Text
        style={[
          styles.heatNumber,
          {
            color:
              color ===
              '#12395B'
                ? '#FFFFFF'
                : '#1F2D3D',
          },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#F4F7FA',
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14, paddingTop: 30, paddingBottom: 14,
      backgroundColor:
        '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor:
        '#D9E1EA',
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.8,
      color: '#607086',
    },

    title: {
      fontSize: 17,
      fontWeight: '900',
      color: '#1F2D3D',
      marginTop: 2,
    },

    desc: {
      fontSize: 10,
      color: '#718096',
      marginTop: 2,
    },

    userArea: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      maxWidth: 170,
    },

    logoutButton: {
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor:
        '#FDECEC',
    },

    logoutText: {
      fontSize: 9,
      fontWeight: '900',
      color: '#D94C4C',
    },

    userName: {
      maxWidth: 60,
      fontSize: 10,
      fontWeight: '900',
      color: '#1F2D3D',
    },

    userCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor:
        '#12395B',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    userText: {
      color: '#FFFFFF',
      fontWeight: '900',
    },

    body: {
      padding: 16,
      gap: 14,
      paddingBottom: 28,
    },

    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 11,
      fontWeight: '800',
      color: '#607086',
    },

    kpiRow: {
      flexDirection: 'row',
      gap: 7,
    },

    kpi: {
      flex: 1,
      backgroundColor:
        '#FFFFFF',
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderWidth: 1,
      borderColor:
        '#D9E1EA',
      alignItems: 'center',
    },

    kpiValue: {
      fontSize: 16,
      fontWeight: '900',
      color: '#12395B',
    },

    kpiLabel: {
      fontSize: 9,
      fontWeight: '800',
      color: '#607086',
      marginTop: 5,
    },

    card: {
      backgroundColor:
        '#FFFFFF',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor:
        '#D9E1EA',
    },

    cardEyebrow: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.6,
      color: '#607086',
    },

    cardTitle: {
      fontSize: 15,
      fontWeight: '900',
      color: '#1F2D3D',
      marginTop: 4,
      marginBottom: 14,
    },

    barRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 11,
    },

    region: {
      width: 70,
      fontSize: 10,
      color: '#607086',
      fontWeight: '800',
    },

    barTrack: {
      flex: 1,
      height: 28,
      borderRadius: 9,
      backgroundColor:
        '#F1F5F9',
      overflow: 'hidden',
    },

    barFill: {
      height: 28,
      minWidth: 35,
      borderRadius: 9,
      backgroundColor:
        '#12395B',
      justifyContent:
        'center',
      paddingHorizontal: 8,
    },

    barText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
    },

    heatHeader: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
      alignItems: 'center',
    },

    heatDay: {
      flex: 1,
      textAlign: 'center',
      fontSize: 9,
      color: '#718096',
      fontWeight: '800',
    },

    heatRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
      alignItems: 'center',
    },

    week: {
      width: 70,
      fontSize: 9,
      color: '#718096',
      fontWeight: '800',
    },

    heatCell: {
      flex: 1,
      height: 38,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    heatNumber: {
      fontSize: 11,
      fontWeight: '900',
    },

    emptyText: {
      fontSize: 11,
      color: '#718096',
    },

    errorText: {
      fontSize: 11,
      color: '#D94C4C',
      fontWeight: '800',
    },
  });
