import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { BackButton } from '../components/ui';
import { colors, radius, shadow, spacing } from '../constants/design';
import { API_BASE_URL } from '../utils/api';
import { groupApi } from '../utils/groupApi';

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;

const STATUS_META = {
  pending: { label: '작업 전', color: colors.pending },
  working: { label: '작업 중', color: colors.warning },
  complete: { label: '완료', color: colors.success },
};

// 실제 운영 분류가 확정되면 이 배열만 변경한다.
// 설정 밖의 값도 집계에서 보존된다.
const CATEGORY_CONFIG = [
  { key: '가로수', color: '#2477F3' },
  { key: '맨홀뚜껑', color: '#12A9A5' },
  { key: '버스정류장', color: '#8B5CF6' },
  { key: '현장점검', color: '#F59F00' },
  { key: '기타', color: '#64748B' },
];

const DEFAULT_CATEGORY_COLOR = '#7693B8';
const UNCLASSIFIED = '미분류';

const HEAT_COLORS = [
  colors.surface,
  colors.primarySoft,
  '#C5DDFB',
  '#72A8EF',
  colors.primary,
];

const HOUR_RANGES = [
  { key: 'night', label: '00~05시', from: 0, to: 5 },
  { key: 'morning', label: '06~11시', from: 6, to: 11 },
  { key: 'afternoon', label: '12~17시', from: 12, to: 17 },
  { key: 'evening', label: '18~23시', from: 18, to: 23 },
];

const WEEKDAY_ORDER = [
  { day: 1, label: '월' },
  { day: 2, label: '화' },
  { day: 3, label: '수' },
  { day: 4, label: '목' },
  { day: 5, label: '금' },
  { day: 6, label: '토' },
  { day: 0, label: '일' },
];

const normalizeStatus = (value) => {
  const status = String(value || '').toLowerCase().trim();

  if (['complete', 'completed', 'done'].includes(status)) {
    return 'complete';
  }

  if (status === 'working') {
    return 'working';
  }

  return 'pending';
};

const getTaskId = (item) =>
  item?.id ??
  item?.taskId ??
  item?.task_id;

const comparableTaskId = (item) => {
  const value = getTaskId(item);

  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? String(number)
    : String(value).trim();
};

const getCategory = (item) => {
  const value =
    item?.taskCategory ??
    item?.task_category ??
    item?.task;

  const category =
    value === null || value === undefined
      ? ''
      : String(value).trim();

  return category || UNCLASSIFIED;
};

const getCompletionValue = (item) =>
  item?.completedAt ??
  item?.completed_at;

const getCompletionDateKey = (item) => {
  const candidates = [getCompletionValue(item)];

  for (const value of candidates) {
    const match = String(value || '').match(
      /^(\d{4})-(\d{2})-(\d{2})/
    );

    if (!match) {
      continue;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(
      year,
      month - 1,
      day,
      12
    );

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  return null;
};

const formatMonthKey = (year, zeroBasedMonth) =>
  `${year}-${String(zeroBasedMonth + 1).padStart(2, '0')}`;

const getCurrentMonthKey = () => {
  const today = new Date();

  return formatMonthKey(
    today.getFullYear(),
    today.getMonth()
  );
};

export const shiftMonthKey = (
  monthKey,
  amount
) => {
  const match = String(monthKey || '').match(
    /^(\d{4})-(\d{2})$/
  );

  if (!match) {
    return getCurrentMonthKey();
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1 + amount,
    1,
    12
  );

  return formatMonthKey(
    date.getFullYear(),
    date.getMonth()
  );
};

export const getHeatLevel = (
  count,
  maxCount
) => {
  if (count <= 0 || maxCount <= 0) {
    return 0;
  }

  const ratio = count / maxCount;

  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;

  return 4;
};

// 월~일 7열 캘린더
export const buildCalendarMonth = (
  monthKey,
  dates = []
) => {
  const match = String(monthKey || '').match(
    /^(\d{4})-(\d{2})$/
  );

  const safeMonthKey = match
    ? `${match[1]}-${match[2]}`
    : getCurrentMonthKey();

  const [year, month] =
    safeMonthKey.split('-').map(Number);

  // JavaScript: 일=0 월=1 ... 토=6
  // 화면: 월요일 시작이므로 월=0 ... 일=6 으로 변환
  const leadingBlankCount =
    (
      new Date(
        year,
        month - 1,
        1,
        12
      ).getDay() + 6
    ) % 7;

  const lastDay = new Date(
    year,
    month,
    0,
    12
  ).getDate();

  const counts = new Map(
    dates
      .filter((item) =>
        item.date.startsWith(
          `${safeMonthKey}-`
        )
      )
      .map((item) => [
        item.date,
        item.count,
      ])
  );

  const days = Array.from(
    { length: lastDay },
    (_, index) => {
      const day = index + 1;

      const date =
        `${safeMonthKey}-` +
        String(day).padStart(2, '0');

      return {
        date,
        day,
        count: counts.get(date) || 0,
      };
    }
  );

  const maxCount = Math.max(
    0,
    ...days.map(
      (item) => item.count
    )
  );

  const cells = [
    ...Array(
      leadingBlankCount
    ).fill(null),
    ...days,
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return {
    year,
    month,
    cells,
    maxCount,
    totalCount: days.reduce(
      (sum, item) =>
        sum + item.count,
      0
    ),
  };
};

const getWeekday = (dateKey) => {
  if (!dateKey) {
    return null;
  }

  const [year, month, day] =
    dateKey.split('-').map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12
  ).getDay();
};

const getCompletionHour = (item) => {
  if (!getCompletionDateKey(item)) {
    return null;
  }

  const value =
    getCompletionValue(item);

  const match =
    String(value || '').match(
      /[T\s](\d{2}):/
    );

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);

  return hour >= 0 &&
    hour <= 23
    ? hour
    : null;
};

const categoryColor = (category) => {
  if (
    category === UNCLASSIFIED
  ) {
    return colors.textFaint;
  }

  return (
    CATEGORY_CONFIG.find(
      (item) =>
        item.key === category
    )?.color ||
    DEFAULT_CATEGORY_COLOR
  );
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
      `?x=${encodeURIComponent(
        lng
      )}&y=${encodeURIComponent(
        lat
      )}`;

    const response = await fetch(
      url,
      {
        headers: {
          Authorization:
            `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    const region =
      data.documents?.find(
        (item) =>
          item.region_type === 'H'
      );

    return region
      ? {
          sido:
            region.region_1depth_name,
          sigungu:
            region.region_2depth_name,
          adminDong:
            region.region_3depth_name,
        }
      : null;
  } catch (error) {
    console.log(
      '대시보드 행정동 조회 오류:',
      error
    );

    return null;
  }
};

const emptyStatusCounts = () => ({
  count: 0,
  pending: 0,
  working: 0,
  complete: 0,
});

const addStatusCount = (
  target,
  status
) => {
  target.count += 1;
  target[status] += 1;
};

export const buildAnalytics = (
  locations = []
) => {
  const totals =
    emptyStatusCounts();

  const regionMap =
    new Map();

  const categoryMap =
    new Map(
      CATEGORY_CONFIG.map(
        ({ key, color }) => [
          key,
          {
            category: key,
            color,
            ...emptyStatusCounts(),
          },
        ]
      )
    );

  const dateMap =
    new Map();

  const weekdayMap =
    new Map(
      WEEKDAY_ORDER.map(
        ({ day }) => [
          day,
          0,
        ]
      )
    );

  const hourMap =
    new Map(
      HOUR_RANGES.map(
        ({ key }) => [
          key,
          0,
        ]
      )
    );

  const seenTaskIds =
    new Set();

  let unknownCompletionTimeCount =
    0;

  locations.forEach(
    (location) => {
      const taskId =
        comparableTaskId(
          location
        );

      if (
        taskId &&
        seenTaskIds.has(taskId)
      ) {
        return;
      }

      if (taskId) {
        seenTaskIds.add(
          taskId
        );
      }

      const status =
        normalizeStatus(
          location.status
        );

      // 전체 KPI
      addStatusCount(
        totals,
        status
      );

      // 지역별
      const region =
        String(
          location.adminDong ||
            location.admin_dong ||
            ''
        ).trim() ||
        '행정동 미확인';

      if (
        !regionMap.has(region)
      ) {
        regionMap.set(
          region,
          {
            region,
            ...emptyStatusCounts(),
          }
        );
      }

      addStatusCount(
        regionMap.get(region),
        status
      );

      // 카테고리별
      const category =
        getCategory(location);

      if (
        !categoryMap.has(
          category
        )
      ) {
        categoryMap.set(
          category,
          {
            category,
            color:
              categoryColor(
                category
              ),
            ...emptyStatusCounts(),
          }
        );
      }

      addStatusCount(
        categoryMap.get(
          category
        ),
        status
      );

      // 아래 시간 관련 통계는
      // 완료된 업무만 대상으로 함
      if (
        status !== 'complete'
      ) {
        return;
      }

      const dateKey =
        getCompletionDateKey(
          location
        );

      const hour =
        getCompletionHour(
          location
        );

      if (
        !dateKey ||
        hour === null
      ) {
        unknownCompletionTimeCount +=
          1;
        return;
      }

      // 완료 날짜
      dateMap.set(
        dateKey,
        (
          dateMap.get(
            dateKey
          ) || 0
        ) + 1
      );

      const weekday =
        getWeekday(
          dateKey
        );

      weekdayMap.set(
        weekday,
        (
          weekdayMap.get(
            weekday
          ) || 0
        ) + 1
      );

      // 완료 시간대
      const range =
        hour === null
          ? null
          : HOUR_RANGES.find(
              (item) =>
                hour >=
                  item.from &&
                hour <= item.to
            );

      if (range) {
        hourMap.set(
          range.key,
          (
            hourMap.get(
              range.key
            ) || 0
          ) + 1
        );
      }
    }
  );

  const stableCountSort =
    (nameKey) =>
    (a, b) =>
      b.count -
        a.count ||
      String(
        a[nameKey]
      ).localeCompare(
        String(
          b[nameKey]
        ),
        'ko'
      );

  return {
    totals,

    completionRate:
      totals.count === 0
        ? 0
        : Math.round(
            (
              totals.complete /
              totals.count
            ) * 100
          ),

    regions:
      Array.from(
        regionMap.values()
      ).sort(
        stableCountSort(
          'region'
        )
      ),

    categories:
      Array.from(
        categoryMap.values()
      ).sort(
        stableCountSort(
          'category'
        )
      ),

    hours:
      HOUR_RANGES.map(
        (item) => ({
          ...item,
          count:
            hourMap.get(
              item.key
            ) || 0,
        })
      ),

    weekdays:
      WEEKDAY_ORDER.map(
        (item) => ({
          ...item,
          count:
            weekdayMap.get(
              item.day
            ) || 0,
        })
      ),

    dates:
      Array.from(
        dateMap,
        ([date, count]) => ({
          date,
          count,
        })
      ).sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      ),

    unknownCompletionTimeCount,
  };
};

export default function DashboardScreen({
  user,
  activeGroup,
  onBack,
}) {
  const [
    locations,
    setLocations,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadError,
    setLoadError,
  ] = useState('');

  const [
    visibleMonth,
    setVisibleMonth,
  ] = useState(
    getCurrentMonthKey
  );

  const today =
    new Date().toLocaleDateString(
      'ko-KR',
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }
    );

  const loadDashboard =
    useCallback(
      async () => {
        if (
          !activeGroup?.groupId ||
          !user?.userId
        ) {
          setLocations([]);
          setLoadError('');
          setLoading(false);

          return;
        }

        try {
          setLoading(true);
          setLoadError('');

          const assignmentData =
            await groupApi(
              `/api/groups/${activeGroup.groupId}/assignments?userId=${encodeURIComponent(
                user.userId
              )}`
            );

          const locationResponse =
            await fetch(
              `${API_BASE_URL}/api/locations?userId=${encodeURIComponent(
                user.userId
              )}` +
                `&groupId=${encodeURIComponent(
                  activeGroup.groupId
                )}`
            );

          if (
            !locationResponse.ok
          ) {
            throw new Error(
              '방문지를 불러오지 못했습니다.'
            );
          }

          const locationData =
            await locationResponse.json();

          const assignments =
            Array.isArray(
              assignmentData
            )
              ? assignmentData
              : [];

          const allLocations =
            Array.isArray(
              locationData
            )
              ? locationData
              : [];

          const groupTaskIds =
            new Set(
              assignments
                .map(
                  comparableTaskId
                )
                .filter(Boolean)
            );

          const seenTaskIds =
            new Set();

          const groupLocations =
            allLocations.filter(
              (location) => {
                const id =
                  comparableTaskId(
                    location
                  );

                if (
                  !id ||
                  !groupTaskIds.has(
                    id
                  ) ||
                  seenTaskIds.has(
                    id
                  )
                ) {
                  return false;
                }

                seenTaskIds.add(
                  id
                );

                return true;
              }
            );

          const resolvedLocations =
            await Promise.all(
              groupLocations.map(
                async (
                  location
                ) => {
                  const existingAdminDong =
                    location.adminDong ||
                    location.admin_dong;

                  const normalized =
                    {
                      ...location,

                      id:
                        getTaskId(
                          location
                        ),

                      taskCategory:
                        getCategory(
                          location
                        ),

                      completedAt:
                        location.completedAt ??
                        location.completed_at ??
                        null,

                      status:
                        normalizeStatus(
                          location.status ??
                            location.taskStatus ??
                            location.task_status ??
                            location.progressStatus ??
                            location.progress_status
                        ),
                    };

                  if (
                    existingAdminDong
                  ) {
                    return {
                      ...normalized,
                      adminDong:
                        String(
                          existingAdminDong
                        ).trim(),
                    };
                  }

                  const lat =
                    Number(
                      location.lat ??
                        location.latitude
                    );

                  const lng =
                    Number(
                      location.lng ??
                        location.longitude
                    );

                  if (
                    !Number.isFinite(
                      lat
                    ) ||
                    !Number.isFinite(
                      lng
                    )
                  ) {
                    return {
                      ...normalized,
                      adminDong:
                        '행정동 미확인',
                    };
                  }

                  const region =
                    await getAdministrativeRegion(
                      lat,
                      lng
                    );

                  return {
                    ...normalized,

                    sido:
                      location.sido ||
                      region?.sido ||
                      '',

                    sigungu:
                      location.sigungu ||
                      region?.sigungu ||
                      '',

                    adminDong:
                      region?.adminDong ||
                      '행정동 미확인',
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

  const analytics =
    useMemo(
      () =>
        buildAnalytics(
          locations
        ),
      [locations]
    );

  useEffect(() => {
    if (
      loading ||
      !activeGroup?.groupId
    ) {
      return;
    }

    const currentMonth =
      getCurrentMonthKey();

    const hasCurrentMonthData =
      analytics.dates.some(
        (item) =>
          item.date.startsWith(
            `${currentMonth}-`
          )
      );

    const latestMonth =
      analytics.dates[
        analytics.dates.length -
          1
      ]?.date.slice(0, 7);

    setVisibleMonth(
      hasCurrentMonthData
        ? currentMonth
        : latestMonth ||
            currentMonth
    );
  }, [
    activeGroup?.groupId,
    analytics.dates,
    loading,
  ]);

  const maxRegionCount =
    Math.max(
      1,
      ...analytics.regions.map(
        (item) =>
          item.count
      )
    );

  const maxCategoryCount =
    Math.max(
      1,
      ...analytics.categories.map(
        (item) =>
          item.count
      )
    );

  const maxHourCount =
    Math.max(
      1,
      ...analytics.hours.map(
        (item) =>
          item.count
      )
    );

  const maxWeekdayCount =
    Math.max(
      1,
      ...analytics.weekdays.map(
        (item) =>
          item.count
      )
    );

  return (
    <View
      style={
        styles.container
      }
    >
      <View
        style={styles.header}
      >
        <BackButton
          onPress={onBack}
        />

        <View
          style={
            styles.headerText
          }
        >
          <Text
            style={
              styles.eyebrow
            }
          >
            업무 통계 · {today}
          </Text>

          <Text
            style={
              styles.title
            }
          >
            외근 분석 대시보드
          </Text>

          <Text
            style={
              styles.workspace
            }
            numberOfLines={1}
          >
            {activeGroup?.groupName ||
              activeGroup?.name ||
              '선택된 그룹 없음'}
          </Text>
        </View>

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

      {loading ? (
        <View
          style={
            styles.loadingBox
          }
        >
          <ActivityIndicator
            size="large"
            color={
              colors.primary
            }
          />

          <Text
            style={
              styles.loadingText
            }
          >
            그룹 방문지 현황을
            불러오는 중...
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
            <MessageCard
              title="선택된 그룹이 없습니다"
              message="메인 화면에서 그룹을 선택한 후 다시 확인해 주세요."
            />
          ) : loadError ? (
            <MessageCard
              title="대시보드를 불러오지 못했습니다"
              message={
                loadError
              }
              actionLabel="다시 시도"
              onAction={
                loadDashboard
              }
              error
            />
          ) : (
            <>
              <View
                style={
                  styles.kpiGrid
                }
              >
                <Kpi
                  label="전체"
                  value={
                    analytics
                      .totals
                      .count
                  }
                  tone={
                    colors.primary
                  }
                />

                <Kpi
                  label="작업 전"
                  value={
                    analytics
                      .totals
                      .pending
                  }
                  tone={
                    colors.pending
                  }
                />

                <Kpi
                  label="작업 중"
                  value={
                    analytics
                      .totals
                      .working
                  }
                  tone={
                    colors.warning
                  }
                />

                <Kpi
                  label="완료"
                  value={
                    analytics
                      .totals
                      .complete
                  }
                  tone={
                    colors.success
                  }
                />

                <Kpi
                  label="완료율"
                  value={
                    analytics
                      .completionRate
                  }
                  suffix="%"
                  tone={
                    colors.teal
                  }
                  wide
                />
              </View>

              {/* 월간 완료 히트맵 */}
              <View
                style={
                  styles.card
                }
              >
                <SectionHeader
                  eyebrow="완료 날짜 기준"
                  title="월간 업무 완료 히트맵"
                  description="실제 완료 시각(completedAt)을 날짜별로 집계합니다."
                />

                <MonthlyHeatmap
                  monthKey={
                    visibleMonth
                  }
                  dates={
                    analytics.dates
                  }
                  unknownCompletionTimeCount={
                    analytics.unknownCompletionTimeCount
                  }
                  onPrevious={() =>
                    setVisibleMonth(
                      (
                        month
                      ) =>
                        shiftMonthKey(
                          month,
                          -1
                        )
                    )
                  }
                  onNext={() =>
                    setVisibleMonth(
                      (
                        month
                      ) =>
                        shiftMonthKey(
                          month,
                          1
                        )
                    )
                  }
                />
              </View>

              {/* 지역별 */}
              <View
                style={
                  styles.card
                }
              >
                <SectionHeader
                  eyebrow="행정동별 현황"
                  title="지역별 업무 현황"
                />

                <StatusLegend />

                {analytics.regions
                  .length ? (
                  analytics.regions.map(
                    (
                      item
                    ) => (
                      <DistributionRow
                        key={
                          item.region
                        }
                        label={
                          item.region
                        }
                        item={
                          item
                        }
                        maxCount={
                          maxRegionCount
                        }
                      />
                    )
                  )
                ) : (
                  <EmptyText>
                    현재 그룹에
                    배정된 방문지가
                    없습니다.
                  </EmptyText>
                )}
              </View>

              {/* 카테고리 */}
              <View
                style={
                  styles.card
                }
              >
                <SectionHeader
                  eyebrow="업무 유형"
                  title="카테고리별 업무 현황"
                />

                <StatusLegend />

                {analytics
                  .categories
                  .length ? (
                  analytics.categories.map(
                    (
                      item
                    ) => (
                      <DistributionRow
                        key={
                          item.category
                        }
                        label={
                          item.category
                        }
                        item={
                          item
                        }
                        maxCount={
                          maxCategoryCount
                        }
                        accent={
                          item.color
                        }
                      />
                    )
                  )
                ) : (
                  <EmptyText>
                    표시할 카테고리
                    데이터가 없습니다.
                  </EmptyText>
                )}
              </View>

              {/* 시간대별 */}
              <View
                style={
                  styles.card
                }
              >
                <SectionHeader
                  eyebrow="완료 시각 기준"
                  title="시간대별 업무 완료 현황"
                  description="실제 완료 시각(completedAt)을 기준으로 집계합니다."
                />

                {analytics.hours.map(
                  (item) => (
                    <BarRow
                      key={
                        item.key
                      }
                      label={
                        item.label
                      }
                      count={
                        item.count
                      }
                      maxCount={
                        maxHourCount
                      }
                      color={
                        colors.primary
                      }
                    />
                  )
                )}

                {analytics
                  .unknownCompletionTimeCount >
                0 ? (
                  <Text
                    style={
                      styles.unknownText
                    }
                  >
                    완료 시각 미확인{' '}
                    {
                      analytics.unknownCompletionTimeCount
                    }
                    건
                  </Text>
                ) : null}
              </View>

              {/* 요일별 */}
              <View
                style={
                  styles.card
                }
              >
                <SectionHeader
                  eyebrow="완료 요일 기준"
                  title="요일별 업무 완료 현황"
                  description="실제 완료 날짜의 요일을 기준으로 집계합니다."
                />

                <View
                  style={
                    styles.weekdayGrid
                  }
                >
                  {analytics.weekdays.map(
                    (
                      item
                    ) => (
                      <View
                        key={
                          item.day
                        }
                        style={
                          styles.weekdayItem
                        }
                      >
                        <View
                          style={
                            styles.weekdayTrack
                          }
                        >
                          <View
                            style={[
                              styles.weekdayFill,
                              {
                                height:
                                  `${
                                    (
                                      item.count /
                                      maxWeekdayCount
                                    ) *
                                    100
                                  }%`,
                              },
                            ]}
                          />
                        </View>

                        <Text
                          style={
                            styles.weekdayCount
                          }
                        >
                          {
                            item.count
                          }
                        </Text>

                        <Text
                          style={
                            styles.weekdayLabel
                          }
                        >
                          {
                            item.label
                          }
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function MonthlyHeatmap({
  monthKey,
  dates,
  unknownCompletionTimeCount,
  onPrevious,
  onNext,
}) {
  const calendar =
    useMemo(
      () =>
        buildCalendarMonth(
          monthKey,
          dates
        ),
      [
        dates,
        monthKey,
      ]
    );

  return (
    <View>
      <View
        style={
          styles.monthNavigation
        }
      >
        <TouchableOpacity
          style={
            styles.monthButton
          }
          onPress={
            onPrevious
          }
          activeOpacity={
            0.7
          }
          accessibilityRole="button"
          accessibilityLabel="이전 달"
        >
          <Text
            style={
              styles.monthButtonText
            }
          >
            ‹
          </Text>
        </TouchableOpacity>

        <Text
          style={
            styles.monthTitle
          }
        >
          {calendar.year}년{' '}
          {calendar.month}월
        </Text>

        <TouchableOpacity
          style={
            styles.monthButton
          }
          onPress={onNext}
          activeOpacity={
            0.7
          }
          accessibilityRole="button"
          accessibilityLabel="다음 달"
        >
          <Text
            style={
              styles.monthButtonText
            }
          >
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* 월~일 7개 전부 표시 */}
      <View
        style={
          styles.calendarWeekHeader
        }
      >
        {WEEKDAY_ORDER.map(
          (item) => (
            <Text
              key={
                item.day
              }
              style={
                styles.calendarWeekday
              }
            >
              {item.label}
            </Text>
          )
        )}
      </View>

      <View
        style={
          styles.calendarGrid
        }
      >
        {calendar.cells.map(
          (
            item,
            index
          ) => {
            if (!item) {
              return (
                <View
                  key={`blank-${index}`}
                  style={
                    styles.calendarCellSlot
                  }
                />
              );
            }

            const level =
              getHeatLevel(
                item.count,
                calendar.maxCount
              );

            const strong =
              level >= 3;

            return (
              <View
                key={
                  item.date
                }
                style={
                  styles.calendarCellSlot
                }
              >
                <View
                  style={[
                    styles.calendarCell,
                    {
                      backgroundColor:
                        HEAT_COLORS[
                          level
                        ],
                    },
                    level >
                      0 &&
                      styles.calendarCellActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDay,
                      strong &&
                        styles.calendarTextStrong,
                    ]}
                  >
                    {
                      item.day
                    }
                  </Text>

                  {item.count >
                  0 ? (
                    <Text
                      style={[
                        styles.calendarCount,
                        strong &&
                          styles.calendarTextStrong,
                      ]}
                    >
                      {
                        item.count
                      }
                      건
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }
        )}
      </View>

      <View
        style={
          styles.heatLegend
        }
      >
        <Text
          style={
            styles.heatLegendText
          }
        >
          적음
        </Text>

        {HEAT_COLORS.slice(
          1
        ).map(
          (color) => (
            <View
              key={
                color
              }
              style={[
                styles.heatLegendCell,
                {
                  backgroundColor:
                    color,
                },
              ]}
            />
          )
        )}

        <Text
          style={
            styles.heatLegendText
          }
        >
          많음
        </Text>
      </View>

      {calendar.totalCount ===
      0 ? (
        <Text
          style={
            styles.calendarEmpty
          }
        >
          이 달에 완료된 업무가
          없습니다.
        </Text>
      ) : null}

      {unknownCompletionTimeCount >
      0 ? (
        <Text
          style={
            styles.unknownText
          }
        >
          완료 시각 미확인{' '}
          {
            unknownCompletionTimeCount
          }
          건
        </Text>
      ) : null}
    </View>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}) {
  return (
    <View
      style={
        styles.sectionHeader
      }
    >
      <Text
        style={
          styles.cardEyebrow
        }
      >
        {eyebrow}
      </Text>

      <Text
        style={
          styles.cardTitle
        }
      >
        {title}
      </Text>

      {description ? (
        <Text
          style={
            styles.cardDescription
          }
        >
          {description}
        </Text>
      ) : null}
    </View>
  );
}

function Kpi({
  label,
  value,
  suffix = '건',
  tone,
  wide = false,
}) {
  return (
    <View
      style={[
        styles.kpi,
        wide &&
          styles.kpiWide,
      ]}
    >
      <View
        style={[
          styles.kpiDot,
          {
            backgroundColor:
              tone,
          },
        ]}
      />

      <Text
        style={
          styles.kpiLabel
        }
      >
        {label}
      </Text>

      <Text
        style={[
          styles.kpiValue,
          {
            color: tone,
          },
        ]}
      >
        {value}

        <Text
          style={
            styles.kpiSuffix
          }
        >
          {suffix}
        </Text>
      </Text>
    </View>
  );
}

function StatusLegend() {
  return (
    <View
      style={
        styles.legend
      }
    >
      {Object.entries(
        STATUS_META
      ).map(
        ([
          key,
          meta,
        ]) => (
          <View
            key={key}
            style={
              styles.legendItem
            }
          >
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor:
                    meta.color,
                },
              ]}
            />

            <Text
              style={
                styles.legendText
              }
            >
              {
                meta.label
              }
            </Text>
          </View>
        )
      )}
    </View>
  );
}

function DistributionRow({
  label,
  item,
  maxCount,
  accent,
}) {
  return (
    <View
      style={
        styles.distributionRow
      }
    >
      <View
        style={
          styles.distributionHeading
        }
      >
        <View
          style={
            styles.distributionLabelWrap
          }
        >
          {accent ? (
            <View
              style={[
                styles.categoryMarker,
                {
                  backgroundColor:
                    accent,
                },
              ]}
            />
          ) : null}

          <Text
            style={
              styles.distributionLabel
            }
            numberOfLines={
              1
            }
          >
            {label}
          </Text>
        </View>

        <Text
          style={
            styles.distributionTotal
          }
        >
          {item.count}건
        </Text>
      </View>

      <View
        style={[
          styles.totalTrack,
          {
            width:
              `${
                (
                  item.count /
                  maxCount
                ) *
                100
              }%`,
          },
        ]}
      >
        {[
          'pending',
          'working',
          'complete',
        ].map(
          (status) =>
            item[status] >
            0 ? (
              <View
                key={
                  status
                }
                style={{
                  flex:
                    item[
                      status
                    ],
                  backgroundColor:
                    STATUS_META[
                      status
                    ].color,
                }}
              />
            ) : null
        )}
      </View>

      <Text
        style={
          styles.distributionMeta
        }
      >
        작업 전{' '}
        {item.pending} · 작업
        중 {item.working} · 완료{' '}
        {item.complete}
      </Text>
    </View>
  );
}

function BarRow({
  label,
  count,
  maxCount,
  color,
}) {
  return (
    <View
      style={
        styles.barRow
      }
    >
      <Text
        style={
          styles.barLabel
        }
        numberOfLines={1}
      >
        {label}
      </Text>

      <View
        style={
          styles.barTrack
        }
      >
        {count > 0 ? (
          <View
            style={[
              styles.barFill,
              {
                width:
                  `${
                    (
                      count /
                      maxCount
                    ) *
                    100
                  }%`,
                backgroundColor:
                  color,
              },
            ]}
          />
        ) : null}
      </View>

      <Text
        style={
          styles.barCount
        }
      >
        {count}건
      </Text>
    </View>
  );
}

function EmptyText({
  children,
}) {
  return (
    <Text
      style={
        styles.emptyText
      }
    >
      {children}
    </Text>
  );
}

function MessageCard({
  title,
  message,
  actionLabel,
  onAction,
  error = false,
}) {
  return (
    <View
      style={
        styles.card
      }
    >
      <Text
        style={[
          styles.cardTitle,
          error &&
            styles.errorText,
        ]}
      >
        {title}
      </Text>

      <Text
        style={
          styles.emptyText
        }
      >
        {message}
      </Text>

      {actionLabel ? (
        <TouchableOpacity
          style={
            styles.retryButton
          }
          onPress={
            onAction
          }
          activeOpacity={
            0.75
          }
        >
          <Text
            style={
              styles.retryText
            }
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    header: {
      minHeight: 92,
      paddingHorizontal:
        spacing.page,
      paddingTop: 16,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor:
        colors.surface,
      borderBottomWidth: 1,
      borderBottomColor:
        colors.line,
    },

    headerText: {
      flex: 1,
    },

    eyebrow: {
      color:
        colors.primary,
      fontSize: 10,
      fontWeight: '800',
      marginBottom: 2,
    },

    title: {
      color:
        colors.text,
      fontSize: 23,
      fontWeight: '900',
      letterSpacing: -0.7,
    },

    workspace: {
      color:
        colors.textSoft,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 3,
    },

    userCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.primary,
    },

    userText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '900',
    },

    loadingBox: {
      flex: 1,
      alignItems: 'center',
      justifyContent:
        'center',
      gap: 12,
    },

    loadingText: {
      color:
        colors.textSoft,
      fontSize: 12,
      fontWeight: '700',
    },

    body: {
      padding:
        spacing.page,
      paddingBottom: 36,
      gap:
        spacing.section,
    },

    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },

    kpi: {
      minWidth: '30%',
      flexGrow: 1,
      flexBasis: 100,
      backgroundColor:
        colors.surface,
      borderRadius:
        radius.medium,
      borderWidth: 1,
      borderColor:
        colors.line,
      padding: 14,
      ...shadow,
    },

    kpiWide: {
      flexBasis: 150,
    },

    kpiDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      marginBottom: 10,
    },

    kpiLabel: {
      color:
        colors.textSoft,
      fontSize: 11,
      fontWeight: '800',
    },

    kpiValue: {
      fontSize: 25,
      fontWeight: '900',
      marginTop: 4,
    },

    kpiSuffix: {
      color:
        colors.textSoft,
      fontSize: 11,
      fontWeight: '800',
    },

    card: {
      backgroundColor:
        colors.surface,
      borderRadius:
        radius.large,
      borderWidth: 1,
      borderColor:
        colors.line,
      padding:
        spacing.card,
      ...shadow,
    },

    sectionHeader: {
      marginBottom: 14,
    },

    cardEyebrow: {
      color:
        colors.primary,
      fontSize: 10,
      fontWeight: '900',
      marginBottom: 4,
    },

    cardTitle: {
      color:
        colors.text,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: -0.4,
    },

    cardDescription: {
      color:
        colors.textSoft,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 5,
    },

    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 12,
    },

    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },

    legendDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },

    legendText: {
      color:
        colors.textSoft,
      fontSize: 9,
      fontWeight: '700',
    },

    distributionRow: {
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor:
        colors.surfaceMuted,
    },

    distributionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 7,
    },

    distributionLabelWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },

    distributionLabel: {
      flex: 1,
      color:
        colors.text,
      fontSize: 12,
      fontWeight: '800',
    },

    distributionTotal: {
      color:
        colors.text,
      fontSize: 12,
      fontWeight: '900',
    },

    categoryMarker: {
      width: 8,
      height: 8,
      borderRadius: 3,
    },

    totalTrack: {
      minWidth: 3,
      height: 9,
      flexDirection: 'row',
      overflow: 'hidden',
      borderRadius:
        radius.pill,
      backgroundColor:
        colors.surfaceMuted,
    },

    distributionMeta: {
      color:
        colors.textSoft,
      fontSize: 9,
      fontWeight: '700',
      marginTop: 5,
    },

    barRow: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
    },

    barLabel: {
      width: 76,
      color:
        colors.text,
      fontSize: 10,
      fontWeight: '800',
    },

    barTrack: {
      flex: 1,
      height: 10,
      borderRadius:
        radius.pill,
      overflow: 'hidden',
      backgroundColor:
        colors.surfaceMuted,
    },

    barFill: {
      height: '100%',
      borderRadius:
        radius.pill,
    },

    barCount: {
      width: 34,
      color:
        colors.textSoft,
      fontSize: 10,
      fontWeight: '900',
      textAlign: 'right',
    },

    weekdayGrid: {
      height: 160,
      flexDirection: 'row',
      alignItems:
        'flex-end',
      gap: 7,
    },

    weekdayItem: {
      flex: 1,
      alignItems: 'center',
    },

    weekdayTrack: {
      width: '70%',
      height: 105,
      justifyContent:
        'flex-end',
      overflow: 'hidden',
      borderRadius:
        radius.small,
      backgroundColor:
        colors.surfaceMuted,
    },

    weekdayFill: {
      width: '100%',
      minHeight: 2,
      backgroundColor:
        colors.teal,
      borderRadius:
        radius.small,
    },

    weekdayCount: {
      color:
        colors.text,
      fontSize: 10,
      fontWeight: '900',
      marginTop: 5,
    },

    weekdayLabel: {
      color:
        colors.textSoft,
      fontSize: 10,
      fontWeight: '800',
      marginTop: 2,
    },

    monthNavigation: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 13,
    },

    monthButton: {
      width: 38,
      height: 36,
      borderRadius:
        radius.small,
      alignItems: 'center',
      justifyContent:
        'center',
      backgroundColor:
        colors.primarySoft,
    },

    monthButtonText: {
      color:
        colors.primary,
      fontSize: 27,
      fontWeight: '700',
      lineHeight: 29,
    },

    monthTitle: {
      color:
        colors.text,
      fontSize: 16,
      fontWeight: '900',
    },

    calendarWeekHeader: {
      flexDirection: 'row',
      marginBottom: 5,
    },

    // 월~일 7열
    calendarWeekday: {
      width: '14.285%',
      color:
        colors.textSoft,
      fontSize: 10,
      fontWeight: '800',
      textAlign: 'center',
    },

    calendarGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },

    // 월~일 7열
    calendarCellSlot: {
      width: '14.285%',
      aspectRatio: 0.86,
      padding: 2,
    },

    calendarCell: {
      flex: 1,
      borderRadius:
        radius.small,
      borderWidth: 1,
      borderColor:
        colors.line,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 1,
    },

    calendarCellActive: {
      borderColor:
        'transparent',
    },

    calendarDay: {
      color:
        colors.text,
      fontSize: 11,
      fontWeight: '900',
    },

    calendarCount: {
      color:
        colors.primaryDark,
      fontSize: 8,
      fontWeight: '800',
      marginTop: 2,
    },

    calendarTextStrong: {
      color: '#FFFFFF',
    },

    heatLegend: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'flex-end',
      gap: 4,
      marginTop: 10,
    },

    heatLegendCell: {
      width: 14,
      height: 10,
      borderRadius: 3,
    },

    heatLegendText: {
      color:
        colors.textSoft,
      fontSize: 8,
      fontWeight: '700',
    },

    calendarEmpty: {
      color:
        colors.textSoft,
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 12,
    },

    unknownText: {
      alignSelf:
        'flex-start',
      color:
        colors.textSoft,
      fontSize: 9,
      fontWeight: '700',
      backgroundColor:
        colors.surfaceMuted,
      borderRadius:
        radius.pill,
      paddingHorizontal: 9,
      paddingVertical: 5,
      marginTop: 9,
    },

    emptyText: {
      color:
        colors.textSoft,
      fontSize: 11,
      lineHeight: 18,
      marginTop: 10,
    },

    errorText: {
      color:
        colors.danger,
    },

    retryButton: {
      alignSelf:
        'flex-start',
      marginTop: 14,
      borderRadius:
        radius.small,
      backgroundColor:
        colors.primary,
      paddingHorizontal: 13,
      paddingVertical: 9,
    },

    retryText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '900',
    },
  });
