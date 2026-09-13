import { showAlert } from '../components/CustomAlert';
import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const getStatusInfo = (statusValue) => {
  const status = String(statusValue || '').toLowerCase();

  if (status === 'working') {
    return {
      label: '작업 중',
      styleName: 'progressStatus',
    };
  }

  return {
    label: '작업 전',
    styleName: 'pendingStatus',
  };
};

export default function MainScreen({
  user,
  activeGroup,
  groupAssignments = [],
  onRoute,
  onReport,
  onGroup,
  onWorkStatus,
  onDashboard,
  locations = [],
  setLocations,
}) {
  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  const [incompleteLocations, setIncompleteLocations] =
    React.useState([]);

  const [selectedIds, setSelectedIds] =
    React.useState([]);

  const [deletingId, setDeletingId] =
    React.useState(null);

  const myAssignments = activeGroup
    ? groupAssignments.filter(
        (item) =>
          Number(item.assigneeUserId) ===
          Number(user?.userId)
      )
    : [];

  const displayLocations = activeGroup
    ? myAssignments
    : locations;

  const displayTotal = displayLocations.length;
  const displayComplete = displayLocations.filter(
    (item) => {
      const status = String(
        item.status ||
        item.taskStatus ||
        ''
      ).toLowerCase();
      return status === 'complete' || status === 'done';
    }
  ).length;
  const displayPending = displayTotal - displayComplete;
  const displayProgress = displayTotal === 0
    ? 0
    : Math.round((displayComplete / displayTotal) * 100);

  const myAssignmentIds = new Set(
    myAssignments.map((item) =>
      Number(item.taskId ?? item.locationId)
    )
  );

  const visibleIncompleteLocations = activeGroup
    ? incompleteLocations.filter((item) =>
        myAssignmentIds.has(Number(item.id ?? item.taskId ?? item.task_id))
      )
    : incompleteLocations;

  React.useEffect(() => {
    loadIncompleteLocations();
  }, [locations, user?.userId, activeGroup?.groupId]);

  const loadIncompleteLocations = async () => {
    try {
      if (!API_BASE_URL) {
        console.log('API_BASE_URL 없음');
        return;
      }

      if (!user?.userId) {
        setIncompleteLocations([]);
        return;
      }

      const query =
        `userId=${encodeURIComponent(user.userId)}` +
        (activeGroup?.groupId
          ? `&groupId=${encodeURIComponent(activeGroup.groupId)}`
          : '');

      const res = await fetch(
        `${API_BASE_URL}/api/locations?${query}`
      );

      const text = await res.text();

      console.log(
        '미처리 작업 조회 상태:',
        res.status
      );

      console.log(
        '미처리 작업 조회 내용:',
        text
      );

      if (!res.ok) {
        throw new Error(
          `미처리 작업 조회 실패: ${res.status}`
        );
      }

      const data = JSON.parse(text);

      const incomplete = data
        .map((loc) => {
          const status =
            loc.status ||
            loc.taskStatus ||
            loc.task_status ||
            loc.progressStatus ||
            loc.progress_status ||
            'pending';

          return {
            ...loc,

            id:
              loc.id ??
              loc.taskId ??
              loc.task_id,

            detailAddress:
              loc.detailAddress ||
              loc.detail_address,

            roadAddress:
              loc.roadAddress ||
              loc.road_address,

            lat:
              loc.lat ??
              loc.latitude,

            lng:
              loc.lng ??
              loc.longitude,

            status,

            task:
              loc.task ||
              loc.taskCategory ||
              loc.task_category ||
              '현장 확인',
          };
        })
        .filter((loc) => {
          const status = String(
            loc.status || ''
          ).toLowerCase();

          return (
            status === 'pending' ||
            status === 'working'
          );
        });

      setIncompleteLocations(incomplete);
    } catch (error) {
      console.log(error);

      showAlert(
        '오류',
        '미처리 작업을 불러오지 못했습니다.'
      );
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter(
          (itemId) =>
            itemId !== id
        );
      }

      return [
        ...prev,
        id,
      ];
    });
  };

  const toggleSelectAll = () => {
    if (
      selectedIds.length ===
      visibleIncompleteLocations.length
    ) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds(
      visibleIncompleteLocations.map(
        (loc) => loc.id
      )
    );
  };

  const addSelectedToToday = () => {
    const selectedItems =
      visibleIncompleteLocations.filter(
        (loc) =>
          selectedIds.includes(
            loc.id
          )
      );

    if (
      selectedItems.length === 0
    ) {
      showAlert(
        '선택 필요',
        '오늘 외근에 추가할 작업을 선택하세요.'
      );

      return;
    }

    setLocations?.((prev) => {
      const current =
        prev || [];

      const currentIds =
        new Set(
          current.map(
            (loc) => loc.id
          )
        );

      const onlyNewItems =
        selectedItems.filter(
          (loc) =>
            !currentIds.has(
              loc.id
            )
        );

      return [
        ...current,
        ...onlyNewItems,
      ];
    });

    setSelectedIds([]);

    showAlert(
      '추가 완료',
      `${selectedItems.length}개의 미처리 작업을 오늘 외근에 추가했습니다.`
    );
  };

  /*
   * ===============================
   * 미처리 방문지 삭제
   * ===============================
   *
   * 백엔드 정책상
   * pending(작업 전)만 삭제 가능.
   *
   * 삭제 성공 시:
   * 1. 서버 DB 삭제
   * 2. 미처리 목록에서 제거
   * 3. 선택 목록에서 제거
   * 4. 오늘 외근 목록에서도 제거
   *
   * App.js의 routeLocations가 변경되므로
   * AsyncStorage도 자동 갱신된다.
   */
  const deleteIncompleteLocation = (
    item
  ) => {
    const status = String(
      item.status || ''
    ).toLowerCase();

    if (status !== 'pending') {
      showAlert(
        '삭제 불가',
        '작업 전 방문지만 삭제할 수 있습니다.'
      );

      return;
    }

    const taskId =
      item.id ??
      item.taskId ??
      item.task_id;

    if (!taskId) {
      showAlert(
        '삭제 실패',
        '방문지 ID를 찾을 수 없습니다.'
      );

      return;
    }

    const name =
      item.detailAddress ||
      item.roadAddress ||
      '방문지';

    Alert.alert(
      '미처리 작업 삭제',
      `${name}을(를) 삭제하시겠습니까?`,
      [
        {
          text: '취소',
          style: 'cancel',
        },
        {
          text: '삭제',
          style: 'destructive',

          onPress: async () => {
            if (
              deletingId !== null
            ) {
              return;
            }

            try {
              setDeletingId(taskId);

              const response =
                await fetch(
                  `${API_BASE_URL}/api/locations/${taskId}`,
                  {
                    method:
                      'DELETE',
                  }
                );

              const text =
                await response.text();

              if (!response.ok) {
                throw new Error(
                  text ||
                    `삭제 실패: ${response.status}`
                );
              }

              /*
               * 메인 미처리 목록에서 제거
               */
              setIncompleteLocations(
                (prev) =>
                  prev.filter(
                    (loc) =>
                      Number(
                        loc.id ??
                          loc.taskId ??
                          loc.task_id
                      ) !==
                      Number(
                        taskId
                      )
                  )
              );

              /*
               * 선택 상태에서도 제거
               */
              setSelectedIds(
                (prev) =>
                  prev.filter(
                    (id) =>
                      Number(id) !==
                      Number(
                        taskId
                      )
                  )
              );

              /*
               * 오늘 외근 목록에서도 제거
               *
               * App.js의 routeLocations가
               * 바뀌기 때문에 AsyncStorage도
               * 자동으로 갱신된다.
               */
              setLocations?.(
                (prev) =>
                  (
                    prev || []
                  ).filter(
                    (loc) =>
                      Number(
                        loc.id ??
                          loc.taskId ??
                          loc.task_id
                      ) !==
                      Number(
                        taskId
                      )
                  )
              );

              showAlert(
                '삭제 완료',
                '미처리 작업을 삭제했습니다.'
              );
            } catch (error) {
              console.log(
                '미처리 작업 삭제 오류:',
                error
              );

              showAlert(
                '삭제 실패',
                error.message ||
                  '미처리 작업을 삭제하지 못했습니다.'
              );
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingBottom: 24,
      }}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text
              style={
                styles.headerEyebrow
              }
            >
              SAHA-GU OFFICE
            </Text>

            <Text
              style={
                styles.headerTitle
              }
            >
              외근 업무 현황
            </Text>

            <Text
              style={
                styles.headerDesc
              }
            >
              {today} · 도시안전과
            </Text>
          </View>

          <TouchableOpacity
            onPress={
              onDashboard
            }
            style={
              styles.profile
            }
            activeOpacity={0.85}
          >
            <View
              style={
                styles.avatar
              }
            >
              <Text
                style={
                  styles.avatarText
                }
              >
                SG
              </Text>
            </View>

            <View>
              <Text
                style={
                  styles.profileName
                }
              >
                {user?.name ||
                  user?.loginId ||
                  '사용자'}
              </Text>

              <Text
                style={
                  styles.profileTeam
                }
              >
                {activeGroup?.groupName ||
                  '개인 외근'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View
          style={
            styles.progressBox
          }
        >
          <View
            style={
              styles.rowBetween
            }
          >
            <Text
              style={
                styles.progressLabel
              }
            >
              오늘 업무 진행률
            </Text>

            <Text
              style={
                styles.progressLabel
              }
            >
              {displayProgress}%
            </Text>
          </View>

          <View
            style={
              styles.progressTrack
            }
          >
            <View
              style={[
                styles.progressFill,
                {
                  width:
                    `${displayProgress}%`,
                },
              ]}
            />
          </View>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <Kpi
          title={activeGroup ? '내 담당' : '오늘 외근'}
          value={`${displayTotal}`}
        />

        <Kpi
          title={activeGroup ? '내 완료' : '완료'}
          value={`${displayComplete}`}
          color="#1F9D55"
        />

        <Kpi
          title={activeGroup ? '내 미완료' : '미완료'}
          value={`${displayPending}`}
          color="#F39C12"
        />
      </View>

      <View style={styles.currentWorkCard}>
        <View style={styles.currentWorkHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardEyebrow}>
              {activeGroup ? 'CURRENT GROUP' : 'TODAY'}
            </Text>
            <Text style={styles.currentWorkTitle}>
              {activeGroup?.groupName || '개인 외근'}
            </Text>
          </View>
          <View style={styles.currentRoleBadge}>
            <Text style={styles.currentRoleText}>
              {activeGroup
                ? activeGroup.role === 'LEADER'
                  ? '팀장'
                  : '팀원'
                : '개인'}
            </Text>
          </View>
        </View>

        <Text style={styles.currentWorkDesc}>
          {activeGroup
            ? activeGroup.role === 'LEADER'
              ? `내 담당 ${displayTotal}곳 · 팀 전체 ${groupAssignments.length}곳`
              : `내 담당 방문지 ${displayTotal}곳`
            : `내가 등록한 방문지 ${displayTotal}곳`}
        </Text>

        {activeGroup?.role === 'LEADER' ? (
          <View style={styles.currentWorkButtons}>
            <TouchableOpacity
              style={styles.currentWorkSecondaryButton}
              onPress={onRoute}
              activeOpacity={0.85}
            >
              <Text style={styles.currentWorkSecondaryText}>내 업무 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.currentWorkPrimaryButton}
              onPress={onWorkStatus}
              activeOpacity={0.85}
            >
              <Text style={styles.currentWorkPrimaryText}>팀 작업현황</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.currentWorkPrimaryButton}
            onPress={activeGroup ? onWorkStatus : onRoute}
            activeOpacity={0.85}
          >
            <Text style={styles.currentWorkPrimaryText}>
              {activeGroup ? '내 담당 업무 보기' : '내 업무 지도 보기'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {visibleIncompleteLocations.length >
        0 && (
        <View style={styles.card}>
          <View
            style={
              styles.incompleteHeader
            }
          >
            <View>
              <Text
                style={
                  styles.cardEyebrow
                }
              >
                INCOMPLETE FIELDWORK
              </Text>

              <Text
                style={
                  styles.cardTitle
                }
              >
                미처리 작업
              </Text>
            </View>

            <TouchableOpacity
              style={
                styles.selectAllButton
              }
              onPress={
                toggleSelectAll
              }
            >
              <Text
                style={
                  styles.selectAllText
                }
              >
                {selectedIds.length ===
                visibleIncompleteLocations.length
                  ? '전체 해제'
                  : '전체 선택'}
              </Text>
            </TouchableOpacity>
          </View>

          {visibleIncompleteLocations.map(
            (item, index) => {
              const selected =
                selectedIds.includes(
                  item.id
                );

              const statusInfo =
                getStatusInfo(
                  item.status
                );

              const status =
                String(
                  item.status || ''
                ).toLowerCase();

              const canDelete =
                status === 'pending';

              const deleting =
                Number(
                  deletingId
                ) ===
                Number(
                  item.id
                );

              return (
                <View
                  key={`${item.id}-${index}`}
                  style={
                    styles.incompleteItem
                  }
                >
                  <TouchableOpacity
                    onPress={() =>
                      toggleSelect(
                        item.id
                      )
                    }
                    style={[
                      styles.circleSelect,
                      selected &&
                        styles.circleSelectActive,
                    ]}
                    activeOpacity={
                      0.8
                    }
                  >
                    {selected && (
                      <Text
                        style={
                          styles.circleCheckText
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View
                    style={{
                      flex: 1,
                    }}
                  >
                    <Text
                      style={
                        styles.entryName
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {item.detailAddress ||
                        '이름 없음'}
                    </Text>

                    <Text
                      style={
                        styles.entryMemo
                      }
                      numberOfLines={
                        1
                      }
                    >
                      {item.roadAddress ||
                        '주소 없음'}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.itemRight
                    }
                  >
                    <Text
                      style={[
                        styles.entryStatus,
                        styles[
                          statusInfo
                            .styleName
                        ],
                      ]}
                    >
                      {
                        statusInfo.label
                      }
                    </Text>

                    {canDelete && (
                      <TouchableOpacity
                        style={[
                          styles.deleteButton,
                          deleting &&
                            styles.deleteButtonDisabled,
                        ]}
                        disabled={
                          deleting
                        }
                        activeOpacity={
                          0.8
                        }
                        onPress={() =>
                          deleteIncompleteLocation(
                            item
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.deleteButtonText,
                            deleting &&
                              styles.deleteButtonTextDisabled,
                          ]}
                        >
                          {deleting
                            ? '삭제중'
                            : '삭제'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            }
          )}

          <TouchableOpacity
            style={[
              styles.addTodayButton,
              selectedIds.length ===
                0 &&
                styles.addTodayButtonDisabled,
            ]}
            onPress={
              addSelectedToToday
            }
            disabled={
              selectedIds.length ===
              0
            }
            activeOpacity={0.85}
          >
            <Text
              style={
                styles.addTodayText
              }
            >
              선택한 작업 오늘 외근에 추가
              {selectedIds.length >
              0
                ? ` (${selectedIds.length})`
                : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View
        style={
          styles.actions
        }
      >
        <Action
          title="경로 설정"
          desc="방문지 선택 및 최적 경로 확인"
          icon="🗺️"
          onPress={onRoute}
        />

        <Action
          title="보고서 생성"
          desc="현장 기록 기반 자동 보고서"
          icon="📄"
          onPress={onReport}
        />

        <Action
          title="그룹 설정"
          desc={
            activeGroup
              ? `${activeGroup.groupName} · 방문지 분담`
              : '그룹 생성, 초대 및 방문지 분담'
          }
          icon="👥"
          onPress={onGroup}
        />

      </View>

      <View style={styles.card}>
        <Text
          style={
            styles.cardEyebrow
          }
        >
          RECENT FIELDWORK
        </Text>

        <Text
          style={
            styles.cardTitle
          }
        >
          최근 방문 기록
        </Text>

        <Text
          style={
            styles.emptyText
          }
        >
          최근 방문 기록이 없습니다.
        </Text>
      </View>
    </ScrollView>
  );
}

function Kpi({
  title,
  value,
  color = '#12395B',
}) {
  return (
    <View style={styles.kpi}>
      <Text
        style={[
          styles.kpiValue,
          {
            color,
          },
        ]}
      >
        {value}
      </Text>

      <Text
        style={
          styles.kpiTitle
        }
      >
        {title}
      </Text>
    </View>
  );
}

function Action({
  title,
  desc,
  icon,
  onPress,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.action}
      activeOpacity={0.85}
    >
      <Text
        style={
          styles.actionIcon
        }
      >
        {icon}
      </Text>

      <Text
        style={
          styles.actionTitle
        }
      >
        {title}
      </Text>

      <Text
        style={
          styles.actionDesc
        }
      >
        {desc}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      '#F4F7FA',
  },

  header: {
    backgroundColor:
      '#12395B',

    padding: 20,
    paddingTop: 22,

    borderBottomWidth: 4,
    borderBottomColor:
      '#0F2E4A',
  },

  headerTop: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    gap: 12,
    marginBottom: 20,
  },

  headerEyebrow: {
    color:
      'rgba(255,255,255,.6)',

    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.2,
  },

  headerTitle: {
    color: 'white',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
  },

  headerDesc: {
    color:
      'rgba(255,255,255,.6)',

    fontSize: 10,
    marginTop: 4,
  },

  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,

    backgroundColor:
      'rgba(255,255,255,.1)',

    borderColor:
      'rgba(255,255,255,.2)',

    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
  },

  avatar: {
    width: 32,
    height: 32,

    borderRadius: 16,

    backgroundColor:
      'rgba(255,255,255,.2)',

    alignItems: 'center',
    justifyContent:
      'center',
  },

  avatarText: {
    color: 'white',
    fontWeight: '900',
  },

  profileName: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },

  profileTeam: {
    color:
      'rgba(255,255,255,.55)',

    fontSize: 9,
  },

  progressBox: {
    backgroundColor:
      'rgba(255,255,255,.1)',

    borderWidth: 1,

    borderColor:
      'rgba(255,255,255,.15)',

    borderRadius: 18,
    padding: 14,
  },

  rowBetween: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
  },

  progressLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },

  progressTrack: {
    height: 8,
    borderRadius: 8,

    backgroundColor:
      'rgba(255,255,255,.18)',

    marginTop: 10,
    overflow: 'hidden',
  },

  progressFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor:
      'white',
  },

  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: -18,
  },

  kpi: {
    flex: 1,
    backgroundColor:
      'white',

    borderRadius: 18,
    padding: 14,

    alignItems: 'center',

    borderWidth: 1,
    borderColor:
      '#D9E1EA',
  },

  kpiValue: {
    fontSize: 24,
    fontWeight: '900',
  },

  kpiTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#607086',
    marginTop: 4,
  },

  currentWorkCard: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  currentWorkHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  currentWorkTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 5,
  },

  currentRoleBadge: {
    backgroundColor: '#EAF1F7',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  currentRoleText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#12395B',
  },

  currentWorkDesc: {
    fontSize: 11,
    color: '#718096',
    marginTop: 12,
    marginBottom: 14,
  },

  currentWorkButtons: {
    flexDirection: 'row',
    gap: 8,
  },

  currentWorkPrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#12395B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  currentWorkPrimaryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  currentWorkSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFCEDB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  currentWorkSecondaryText: {
    color: '#12395B',
    fontSize: 11,
    fontWeight: '900',
  },

  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
  },

  action: {
    flexGrow: 1,
    flexBasis: '46%',

    backgroundColor:
      'white',

    borderRadius: 18,
    padding: 16,

    borderWidth: 1,
    borderColor:
      '#D9E1EA',
  },

  actionIcon: {
    fontSize: 26,
    marginBottom: 12,
  },

  actionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  actionDesc: {
    fontSize: 10,
    color: '#718096',
    lineHeight: 16,
    marginTop: 6,
  },

  card: {
    backgroundColor:
      'white',

    marginHorizontal: 16,
    marginTop: 16,

    borderRadius: 18,
    padding: 16,

    borderWidth: 1,
    borderColor:
      '#D9E1EA',
  },

  cardEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 4,
    marginBottom: 12,
  },

  incompleteHeader: {
    flexDirection: 'row',
    justifyContent:
      'space-between',

    alignItems:
      'flex-start',

    marginBottom: 8,
  },

  selectAllButton: {
    backgroundColor:
      '#EAF1F7',

    borderRadius: 999,

    paddingHorizontal: 10,
    paddingVertical: 6,

    borderWidth: 1,
    borderColor:
      '#D9E1EA',
  },

  selectAllText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#12395B',
  },

  incompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',

    gap: 10,

    paddingVertical: 10,

    borderTopWidth: 1,
    borderTopColor:
      '#EEF2F6',
  },

  circleSelect: {
    width: 24,
    height: 24,

    borderRadius: 12,

    borderWidth: 2,
    borderColor:
      '#B0B8C1',

    backgroundColor:
      '#F1F3F5',

    alignItems: 'center',
    justifyContent:
      'center',
  },

  circleSelectActive: {
    backgroundColor:
      '#12395B',

    borderColor:
      '#12395B',
  },

  circleCheckText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },

  /*
   * 상태 + 삭제 버튼을
   * 오른쪽에 세로 정렬
   */
  itemRight: {
    minWidth: 54,

    alignItems:
      'center',

    justifyContent:
      'center',

    gap: 5,
  },

  deleteButton: {
    minWidth: 48,

    paddingHorizontal: 8,
    paddingVertical: 4,

    borderRadius: 10,

    borderWidth: 1,
    borderColor:
      '#E74C3C',

    backgroundColor:
      '#FFFFFF',

    alignItems:
      'center',

    justifyContent:
      'center',
  },

  deleteButtonDisabled: {
    borderColor:
      '#B0B8C1',

    backgroundColor:
      '#F1F3F5',
  },

  deleteButtonText: {
    color: '#E74C3C',
    fontSize: 9,
    fontWeight: '900',
  },

  deleteButtonTextDisabled: {
    color: '#A0AEC0',
  },

  addTodayButton: {
    marginTop: 12,

    backgroundColor:
      '#12395B',

    borderRadius: 14,

    paddingVertical: 12,

    alignItems:
      'center',
  },

  addTodayButtonDisabled: {
    backgroundColor:
      '#B0B8C1',
  },

  addTodayText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },

  entryName: {
    color: '#1F2D3D',
    fontSize: 12,
    fontWeight: '900',
  },

  entryMemo: {
    color: '#718096',
    fontSize: 10,
    marginTop: 2,
  },

  entryStatus: {
    fontSize: 9,
    fontWeight: '900',

    borderRadius: 10,

    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  pendingStatus: {
    color: '#E74C3C',

    backgroundColor:
      '#FDECEC',
  },

  progressStatus: {
    color: '#B7791F',

    backgroundColor:
      '#FFF4CC',
  },

  emptyText: {
    fontSize: 11,
    color: '#718096',
  },
});
