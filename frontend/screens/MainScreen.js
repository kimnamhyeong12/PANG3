import { showAlert } from '../components/CustomAlert';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  BackHandler,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const isPersonalGroup = (group) =>
  Boolean(
    group?.personalWorkspace ||
    group?.personal ||
    group?.workspaceType === 'PERSONAL'
  );

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

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWorkDateKey = (item) => {
  const value = item?.workDate ?? item?.work_date;
  return value ? String(value).slice(0, 10) : '';
};

const formatShortDate = (value) => {
  const key = value ? String(value).slice(0, 10) : '';
  const parts = key.split('-');
  if (parts.length !== 3) return '';
  return `${parts[1]}.${parts[2]}`;
};

const getScheduledDateKey = (item) => {
  const value =
    item?.scheduledDate ??
    item?.scheduled_date ??
    item?.workDate ??
    item?.work_date;
  return value ? String(value).slice(0, 10) : '';
};

const isTodayWork = (item) => {
  const scheduledDate = getScheduledDateKey(item);
  return !scheduledDate || scheduledDate === getLocalDateKey();
};

export default function MainScreen({
  user,
  activeGroup,
  availableGroups = [],
  groupAssignments = [],
  onRoute,
  onReport,
  onGroup,
  onSelectWorkspace,
  onRefreshWorkspaces,
  onWorkStatus,
  onDashboard,
  locations = [],
  setLocations,
  onRefreshAssignments,
}) {
  const [calendarDayKey, setCalendarDayKey] =
    React.useState(getLocalDateKey());

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

  const [movingToToday, setMovingToToday] =
    React.useState(false);

  const [workspacePickerOpen, setWorkspacePickerOpen] =
    React.useState(false);

  const backPressedOnce = React.useRef(false);
  const backPressTimer = React.useRef(null);

  React.useEffect(() => {
    const timer = setInterval(() => {
      const nextDayKey = getLocalDateKey();
      setCalendarDayKey((prev) => (prev === nextDayKey ? prev : nextDayKey));
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const handleBackPress = () => {
      if (backPressedOnce.current) {
        BackHandler.exitApp();
        return true;
      }

      backPressedOnce.current = true;
      ToastAndroid.show(
        '뒤로가기 버튼을 한 번 더 누르면 종료됩니다.',
        ToastAndroid.SHORT
      );

      backPressTimer.current = setTimeout(() => {
        backPressedOnce.current = false;
      }, 2000);

      return true;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );

    return () => {
      subscription.remove();

      if (backPressTimer.current) {
        clearTimeout(backPressTimer.current);
        backPressTimer.current = null;
      }

      backPressedOnce.current = false;
    };
  }, []);

  const myAssignments = activeGroup
    ? groupAssignments.filter(
        (item) =>
          Number(item.assigneeUserId) ===
          Number(user?.userId)
      )
    : [];

  // App.js에서 오늘 업무만 locations로 전달한다.
  // 한 번 더 날짜를 확인해 날짜가 바뀐 직후에도 과거 업무가 섞이지 않게 한다.
  const displayLocations = (locations || []).filter(isTodayWork);

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
  }, [locations, user?.userId, activeGroup?.groupId, calendarDayKey]);

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

            // 카테고리는 선택하지 않았으면 빈칸을 유지한다.
            task:
              loc.task ||
              loc.taskCategory ||
              loc.task_category ||
              '',

            createdAt:
              loc.createdAt ||
              loc.created_at ||
              null,

            workDate:
              loc.workDate ||
              loc.work_date ||
              null,

            scheduledDate:
              loc.scheduledDate ||
              loc.scheduled_date ||
              loc.workDate ||
              loc.work_date ||
              null,
          };
        })
        .filter((loc) => {
          const status = String(
            loc.status || ''
          ).toLowerCase();
          const workDate = getWorkDateKey(loc);
          const scheduledDate = getScheduledDateKey(loc);
          const todayKey = getLocalDateKey();

          // 최초 업무일은 그대로 둔다.
          // 과거에 등록한 작업이 오늘 업무로 재배치되지 않았고,
          // 상태가 작업 전/작업 중이면 미처리 업무로 표시한다.
          return (
            Boolean(workDate) &&
            workDate < todayKey &&
            Boolean(scheduledDate) &&
            scheduledDate < todayKey &&
            (status === 'pending' || status === 'working')
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

  const addSelectedToToday = async () => {
    const selectedItems =
      visibleIncompleteLocations.filter(
        (loc) => selectedIds.includes(loc.id)
      );

    if (selectedItems.length === 0) {
      showAlert(
        '선택 필요',
        '오늘 외근에 추가할 작업을 선택하세요.'
      );
      return;
    }

    if (!API_BASE_URL) {
      showAlert('오류', 'API_BASE_URL이 설정되지 않았습니다.');
      return;
    }

    const todayKey = getLocalDateKey();

    try {
      setMovingToToday(true);

      const movedItems = await Promise.all(
        selectedItems.map(async (item) => {
          const taskId = item.id ?? item.taskId ?? item.task_id;
          const response = await fetch(
            `${API_BASE_URL}/api/locations/${taskId}/scheduled-date`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scheduledDate: todayKey }),
            }
          );

          const text = await response.text();
          if (!response.ok) {
            throw new Error(text || `오늘 업무 배치 실패: ${response.status}`);
          }

          const saved = text ? JSON.parse(text) : {};
          return {
            ...item,
            ...saved,
            id: saved.id ?? saved.taskId ?? saved.task_id ?? taskId,
            task: saved.task ?? saved.taskCategory ?? saved.task_category ?? item.task ?? '',
            status: saved.status ?? saved.taskStatus ?? saved.task_status ?? item.status,
            // workDate는 최초 등록일이므로 절대 오늘 날짜로 덮어쓰지 않는다.
            workDate: saved.workDate ?? saved.work_date ?? item.workDate ?? item.work_date ?? null,
            scheduledDate: saved.scheduledDate ?? saved.scheduled_date ?? todayKey,
            createdAt: saved.createdAt ?? saved.created_at ?? item.createdAt ?? item.created_at ?? null,
          };
        })
      );

      setLocations?.((prev) => {
        const current = prev || [];
        const movedIds = new Set(
          movedItems.map((item) => Number(item.id ?? item.taskId ?? item.task_id))
        );
        return [
          ...current.filter(
            (item) => !movedIds.has(Number(item.id ?? item.taskId ?? item.task_id))
          ),
          ...movedItems,
        ];
      });

      const movedIds = new Set(
        movedItems.map((item) => Number(item.id ?? item.taskId ?? item.task_id))
      );
      setIncompleteLocations((prev) =>
        prev.filter(
          (item) => !movedIds.has(Number(item.id ?? item.taskId ?? item.task_id))
        )
      );
      setSelectedIds([]);
      onRefreshAssignments?.();

      showAlert(
        '추가 완료',
        `${movedItems.length}개의 미처리 작업을 오늘 업무로 가져왔습니다.`
      );
    } catch (error) {
      console.log('미처리 작업 오늘 업무 이동 실패:', error);
      showAlert(
        '추가 실패',
        error.message || '미처리 작업을 오늘 업무로 가져오지 못했습니다.'
      );
    } finally {
      setMovingToToday(false);
    }
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


  const displayName =
    user?.name ||
    user?.loginId ||
    '사용자';

  const roleLabel = !activeGroup || isPersonalGroup(activeGroup)
    ? '1인'
    : activeGroup?.role === 'LEADER'
    ? '팀장'
    : '팀원';

  const workspaceName =
    activeGroup?.groupName || displayName;

  const openWorkspacePicker = () => {
    setWorkspacePickerOpen(true);
    onRefreshWorkspaces?.();
  };

  const chooseWorkspace = (group) => {
    onSelectWorkspace?.(group);
    setWorkspacePickerOpen(false);
  };

  // 오늘의 업무 집계와 같은 목록을 사용해야 숫자와 카드가 어긋나지 않는다.
  // 작업 중 업무를 우선 표시하고, 없으면 완료되지 않은 첫 업무를 표시한다.
  const currentTask =
    displayLocations.find((item) => {
      const status = String(item.status || item.taskStatus || '').toLowerCase();
      return status === 'working';
    }) ||
    displayLocations.find((item) => {
      const status = String(item.status || item.taskStatus || '').toLowerCase();
      return status !== 'complete' && status !== 'done';
    }) ||
    null;

  const recentCompletedSource =
    activeGroup && myAssignments.length > 0
      ? myAssignments
      : displayLocations;

  const recentCompleted = recentCompletedSource
    .filter((item) => {
      const status = String(
        item.status ||
          item.taskStatus ||
          ''
      ).toLowerCase();

      return (
        status === 'complete' ||
        status === 'done'
      );
    })
    .slice(0, 3);

  return (
    <>
    <ScrollView
      style={styles.homeContainer}
      contentContainerStyle={styles.homeContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeHeader}>
        <View style={styles.homeTopBar}>
          <Text style={styles.homeAppName}>
            외근도우미
          </Text>

          <TouchableOpacity
            style={styles.homeSettingsButton}
            onPress={onDashboard}
            activeOpacity={0.75}
          >
            <Ionicons
              name="settings-outline"
              size={24}
              color="#173A5E"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.homeGreetingRow}>
          <View style={styles.homeGreetingTextBox}>
            <Text style={styles.homeTodayText}>
              {today}
            </Text>

            <Text
              style={styles.homeGreetingTitle}
              numberOfLines={1}
            >
              {displayName}님, 안녕하세요
            </Text>

            <Text style={styles.homeDepartmentText}>
              도시안전과
            </Text>
          </View>

          <TouchableOpacity
            style={styles.homeAvatar}
            onPress={onDashboard}
            activeOpacity={0.75}
          >
            <Ionicons
              name="person"
              size={29}
              color="#315E87"
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.homeGroupShortcut}
          onPress={openWorkspacePicker}
          activeOpacity={0.75}
        >
          <View style={styles.homeGroupLeft}>
            <Ionicons
              name={isPersonalGroup(activeGroup) ? 'person-outline' : 'people-outline'}
              size={22}
              color="#172538"
            />

            <Text
              style={styles.homeGroupName}
              numberOfLines={1}
            >
              {workspaceName}
            </Text>

            <View style={styles.homeRoleBadge}>
              <Text style={styles.homeRoleText}>
                {roleLabel}
              </Text>
            </View>
          </View>

          <Ionicons
            name="chevron-forward"
            size={21}
            color="#173A5E"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.homeProgressCard}>
        <View style={styles.homeProgressHeader}>
          <View>
            <Text style={styles.homeProgressTitle}>
              오늘의 업무
            </Text>
            <Text style={styles.homeProgressDesc}>
              {displayTotal}건 중 {displayComplete}건 완료
            </Text>
          </View>

          <Text style={styles.homeProgressPercent}>
            {displayProgress}%
          </Text>
        </View>

        <View style={styles.homeProgressTrack}>
          <View
            style={[
              styles.homeProgressFill,
              {
                width: `${displayProgress}%`,
              },
            ]}
          />
        </View>

        <View style={styles.homeMetricRow}>
          <HomeMetric
            label="담당"
            value={displayTotal}
          />
          <View style={styles.homeMetricDivider} />
          <HomeMetric
            label="완료"
            value={displayComplete}
          />
          <View style={styles.homeMetricDivider} />
          <HomeMetric
            label="미완료"
            value={displayPending}
          />
        </View>
      </View>

      <View style={styles.homeSectionHeader}>
        <Text style={styles.homeSectionTitle}>
          내 담당 업무
        </Text>

        <TouchableOpacity
          style={styles.homeSectionLinkButton}
          onPress={
            activeGroup
              ? onWorkStatus
              : onRoute
          }
          activeOpacity={0.7}
        >
          <Text style={styles.homeSectionLink}>
            전체 보기
          </Text>
          <Ionicons
            name="chevron-forward"
            size={15}
            color="#173A5E"
          />
        </TouchableOpacity>
      </View>

      {currentTask ? (
        <View style={styles.homeTaskCard}>
          <View
            style={[
              styles.homeStatusBadge,
              String(
                currentTask.status || ''
              ).toLowerCase() ===
                'working' &&
                styles.homeStatusBadgeWorking,
            ]}
          >
            <Text
              style={[
                styles.homeStatusText,
                String(
                  currentTask.status || ''
                ).toLowerCase() ===
                  'working' &&
                  styles.homeStatusTextWorking,
              ]}
            >
              {String(
                currentTask.status || ''
              ).toLowerCase() ===
              'working'
                ? '진행 중'
                : '진행 전'}
            </Text>
          </View>

          <Text
            style={styles.homeTaskTitle}
            numberOfLines={1}
          >
            {currentTask.detailAddress ||
              currentTask.task ||
              '현장 업무'}
          </Text>

          <Text
            style={styles.homeTaskSubText}
            numberOfLines={1}
          >
            {[
              currentTask.task,
              currentTask.roadAddress || '주소 정보 없음',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>

          <View style={styles.homeTaskDivider} />

          <View style={styles.homeRemainingRow}>
            <Ionicons
              name="location-outline"
              size={20}
              color="#173A5E"
            />
            <Text style={styles.homeRemainingText}>
              오늘 남은 방문지{' '}
              {displayPending}곳
            </Text>
          </View>

          <TouchableOpacity
            style={styles.homeRouteButton}
            onPress={onRoute}
            activeOpacity={0.85}
          >
            <Ionicons
              name="git-branch-outline"
              size={19}
              color="#FFFFFF"
            />
            <Text style={styles.homeRouteButtonText}>
              남은 업무 경로 확인
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.homeEmptyWorkCard}>
          <View style={styles.homeCompleteIcon}>
            <Ionicons
              name="checkmark"
              size={22}
              color="#FFFFFF"
            />
          </View>

          <View style={styles.homeEmptyWorkTextBox}>
            <Text style={styles.homeEmptyWorkTitle}>
              오늘 담당 업무를 모두 완료했어요
            </Text>
            <Text
              style={
                styles.homeEmptyWorkDescription
              }
            >
              새 업무가 배정되면 이곳에 표시됩니다.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.homeSectionHeader}>
        <View style={styles.homeSectionTitleRow}>
          <Text style={styles.homeSectionTitle}>
            미처리 업무
          </Text>
          <View style={styles.overdueCountBadge}>
            <Text style={styles.overdueCountText}>
              {visibleIncompleteLocations.length}
            </Text>
          </View>
        </View>

        {visibleIncompleteLocations.length > 0 && (
          <TouchableOpacity
            style={styles.overdueSelectAllButton}
            onPress={toggleSelectAll}
            activeOpacity={0.75}
          >
            <Text style={styles.overdueSelectAllText}>
              {selectedIds.length === visibleIncompleteLocations.length
                ? '선택 해제'
                : '전체 선택'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {visibleIncompleteLocations.length === 0 ? (
        <View style={styles.overdueEmptyCard}>
          <View style={styles.overdueEmptyIcon}>
            <Ionicons
              name="checkmark-done-outline"
              size={21}
              color="#3A8A62"
            />
          </View>
          <View style={styles.overdueEmptyTextBox}>
            <Text style={styles.overdueEmptyTitle}>
              미처리 업무가 없습니다
            </Text>
            <Text style={styles.overdueEmptyDescription}>
              날짜가 지난 작업 전·작업 중 업무가 여기에 표시됩니다.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.overdueListCard}>
          {visibleIncompleteLocations.map((item, index) => {
            const itemId = item.id ?? item.taskId ?? item.task_id;
            const selected = selectedIds.includes(itemId);
            const statusInfo = getStatusInfo(item.status);
            const workDate = getWorkDateKey(item);
            const category = String(item.task || '').trim();

            return (
              <View
                key={`overdue-${itemId ?? index}`}
                style={[
                  styles.overdueItem,
                  index > 0 && styles.overdueItemBorder,
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.overdueCheckbox,
                    selected && styles.overdueCheckboxSelected,
                  ]}
                  onPress={() => toggleSelect(itemId)}
                  activeOpacity={0.75}
                >
                  {selected && (
                    <Ionicons
                      name="checkmark"
                      size={15}
                      color="#FFFFFF"
                    />
                  )}
                </TouchableOpacity>

                <View style={styles.overdueContent}>
                  <View style={styles.overdueMetaRow}>
                    <View style={styles.overdueDateBadge}>
                      <Ionicons
                        name="calendar-outline"
                        size={12}
                        color="#173A5E"
                      />
                      <Text style={styles.overdueDateText}>
                        업무일 {formatShortDate(workDate)}
                      </Text>
                    </View>

                    {category ? (
                      <View style={styles.overdueCategoryBadge}>
                        <Text style={styles.overdueCategoryText}>
                          {category}
                        </Text>
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.overdueStatusBadge,
                        statusInfo.styleName === 'progressStatus'
                          ? styles.overdueWorkingBadge
                          : styles.overduePendingBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.overdueStatusText,
                          statusInfo.styleName === 'progressStatus'
                            ? styles.overdueWorkingText
                            : styles.overduePendingText,
                        ]}
                      >
                        {statusInfo.label}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={styles.overdueTitle}
                    numberOfLines={1}
                  >
                    {item.detailAddress || item.roadAddress || '방문지'}
                  </Text>

                  <Text
                    style={styles.overdueAddress}
                    numberOfLines={1}
                  >
                    {item.roadAddress || '주소 정보 없음'}
                  </Text>

                </View>

                <TouchableOpacity
                  style={[
                    styles.overdueDeleteButton,
                    String(item.status || '').toLowerCase() !== 'pending' &&
                      styles.overdueDeleteButtonDisabled,
                  ]}
                  disabled={
                    String(item.status || '').toLowerCase() !== 'pending' ||
                    deletingId !== null
                  }
                  onPress={() => deleteIncompleteLocation(item)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={
                      String(item.status || '').toLowerCase() === 'pending'
                        ? '#D85A55'
                        : '#A8B1BC'
                    }
                  />
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity
            style={[
              styles.overdueMoveButton,
              (selectedIds.length === 0 || movingToToday) &&
                styles.overdueMoveButtonDisabled,
            ]}
            onPress={addSelectedToToday}
            disabled={selectedIds.length === 0 || movingToToday}
            activeOpacity={0.85}
          >
            <Ionicons
              name="arrow-redo-outline"
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.overdueMoveButtonText}>
              {movingToToday
                ? '오늘 업무로 가져오는 중...'
                : selectedIds.length > 0
                ? `선택한 ${selectedIds.length}건 오늘 업무로 가져오기`
                : '오늘 업무로 가져오기'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.homeSectionHeader}>
        <Text style={styles.homeSectionTitle}>
          최근 방문 기록
        </Text>
      </View>

      <View style={styles.homeHistoryCard}>
        {recentCompleted.length > 0 ? (
          recentCompleted.map(
            (item, index) => (
              <View
                key={`recent-${
                  item.id ??
                  item.taskId ??
                  index
                }`}
                style={[
                  styles.homeHistoryItem,
                  index > 0 &&
                    styles.homeHistoryItemBorder,
                ]}
              >
                <View
                  style={
                    styles.homeHistoryCheck
                  }
                >
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color="#FFFFFF"
                  />
                </View>

                <View
                  style={
                    styles.homeHistoryTextBox
                  }
                >
                  <Text
                    style={
                      styles.homeHistoryTitle
                    }
                    numberOfLines={1}
                  >
                    {item.detailAddress ||
                      item.task ||
                      '현장 업무'}
                  </Text>
                  <Text
                    style={
                      styles.homeHistoryDescription
                    }
                    numberOfLines={1}
                  >
                    {item.roadAddress ||
                      '업무 완료'}
                  </Text>
                </View>
              </View>
            )
          )
        ) : (
          <View style={styles.homeEmptyHistory}>
            <Ionicons
              name="time-outline"
              size={21}
              color="#8A97A6"
            />
            <Text
              style={
                styles.homeEmptyHistoryText
              }
            >
              최근 방문 기록이 없습니다.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
    <WorkspacePickerModal
      visible={workspacePickerOpen}
      user={user}
      activeGroup={activeGroup}
      groups={availableGroups}
      onSelect={chooseWorkspace}
      onManage={() => {
        setWorkspacePickerOpen(false);
        onGroup?.();
      }}
      onClose={() => setWorkspacePickerOpen(false)}
    />
    </>
  );
}

function WorkspacePickerModal({
  visible,
  user,
  activeGroup,
  groups,
  onSelect,
  onManage,
  onClose,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.workspaceModalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.workspaceModalCard}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.workspaceModalHeader}>
            <View>
              <Text style={styles.workspaceModalEyebrow}>WORKSPACE</Text>
              <Text style={styles.workspaceModalTitle}>업무공간 선택</Text>
            </View>
            <TouchableOpacity style={styles.workspaceCloseButton} onPress={onClose}>
              <Ionicons name="close" size={22} color="#526174" />
            </TouchableOpacity>
          </View>

          {groups.map((group) => {
            const selected = Number(activeGroup?.groupId) === Number(group.groupId);
            const personal = isPersonalGroup(group);
            return (
              <TouchableOpacity
                key={group.groupId}
                style={[
                  styles.workspaceOption,
                  selected && styles.workspaceOptionActive,
                ]}
                activeOpacity={0.82}
                onPress={() => onSelect?.(group)}
              >
                <View
                  style={[
                    styles.workspaceIcon,
                    personal && styles.personalWorkspaceIcon,
                  ]}
                >
                  <Ionicons
                    name={personal ? 'person' : 'people'}
                    size={20}
                    color="#FFFFFF"
                  />
                </View>
                <View style={styles.workspaceOptionText}>
                  <Text style={styles.workspaceOptionName}>
                    {personal ? `나 · ${group.groupName}` : group.groupName}
                  </Text>
                  <Text style={styles.workspaceOptionMeta}>
                    {personal
                      ? `1인 그룹 · ${user?.name || user?.loginId || '본인'}`
                      : `${group.memberCount || 1}명 · ${group.role === 'LEADER' ? '팀장' : '팀원'}`}
                  </Text>
                </View>
                {selected && (
                  <Ionicons name="checkmark-circle" size={23} color="#2563EB" />
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity style={styles.workspaceManageButton} onPress={onManage}>
            <Ionicons name="settings-outline" size={17} color="#173A5E" />
            <Text style={styles.workspaceManageText}>그룹 만들기·초대 관리</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function HomeMetric({
  label,
  value,
}) {
  return (
    <View style={styles.homeMetric}>
      <Text style={styles.homeMetricLabel}>
        {label}
      </Text>
      <Text style={styles.homeMetricValue}>
        {value}
      </Text>
    </View>
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

  homeContainer: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  homeContent: {
    paddingBottom: 28,
  },

  homeHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 16,
  },

  homeTopBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  homeAppName: {
    color: '#173A5E',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.8,
  },

  homeSettingsButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },

  homeGreetingRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  homeGreetingTextBox: {
    flex: 1,
    paddingRight: 12,
  },

  homeTodayText: {
    color: '#728096',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },

  homeGreetingTitle: {
    color: '#152438',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.9,
  },

  homeDepartmentText: {
    color: '#66758A',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },

  homeAvatar: {
    width: 55,
    height: 55,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7EEF6',
  },

  homeGroupShortcut: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#DCE3EA',
    backgroundColor: '#FBFCFD',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  homeGroupLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  homeGroupName: {
    maxWidth: '58%',
    color: '#19283A',
    fontSize: 16,
    fontWeight: '800',
  },

  homeRoleBadge: {
    borderRadius: 999,
    backgroundColor: '#E8EFF6',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  homeRoleText: {
    color: '#173A5E',
    fontSize: 11,
    fontWeight: '800',
  },

  homeProgressCard: {
    marginHorizontal: 22,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#173A5E',
    paddingHorizontal: 18,
    paddingVertical: 17,
    elevation: 3,
    shadowColor: '#173A5E',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },

  homeProgressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  homeProgressTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },

  homeProgressDesc: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    marginTop: 4,
  },

  homeProgressPercent: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },

  homeProgressTrack: {
    height: 9,
    borderRadius: 999,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },

  homeProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#5FD48A',
  },

  homeMetricRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  homeMetric: {
    flex: 1,
    alignItems: 'center',
  },

  homeMetricLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '600',
  },

  homeMetricValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },

  homeMetricDivider: {
    width: 1,
    height: 39,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },

  homeSectionHeader: {
    marginTop: 22,
    marginBottom: 9,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  homeSectionTitle: {
    color: '#152438',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  homeSectionLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  homeSectionLink: {
    color: '#173A5E',
    fontSize: 13,
    fontWeight: '700',
  },

  homeSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  overdueCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1F7',
  },

  overdueCountText: {
    color: '#173A5E',
    fontSize: 11,
    fontWeight: '900',
  },

  overdueSelectAllButton: {
    minHeight: 32,
    borderRadius: 10,
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF3F8',
  },

  overdueSelectAllText: {
    color: '#173A5E',
    fontSize: 11,
    fontWeight: '800',
  },

  overdueEmptyCard: {
    marginHorizontal: 22,
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE4EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },

  overdueEmptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E7F4EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overdueEmptyTextBox: {
    flex: 1,
    marginLeft: 11,
  },

  overdueEmptyTitle: {
    color: '#24364A',
    fontSize: 14,
    fontWeight: '900',
  },

  overdueEmptyDescription: {
    color: '#7D8998',
    fontSize: 11,
    marginTop: 3,
  },

  overdueListCard: {
    marginHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE4EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  overdueItem: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },

  overdueItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#EDF1F4',
  },

  overdueCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#9EABB9',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  overdueCheckboxSelected: {
    borderColor: '#173A5E',
    backgroundColor: '#173A5E',
  },

  overdueContent: {
    flex: 1,
    minWidth: 0,
  },

  overdueMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  overdueDateBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAF1F7',
  },

  overdueDateText: {
    color: '#173A5E',
    fontSize: 10,
    fontWeight: '900',
  },

  overdueCategoryBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },

  overdueCategoryText: {
    color: '#536477',
    fontSize: 10,
    fontWeight: '800',
  },

  overdueStatusBadge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  overduePendingBadge: {
    backgroundColor: '#FFF0E9',
  },

  overdueWorkingBadge: {
    backgroundColor: '#FFF7D6',
  },

  overdueStatusText: {
    fontSize: 10,
    fontWeight: '900',
  },

  overduePendingText: {
    color: '#C15342',
  },

  overdueWorkingText: {
    color: '#9A7410',
  },

  overdueTitle: {
    color: '#19283A',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8,
  },

  overdueAddress: {
    color: '#7B8796',
    fontSize: 11,
    marginTop: 3,
  },

  overdueCreatedText: {
    color: '#9AA4B1',
    fontSize: 10,
    marginTop: 4,
  },

  overdueDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    backgroundColor: '#FFF3F2',
  },

  overdueDeleteButtonDisabled: {
    backgroundColor: '#F3F5F7',
  },

  overdueMoveButton: {
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: '#173A5E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 6,
  },

  overdueMoveButtonDisabled: {
    backgroundColor: '#AAB5C0',
  },

  overdueMoveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  homeTaskCard: {
    marginHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE4EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    elevation: 1,
    shadowColor: '#1E3550',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  homeStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#FFF0D8',
  },

  homeStatusBadgeWorking: {
    backgroundColor: '#E2F5E9',
  },

  homeStatusText: {
    color: '#AD6800',
    fontSize: 11,
    fontWeight: '800',
  },

  homeStatusTextWorking: {
    color: '#276A48',
  },

  homeTaskTitle: {
    color: '#19283A',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 9,
  },

  homeTaskSubText: {
    color: '#798698',
    fontSize: 13,
    marginTop: 5,
  },

  homeTaskDivider: {
    height: 1,
    backgroundColor: '#EDF1F4',
    marginTop: 13,
    marginBottom: 12,
  },

  homeRemainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  homeRemainingText: {
    color: '#31445B',
    fontSize: 13,
    fontWeight: '700',
  },

  homeRouteButton: {
    minHeight: 47,
    borderRadius: 11,
    backgroundColor: '#173A5E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 13,
  },

  homeRouteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  homeEmptyWorkCard: {
    marginHorizontal: 22,
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE4EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  homeCompleteIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#39A866',
    alignItems: 'center',
    justifyContent: 'center',
  },

  homeEmptyWorkTextBox: {
    flex: 1,
    marginLeft: 12,
  },

  homeEmptyWorkTitle: {
    color: '#19283A',
    fontSize: 15,
    fontWeight: '900',
  },

  homeEmptyWorkDescription: {
    color: '#7D8998',
    fontSize: 12,
    marginTop: 4,
  },

  homeHistoryCard: {
    marginHorizontal: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE4EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
  },

  homeHistoryItem: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },

  homeHistoryItemBorder: {
    borderTopWidth: 1,
    borderTopColor: '#EDF1F4',
  },

  homeHistoryCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#39A866',
    alignItems: 'center',
    justifyContent: 'center',
  },

  homeHistoryTextBox: {
    flex: 1,
    marginLeft: 12,
  },

  homeHistoryTitle: {
    color: '#19283A',
    fontSize: 14,
    fontWeight: '800',
  },

  homeHistoryDescription: {
    color: '#7D8998',
    fontSize: 12,
    marginTop: 3,
  },

  homeEmptyHistory: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  homeEmptyHistoryText: {
    color: '#7D8998',
    fontSize: 13,
  },

  workspaceModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  workspaceModalCard: {
    maxHeight: '72%',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 18,
    elevation: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  workspaceModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  workspaceModalEyebrow: {
    color: '#6B7A8C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  workspaceModalTitle: {
    color: '#172538',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },

  workspaceCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  workspaceOption: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#DEE5ED',
    borderRadius: 16,
    paddingHorizontal: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },

  workspaceOptionActive: {
    borderColor: '#5B8DEF',
    backgroundColor: '#EFF6FF',
  },

  workspaceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#173A5E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  personalWorkspaceIcon: {
    backgroundColor: '#3A9D68',
  },

  workspaceOptionText: {
    flex: 1,
    minWidth: 0,
  },

  workspaceOptionName: {
    color: '#172538',
    fontSize: 15,
    fontWeight: '900',
  },

  workspaceOptionMeta: {
    color: '#7D8998',
    fontSize: 11,
    marginTop: 4,
  },

  workspaceManageButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EAF1F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
  },

  workspaceManageText: {
    color: '#173A5E',
    fontSize: 12,
    fontWeight: '900',
  },

});
