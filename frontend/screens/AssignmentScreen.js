import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton } from '../components/ui';
import { API_BASE_URL } from '../utils/api';
import { groupApi } from '../utils/groupApi';

const KAKAO_REST_API_KEY =
  process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

/*
 * 좌표 -> 행정동 조회
 * H = 행정동
 * B = 법정동
 */
const getAdministrativeRegion = async (lat, lng) => {
  if (!KAKAO_REST_API_KEY) {
    console.log('카카오 REST API 키가 없습니다.');
    return null;
  }

  try {
    const url =
      'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json' +
      `?x=${encodeURIComponent(lng)}` +
      `&y=${encodeURIComponent(lat)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.log('행정동 조회 실패:', response.status);
      return null;
    }

    const data = await response.json();

    const region = data.documents?.find(
      (item) => item.region_type === 'H'
    );

    if (!region) return null;

    return {
      sido: region.region_1depth_name,
      sigungu: region.region_2depth_name,
      adminDong: region.region_3depth_name,
    };
  } catch (error) {
    console.log('행정동 조회 오류:', error);
    return null;
  }
};

export default function AssignmentScreen({
  user,
  group,
  onBack,
  onChanged,
}) {
  const [members, setMembers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedArea, setSelectedArea] = useState(null);
  const [assignmentMode, setAssignmentMode] = useState('area');
  const [saving, setSaving] = useState(false);

  /*
   * 데이터 조회
   */
  const load = useCallback(async () => {
    if (!group?.groupId || !user?.userId) return;

    try {
      setLoading(true);

      const [memberData, assignmentData, locationResponse] =
        await Promise.all([
          groupApi(
            `/api/groups/${group.groupId}/members?userId=${user.userId}`
          ),
          groupApi(
            `/api/groups/${group.groupId}/assignments?userId=${user.userId}`
          ),
          fetch(
            `${API_BASE_URL}/api/locations?userId=${encodeURIComponent(user.userId)}&groupId=${encodeURIComponent(group.groupId)}`
          ),
        ]);

      if (!locationResponse.ok) {
        throw new Error('방문지 목록을 불러오지 못했습니다.');
      }

      const locationData = await locationResponse.json();

      const rawLocations = Array.isArray(locationData)
        ? locationData
        : [];

      /*
       * 기존 방문지도 adminDong이 없으면
       * lat/lng를 이용해서 자동으로 행정동 확인
       */
      const resolvedLocations = await Promise.all(
        rawLocations.map(async (loc) => {
          const id =
            loc.id ??
            loc.taskId ??
            loc.task_id;

          /*
           * 이미 행정동이 있으면 그대로 사용
           */
          if (loc.adminDong || loc.admin_dong) {
            return {
              ...loc,
              id,
              adminDong:
                loc.adminDong ||
                loc.admin_dong,
            };
          }

          const lat = Number(loc.lat);
          const lng = Number(loc.lng);

          /*
           * 좌표가 없으면 판별 불가
           */
          if (
            Number.isNaN(lat) ||
            Number.isNaN(lng)
          ) {
            return {
              ...loc,
              id,
            };
          }

          const region =
            await getAdministrativeRegion(
              lat,
              lng
            );

          if (!region) {
            return {
              ...loc,
              id,
            };
          }

          console.log(
            '행정동 자동 판별:',
            loc.detailAddress ||
              loc.detail_address ||
              loc.name,
            '->',
            region.adminDong
          );

          return {
            ...loc,
            id,
            sido: region.sido,
            sigungu: region.sigungu,
            adminDong: region.adminDong,
            admin_dong: region.adminDong,
          };
        })
      );

      setMembers(
        Array.isArray(memberData)
          ? memberData
          : []
      );

      setAssignments(
        Array.isArray(assignmentData)
          ? assignmentData
          : []
      );

      setLocations(resolvedLocations);
    } catch (error) {
      Alert.alert(
        '담당자 배정 조회 실패',
        error.message
      );
    } finally {
      setLoading(false);
    }
  }, [
    group?.groupId,
    user?.userId,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * taskId -> 담당자 정보
   */
  const assignmentMap = useMemo(() => {
    const map = new Map();

    assignments.forEach((item) => {
      map.set(
        Number(item.taskId),
        item
      );
    });

    return map;
  }, [assignments]);

  /*
   * 행정동별 자동 그룹화
   */
  const areaGroups = useMemo(() => {
    const grouped = new Map();

    locations.forEach((loc) => {
      const id = Number(
        loc.id ??
        loc.taskId ??
        loc.task_id
      );

      const sido =
        loc.sido || '';

      const sigungu =
        loc.sigungu || '';

      const adminDong =
        loc.adminDong ||
        loc.admin_dong ||
        '행정동 미확인';

      const key =
        adminDong === '행정동 미확인'
          ? 'unknown'
          : `${sido}|${sigungu}|${adminDong}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          sido,
          sigungu,
          adminDong,
          locations: [],
        });
      }

      grouped
        .get(key)
        .locations
        .push({
          ...loc,
          id,
        });
    });

    return Array.from(
      grouped.values()
    );
  }, [locations]);

  /*
   * 방문지 1개 담당자 지정
   */
  const assign = async (member) => {
    if (!selectedTask || saving) return;

    try {
      setSaving(true);

      const data = await groupApi(
        `/api/groups/${group.groupId}/assignments/${selectedTask.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            leaderUserId:
              user.userId,
            assigneeUserId:
              member.userId,
          }),
        }
      );

      setAssignments((prev) => {
        const filtered =
          prev.filter(
            (item) =>
              Number(item.taskId) !==
              Number(selectedTask.id)
          );

        return [
          data,
          ...filtered,
        ];
      });

      setSelectedTask(null);
      onChanged?.();
    } catch (error) {
      Alert.alert(
        '담당자 지정 실패',
        error.message
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * 행정동 전체 일괄 담당자 지정
   */
  const assignArea = async (member) => {
    if (!selectedArea || saving) return;

    try {
      setSaving(true);

      const taskIds =
        selectedArea.locations
          .map((loc) =>
            Number(loc.id)
          )
          .filter(
            (id) =>
              !Number.isNaN(id)
          );

      if (taskIds.length === 0) {
        throw new Error(
          '배정할 방문지가 없습니다.'
        );
      }

      const data = await groupApi(
        `/api/groups/${group.groupId}/bulk-assignments`,
        {
          method: 'PUT',
          body: JSON.stringify({
            leaderUserId:
              user.userId,
            assigneeUserId:
              member.userId,
            taskIds,
          }),
        }
      );

      const updated =
        Array.isArray(data)
          ? data
          : [];

      setAssignments((prev) => {
        const updatedIds =
          new Set(
            updated.map(
              (item) =>
                Number(item.taskId)
            )
          );

        const remaining =
          prev.filter(
            (item) =>
              !updatedIds.has(
                Number(item.taskId)
              )
          );

        return [
          ...updated,
          ...remaining,
        ];
      });

      setSelectedArea(null);
      onChanged?.();
    } catch (error) {
      Alert.alert(
        '구역 일괄 배정 실패',
        error.message
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * 방문지 담당자 해제
   */
  const unassign = async (task) => {
    try {
      await groupApi(
        `/api/groups/${group.groupId}/assignments/${task.id}?leaderUserId=${user.userId}`,
        {
          method: 'DELETE',
        }
      );

      setAssignments((prev) =>
        prev.filter(
          (item) =>
            Number(item.taskId) !==
            Number(task.id)
        )
      );

      onChanged?.();
    } catch (error) {
      Alert.alert(
        '배정 해제 실패',
        error.message
      );
    }
  };

  const closeMemberModal = () => {
    setSelectedTask(null);
    setSelectedArea(null);
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <BackButton onPress={onBack} />

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            담당 관리
          </Text>

          <Text style={styles.title}>
            방문지 담당자 지정
          </Text>
        </View>
      </View>

      {/* 구역별 / 방문지별 */}
      <View style={styles.modeTabs}>
        <TouchableOpacity
          style={[
            styles.modeTab,
            assignmentMode === 'area' &&
              styles.modeTabActive,
          ]}
          onPress={() => {
            setAssignmentMode('area');
            closeMemberModal();
          }}
        >
          <Text
            style={[
              styles.modeTabText,
              assignmentMode === 'area' &&
                styles.modeTabTextActive,
            ]}
          >
            구역별 배정
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeTab,
            assignmentMode === 'location' &&
              styles.modeTabActive,
          ]}
          onPress={() => {
            setAssignmentMode(
              'location'
            );
            closeMemberModal();
          }}
        >
          <Text
            style={[
              styles.modeTabText,
              assignmentMode === 'location' &&
                styles.modeTabTextActive,
            ]}
          >
            방문지별 배정
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator
            color="#0B6B4F"
          />

          <Text style={styles.loadingText}>
            방문지 행정동 확인 중...
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            styles.body
          }
        >
          {locations.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons
                name="location-outline"
                size={34}
                color="#8B9891"
              />

              <Text
                style={styles.emptyTitle}
              >
                등록된 방문지가 없습니다
              </Text>
            </View>
          ) : assignmentMode === 'area' ? (
            /*
             * ===========================
             * 구역별 배정
             * ===========================
             */
            areaGroups.map((area) => {
              const areaAssignments =
                area.locations
                  .map((loc) =>
                    assignmentMap.get(
                      Number(loc.id)
                    )
                  )
                  .filter(Boolean);

              const assigneeNames = [
                ...new Set(
                  areaAssignments.map(
                    (item) =>
                      item.assigneeName ||
                      item.assigneeLoginId
                  )
                ),
              ];

              let assignmentText =
                '담당자 미지정';

              /*
               * 해당 행정동의 모든 방문지가
               * 같은 담당자
               */
              if (
                areaAssignments.length ===
                  area.locations.length &&
                assigneeNames.length === 1
              ) {
                assignmentText =
                  `전체 담당자: ${assigneeNames[0]}`;
              }
              /*
               * 한 명 이상 배정되어 있지만
               * 담당자가 서로 다름
               */
              else if (
                areaAssignments.length > 0
              ) {
                assignmentText =
                  '방문지별 담당자가 다름';
              }

              return (
                <View
                  key={area.key}
                  style={styles.areaCard}
                >
                  {/* 행정동 헤더 */}
                  <View
                    style={
                      styles.areaHeader
                    }
                  >
                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.areaDong
                        }
                      >
                        {area.adminDong}
                      </Text>

                      {area.adminDong !==
                        '행정동 미확인' && (
                        <Text
                          style={
                            styles.areaRegion
                          }
                        >
                          {area.sido}{' '}
                          {area.sigungu}
                        </Text>
                      )}

                      <Text
                        style={
                          styles.areaCount
                        }
                      >
                        방문지{' '}
                        {
                          area.locations
                            .length
                        }
                        곳
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={
                        styles.assignButton
                      }
                      onPress={() => {
                        setSelectedTask(
                          null
                        );

                        setSelectedArea(
                          area
                        );
                      }}
                    >
                      <Text
                        style={
                          styles.assignButtonText
                        }
                      >
                        {areaAssignments.length ===
                        0
                          ? '지정'
                          : '변경'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/*
                   * ===========================
                   * 행정동 안의 각 방문지
                   * + 현재 최종 담당자 표시
                   * ===========================
                   */}
                  <View
                    style={
                      styles.areaLocationList
                    }
                  >
                    {area.locations.map(
                      (loc, index) => {
                        const visitAssignment =
                          assignmentMap.get(
                            Number(loc.id)
                          );

                        const assigneeName =
                          visitAssignment?.assigneeName ||
                          visitAssignment?.assigneeLoginId;

                        return (
                          <View
                            key={
                              loc.id ??
                              index
                            }
                            style={
                              styles.areaLocationRow
                            }
                          >
                            <View
                              style={
                                styles.areaNumberBox
                              }
                            >
                              <Text
                                style={
                                  styles.areaNumberText
                                }
                              >
                                {index + 1}
                              </Text>
                            </View>

                            <Ionicons
                              name="location-outline"
                              size={14}
                              color="#637269"
                            />

                            <View
                              style={{
                                flex: 1,
                              }}
                            >
                              <Text
                                style={
                                  styles.areaPlaceName
                                }
                                numberOfLines={
                                  1
                                }
                              >
                                {loc.detailAddress ||
                                  loc.detail_address ||
                                  loc.name ||
                                  '이름 없음'}
                              </Text>

                              <Text
                                style={
                                  styles.areaAddress
                                }
                                numberOfLines={
                                  1
                                }
                              >
                                {loc.roadAddress ||
                                  loc.road_address ||
                                  loc.address ||
                                  ''}
                              </Text>
                            </View>

                            {/* 현재 방문지 최종 담당자 */}
                            <View
                              style={
                                styles.areaVisitAssignee
                              }
                            >
                              <Text
                                style={[
                                  styles.areaVisitAssigneeText,
                                  !visitAssignment &&
                                    styles.unassigned,
                                ]}
                                numberOfLines={
                                  1
                                }
                              >
                                {visitAssignment
                                  ? `담당자: ${assigneeName}`
                                  : '미지정'}
                              </Text>
                            </View>
                          </View>
                        );
                      }
                    )}
                  </View>

                  {/* 행정동 전체 배정 상태 */}
                  <View
                    style={
                      styles.areaAssignmentRow
                    }
                  >
                    <Ionicons
                      name="people-outline"
                      size={14}
                      color="#0B6B4F"
                    />

                    <Text
                      style={[
                        styles.areaAssignmentText,
                        areaAssignments.length ===
                          0 &&
                          styles.unassigned,
                      ]}
                    >
                      {assignmentText}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            /*
             * ===========================
             * 방문지별 배정
             * ===========================
             */
            locations.map(
              (loc, index) => {
                const id = Number(
                  loc.id ??
                  loc.taskId ??
                  loc.task_id
                );

                const normalized = {
                  ...loc,
                  id,
                };

                const assignment =
                  assignmentMap.get(id);

                return (
                  <View
                    key={
                      id || index
                    }
                    style={
                      styles.card
                    }
                  >
                    <View
                      style={
                        styles.numberBox
                      }
                    >
                      <Text
                        style={
                          styles.numberText
                        }
                      >
                        {index + 1}
                      </Text>
                    </View>

                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.placeName
                        }
                        numberOfLines={1}
                      >
                        {loc.detailAddress ||
                          loc.detail_address ||
                          loc.name ||
                          '이름 없음'}
                      </Text>

                      <Text
                        style={
                          styles.address
                        }
                        numberOfLines={1}
                      >
                        {loc.roadAddress ||
                          loc.road_address ||
                          loc.address ||
                          '주소 없음'}
                      </Text>

                      <View
                        style={
                          styles.assigneeRow
                        }
                      >
                        <Ionicons
                          name="person-outline"
                          size={13}
                          color="#0B6B4F"
                        />

                        <Text
                          style={[
                            styles.assignee,
                            !assignment &&
                              styles.unassigned,
                          ]}
                        >
                          {assignment
                            ? `담당자: ${
                                assignment.assigneeName ||
                                assignment.assigneeLoginId
                              }`
                            : '담당자 미지정'}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.actionColumn
                      }
                    >
                      <TouchableOpacity
                        style={
                          styles.assignButton
                        }
                        onPress={() => {
                          setSelectedArea(
                            null
                          );

                          setSelectedTask(
                            normalized
                          );
                        }}
                      >
                        <Text
                          style={
                            styles.assignButtonText
                          }
                        >
                          {assignment
                            ? '변경'
                            : '지정'}
                        </Text>
                      </TouchableOpacity>

                      {assignment && (
                        <TouchableOpacity
                          style={
                            styles.clearButton
                          }
                          onPress={() =>
                            unassign(
                              normalized
                            )
                          }
                        >
                          <Text
                            style={
                              styles.clearText
                            }
                          >
                            해제
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              }
            )
          )}
        </ScrollView>
      )}

      {/* 담당자 선택 모달 */}
      <Modal
        visible={
          !!selectedTask ||
          !!selectedArea
        }
        transparent
        animationType="slide"
        onRequestClose={
          closeMemberModal
        }
      >
        <TouchableOpacity
          style={styles.modalBg}
          activeOpacity={1}
          onPress={
            closeMemberModal
          }
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.sheet}
          >
            <View
              style={styles.handle}
            />

            <Text
              style={
                styles.sheetTitle
              }
            >
              담당자 선택
            </Text>

            <Text
              style={
                styles.sheetPlace
              }
              numberOfLines={2}
            >
              {selectedArea
                ? `${selectedArea.adminDong} · 방문지 ${selectedArea.locations.length}곳`
                : selectedTask?.detailAddress ||
                  selectedTask?.name ||
                  selectedTask?.roadAddress}
            </Text>

            {selectedArea && (
              <Text
                style={
                  styles.sheetHint
                }
              >
                선택한 담당자에게 이 구역의 방문지 전체를 배정합니다.
              </Text>
            )}

            <ScrollView>
              {members.map(
                (member) => (
                  <TouchableOpacity
                    key={
                      member.userId
                    }
                    style={
                      styles.memberChoice
                    }
                    onPress={() => {
                      if (
                        selectedArea
                      ) {
                        assignArea(
                          member
                        );
                      } else {
                        assign(
                          member
                        );
                      }
                    }}
                    disabled={saving}
                  >
                    <View
                      style={
                        styles.choiceAvatar
                      }
                    >
                      <Text
                        style={
                          styles.choiceAvatarText
                        }
                      >
                        {(
                          member.name ||
                          member.loginId ||
                          '?'
                        ).slice(0, 1)}
                      </Text>
                    </View>

                    <View
                      style={{
                        flex: 1,
                      }}
                    >
                      <Text
                        style={
                          styles.choiceName
                        }
                      >
                        {member.name ||
                          member.loginId}
                      </Text>

                      <Text
                        style={
                          styles.choiceLogin
                        }
                      >
                        @{member.loginId}
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.choiceRole
                      }
                    >
                      {member.role ===
                      'LEADER'
                        ? '팀장'
                        : '팀원'}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </ScrollView>

            {saving && (
              <View
                style={
                  styles.savingBox
                }
              >
                <ActivityIndicator
                  size="small"
                  color="#0B6B4F"
                />

                <Text
                  style={
                    styles.savingText
                  }
                >
                  배정 중...
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F5',
  },

  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14, paddingTop: 30, paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DCE5E0',
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#637269',
    letterSpacing: 1.6,
  },

  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#15231D',
  },

  desc: {
    fontSize: 10,
    color: '#637269',
    marginTop: 2,
  },

  modeTabs: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#E8EEF4',
  },

  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },

  modeTabActive: {
    backgroundColor: '#0B6B4F',
  },

  modeTabText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#637269',
  },

  modeTabTextActive: {
    color: '#FFFFFF',
  },

  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 10,
    color: '#637269',
  },

  body: {
    padding: 16,
    gap: 10,
    paddingBottom: 30,
  },

  emptyBox: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE5E0',
  },

  emptyTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '900',
    color: '#15231D',
  },

  /*
   * 방문지별 카드
   */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: '#DCE5E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  numberBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0B6B4F',
    alignItems: 'center',
    justifyContent: 'center',
  },

  numberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  placeName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#15231D',
  },

  address: {
    fontSize: 9,
    color: '#637269',
    marginTop: 3,
  },

  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
  },

  assignee: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B6B4F',
  },

  unassigned: {
    color: '#E67E22',
  },

  actionColumn: {
    gap: 5,
  },

  assignButton: {
    backgroundColor: '#0B6B4F',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },

  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },

  clearButton: {
    backgroundColor: '#EEF3F0',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
  },

  clearText: {
    color: '#637269',
    fontSize: 9,
    fontWeight: '900',
  },

  /*
   * 구역별 카드
   */
  areaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DCE5E0',
  },

  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  areaDong: {
    fontSize: 16,
    fontWeight: '900',
    color: '#15231D',
  },

  areaRegion: {
    marginTop: 2,
    fontSize: 9,
    color: '#637269',
  },

  areaCount: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    color: '#637269',
  },

  areaLocationList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F0',
  },

  areaLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
  },

  areaNumberBox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0F1EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  areaNumberText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#0B6B4F',
  },

  areaPlaceName: {
    fontSize: 11,
    fontWeight: '900',
    color: '#15231D',
  },

  areaAddress: {
    marginTop: 2,
    fontSize: 8,
    color: '#8B9891',
  },

  /*
   * 구역별 화면에서
   * 방문지마다 현재 최종 담당자 표시
   */
  areaVisitAssignee: {
    marginLeft: 8,
    maxWidth: 115,
    alignItems: 'flex-end',
  },

  areaVisitAssigneeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0B6B4F',
  },

  areaAssignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 10,
    marginTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F0',
  },

  areaAssignmentText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    color: '#0B6B4F',
  },

  /*
   * 담당자 선택 모달
   */
  modalBg: {
    flex: 1,
    backgroundColor:
      'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },

  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: 30,
    maxHeight: '72%',
  },

  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },

  sheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#15231D',
  },

  sheetPlace: {
    fontSize: 11,
    color: '#637269',
    marginTop: 4,
    marginBottom: 6,
  },

  sheetHint: {
    fontSize: 9,
    color: '#637269',
    marginBottom: 10,
  },

  memberChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F0',
  },

  choiceAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E0F1EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  choiceAvatarText: {
    color: '#0B6B4F',
    fontWeight: '900',
  },

  choiceName: {
    fontSize: 12,
    fontWeight: '900',
    color: '#15231D',
  },

  choiceLogin: {
    fontSize: 9,
    color: '#637269',
    marginTop: 2,
  },

  choiceRole: {
    fontSize: 9,
    fontWeight: '900',
    color: '#637269',
  },

  savingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingTop: 12,
  },

  savingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#637269',
  },
});
