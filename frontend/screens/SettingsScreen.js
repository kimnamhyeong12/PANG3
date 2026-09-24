import React, { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { showAlert } from '../components/CustomAlert';
import {
  PrimaryButton,
  ScreenHeader,
  SectionTitle,
} from '../components/ui';

import { colors, radius } from '../constants/design';

import {
  checkNotificationPermission,
  requestNotificationPermission,
  syncPushTokenForUser,
} from '../services/notificationService';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL;

const REGIONS = [
  '부산광역시',
  '서울특별시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '제주특별자치도',
];

const DISTRICTS_BY_REGION = {
  부산광역시: [
    '중구',
    '서구',
    '동구',
    '영도구',
    '부산진구',
    '동래구',
    '남구',
    '북구',
    '해운대구',
    '사하구',
    '금정구',
    '강서구',
    '연제구',
    '수영구',
    '사상구',
    '기장군',
  ],

  서울특별시: [
    '종로구',
    '중구',
    '용산구',
    '성동구',
    '광진구',
    '동대문구',
    '중랑구',
    '성북구',
    '강북구',
    '도봉구',
    '노원구',
    '은평구',
    '서대문구',
    '마포구',
    '양천구',
    '강서구',
    '구로구',
    '금천구',
    '영등포구',
    '동작구',
    '관악구',
    '서초구',
    '강남구',
    '송파구',
    '강동구',
  ],

  대구광역시: [
    '중구',
    '동구',
    '서구',
    '남구',
    '북구',
    '수성구',
    '달서구',
    '달성군',
    '군위군',
  ],

  인천광역시: [
    '중구',
    '동구',
    '미추홀구',
    '연수구',
    '남동구',
    '부평구',
    '계양구',
    '서구',
    '강화군',
    '옹진군',
  ],

  광주광역시: [
    '동구',
    '서구',
    '남구',
    '북구',
    '광산구',
  ],

  대전광역시: [
    '동구',
    '중구',
    '서구',
    '유성구',
    '대덕구',
  ],

  울산광역시: [
    '중구',
    '남구',
    '동구',
    '북구',
    '울주군',
  ],

  제주특별자치도: [
    '제주시',
    '서귀포시',
  ],
};

export default function SettingsScreen({
  user,
  activeGroup,
  onBack,
  onUpdatedUser,
  onDashboard,
  onLogout,
}) {
  const [workSido, setWorkSido] = useState(
    user?.workSido || '부산광역시'
  );

  const [workSigungu, setWorkSigungu] = useState(
    user?.workSigungu || ''
  );

  const [picker, setPicker] = useState(null);
  const [saving, setSaving] = useState(false);

  const [
    notificationEnabled,
    setNotificationEnabled,
  ] = useState(false);

  const [
    notificationChecking,
    setNotificationChecking,
  ] = useState(true);

  const districts = useMemo(
    () =>
      DISTRICTS_BY_REGION[workSido] || [],
    [workSido]
  );

  const changed =
    workSido !==
      (user?.workSido || '부산광역시') ||
    workSigungu !==
      (user?.workSigungu || '');

  useEffect(() => {
    refreshNotificationPermission();
  }, [user?.userId]);

  const refreshNotificationPermission =
    async () => {
      try {
        setNotificationChecking(true);

        const granted =
          await checkNotificationPermission();

        setNotificationEnabled(granted);

        if (granted && user?.userId) {
          // 이미 권한이 있는 사용자는 설정 화면 진입 시
          // Expo Push Token을 서버와 한 번 동기화한다.
          syncPushTokenForUser(user);
        }
      } catch (error) {
        console.error(
          '알림 권한 확인 실패:',
          error
        );
      } finally {
        setNotificationChecking(false);
      }
    };

  const handleNotificationPress =
    async () => {
      /*
       * 이미 허용되어 있는 경우
       * Android 설정 화면으로 이동해서
       * 사용자가 직접 끄거나 세부 설정 가능
       */
      if (notificationEnabled) {
        Alert.alert(
          '업무 알림',
          '현재 알림이 허용되어 있습니다.',
          [
            {
              text: '취소',
              style: 'cancel',
            },
            {
              text: '휴대폰 설정',
              onPress: () =>
                Linking.openSettings(),
            },
          ]
        );

        return;
      }

      /*
       * 아직 허용 안 된 경우
       */
      Alert.alert(
        '업무 알림 사용',
        '새 업무 배정, 업무 우선순위 변경, 오늘 업무 요약, 미완료 업무 및 경로 안내를 받으려면 알림 권한이 필요합니다.',
        [
          {
            text: '나중에',
            style: 'cancel',
          },

          {
            text: '알림 켜기',

            onPress: async () => {
              const result =
                await requestNotificationPermission();

              if (result.success) {
                setNotificationEnabled(true);

                if (user?.userId) {
                  // 백엔드 알림 API가 아직 배포 전이어도
                  // 권한 설정 자체는 정상 완료되도록 비동기로 처리한다.
                  syncPushTokenForUser(user);
                }

                showAlert(
                  '알림 설정 완료',
                  '이제 외근도우미 업무 알림을 받을 수 있습니다.'
                );

                return;
              }

              if (
                result.canAskAgain === false
              ) {
                Alert.alert(
                  '알림 권한 필요',
                  '휴대폰 설정에서 외근도우미 알림을 허용해주세요.',
                  [
                    {
                      text: '취소',
                      style: 'cancel',
                    },
                    {
                      text: '설정 열기',
                      onPress: () =>
                        Linking.openSettings(),
                    },
                  ]
                );

                return;
              }

              showAlert(
                '알림 권한 필요',
                '알림을 허용해야 업무 알림을 받을 수 있습니다.'
              );
            },
          },
        ]
      );
    };

  const selectSido = (region) => {
    setWorkSido(region);

    if (
      !(
        DISTRICTS_BY_REGION[region] ||
        []
      ).includes(workSigungu)
    ) {
      setWorkSigungu('');
    }

    setPicker(null);
  };

  const save = async () => {
    if (!workSigungu) {
      showAlert(
        '구·군 선택 필요',
        '개인 공공업무에 사용할 구·군을 선택하세요.'
      );

      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_BASE_URL}/api/users/${user.userId}/work-region`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            workSido,
            workSigungu,
          }),
        }
      );

      const text =
        await response.text();

      if (!response.ok) {
        throw new Error(
          text || '저장 실패'
        );
      }

      const saved = text
        ? JSON.parse(text)
        : {};

      onUpdatedUser?.({
        ...user,
        ...saved,
        workSido,
        workSigungu,
      });

      showAlert(
        '저장 완료',
        `${workSido} ${workSigungu}로 근무지역을 변경했습니다.`
      );
    } catch (error) {
      showAlert(
        '저장 실패',
        error.message ||
          '근무지역을 저장하지 못했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const logout = () =>
    Alert.alert(
      '로그아웃',
      '현재 계정에서 로그아웃하시겠습니까?',
      [
        {
          text: '취소',
          style: 'cancel',
        },

        {
          text: '로그아웃',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );

  const options =
    picker === 'sido'
      ? REGIONS
      : districts;

  const selected =
    picker === 'sido'
      ? workSido
      : workSigungu;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="설정"
        subtitle="계정과 근무지역을 관리합니다"
        onBack={onBack}
      />

      <ScrollView
        contentContainerStyle={
          styles.body
        }
      >
        {/* 프로필 */}

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text
              style={styles.avatarText}
            >
              {String(
                user?.name ||
                  user?.loginId ||
                  '?'
              ).slice(0, 1)}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {user?.name ||
                user?.loginId}
            </Text>

            <Text
              style={styles.loginId}
            >
              @{user?.loginId}
            </Text>
          </View>
        </View>

        {/* 근무지역 */}

        <SectionTitle title="근무지역" />

        <View style={styles.card}>
          <RegionRow
            label="시·도"
            value={workSido}
            icon="map-outline"
            onPress={() =>
              setPicker('sido')
            }
          />

          <View style={styles.divider} />

          <RegionRow
            label="구·군"
            value={
              workSigungu ||
              '구·군을 선택하세요'
            }
            icon="location-outline"
            muted={!workSigungu}
            onPress={() =>
              setPicker('sigungu')
            }
          />

          <Text style={styles.help}>
            개인 공공업무는 이 구·군의
            행정동을 사용하며, 팀 업무는
            각 그룹의 활동지역을
            따릅니다.
          </Text>

          <PrimaryButton
            title={
              saving
                ? '저장 중...'
                : '변경사항 저장'
            }
            onPress={save}
            disabled={
              saving ||
              !changed ||
              !workSigungu
            }
          />
        </View>

        {/* 알림 설정 */}

        <SectionTitle title="알림" />

        <TouchableOpacity
          style={styles.menuRow}
          onPress={
            handleNotificationPress
          }
          disabled={
            notificationChecking
          }
        >
          <View
            style={
              styles.itemIcon
            }
          >
            <Ionicons
              name={
                notificationEnabled
                  ? 'notifications'
                  : 'notifications-outline'
              }
              size={21}
              color={colors.primary}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={styles.itemValue}
            >
              업무 알림
            </Text>

            <Text
              style={styles.itemLabel}
            >
              {notificationChecking
                ? '알림 권한 확인 중...'
                : notificationEnabled
                  ? '허용됨 · 업무 및 경로 알림을 받을 수 있습니다'
                  : '꺼짐 · 알림을 받으려면 권한을 허용하세요'}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,

              notificationEnabled
                ? styles.statusBadgeOn
                : styles.statusBadgeOff,
            ]}
          >
            <Text
              style={[
                styles.statusText,

                notificationEnabled
                  ? styles.statusTextOn
                  : styles.statusTextOff,
              ]}
            >
              {notificationEnabled
                ? 'ON'
                : 'OFF'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 업무 도구 */}

        <SectionTitle title="업무 도구" />

        <TouchableOpacity
          style={styles.menuRow}
          onPress={onDashboard}
        >
          <View
            style={
              styles.itemIcon
            }
          >
            <Ionicons
              name="stats-chart-outline"
              size={21}
              color={colors.primary}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={styles.itemValue}
            >
              외근 분석
            </Text>

            <Text
              style={styles.itemLabel}
            >
              {activeGroup?.groupName ||
                '현재 업무공간'}{' '}
              현황 보기
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={18}
            color={
              colors.textFaint
            }
          />
        </TouchableOpacity>

        {/* 로그아웃 */}

        <TouchableOpacity
          style={[
            styles.menuRow,
            styles.logoutRow,
          ]}
          onPress={logout}
        >
          <View
            style={[
              styles.itemIcon,
              styles.logoutIcon,
            ]}
          >
            <Ionicons
              name="log-out-outline"
              size={21}
              color={colors.danger}
            />
          </View>

          <Text
            style={styles.logoutText}
          >
            로그아웃
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 지역 선택 모달 */}

      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPicker(null)
        }
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() =>
            setPicker(null)
          }
        >
          <View
            style={styles.sheet}
            onStartShouldSetResponder={() =>
              true
            }
          >
            <Text
              style={
                styles.sheetTitle
              }
            >
              {picker === 'sido'
                ? '시·도 선택'
                : `${workSido} 구·군 선택`}
            </Text>

            <ScrollView
              style={
                styles.optionList
              }
            >
              {options.map(
                (option) => (
                  <TouchableOpacity
                    key={option}
                    style={
                      styles.option
                    }
                    onPress={() => {
                      if (
                        picker ===
                        'sido'
                      ) {
                        selectSido(
                          option
                        );
                      } else {
                        setWorkSigungu(
                          option
                        );

                        setPicker(
                          null
                        );
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,

                        selected ===
                          option &&
                          styles.optionActive,
                      ]}
                    >
                      {option}
                    </Text>

                    {selected ===
                    option ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={21}
                        color={
                          colors.primary
                        }
                      />
                    ) : null}
                  </TouchableOpacity>
                )
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function RegionRow({
  label,
  value,
  icon,
  onPress,
  muted,
}) {
  return (
    <TouchableOpacity
      style={styles.regionRow}
      onPress={onPress}
    >
      <View style={styles.itemIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={colors.primary}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>
          {label}
        </Text>

        <Text
          style={[
            styles.itemValue,
            muted && styles.muted,
          ]}
        >
          {value}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textFaint}
      />
    </TouchableOpacity>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        colors.background,
    },

    body: {
      padding: 20,
      paddingBottom: 34,
    },

    profile: {
      backgroundColor:
        colors.primaryDark,
      borderRadius:
        radius.large,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 26,
    },

    avatar: {
      width: 52,
      height: 52,
      borderRadius: 17,
      backgroundColor:
        '#DCEBFF',
      alignItems: 'center',
      justifyContent:
        'center',
    },

    avatarText: {
      color:
        colors.primaryDark,
      fontSize: 20,
      fontWeight: '900',
    },

    name: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '900',
    },

    loginId: {
      color: '#DCEBFF',
      fontSize: 11,
      marginTop: 4,
    },

    card: {
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.line,
      borderRadius:
        radius.large,
      padding: 16,
      marginBottom: 26,
      gap: 13,
    },

    regionRow: {
      minHeight: 55,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },

    divider: {
      height: 1,
      backgroundColor:
        colors.line,
    },

    itemIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor:
        colors.primarySoft,
      alignItems: 'center',
      justifyContent:
        'center',
    },

    itemLabel: {
      color: colors.textSoft,
      fontSize: 10,
      marginTop: 3,
    },

    itemValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '900',
      marginTop: 3,
    },

    muted: {
      color:
        colors.textFaint,
    },

    help: {
      color: colors.textSoft,
      fontSize: 10,
      lineHeight: 16,
    },

    menuRow: {
      minHeight: 68,
      backgroundColor:
        colors.surface,
      borderWidth: 1,
      borderColor:
        colors.line,
      borderRadius:
        radius.medium,
      padding: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      marginBottom: 10,
    },

    statusBadge: {
      minWidth: 44,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent:
        'center',
      paddingHorizontal: 9,
    },

    statusBadgeOn: {
      backgroundColor:
        colors.primarySoft,
    },

    statusBadgeOff: {
      backgroundColor:
        '#EEF0F3',
    },

    statusText: {
      fontSize: 11,
      fontWeight: '900',
    },

    statusTextOn: {
      color: colors.primary,
    },

    statusTextOff: {
      color:
        colors.textFaint,
    },

    logoutRow: {
      marginTop: 12,
    },

    logoutIcon: {
      backgroundColor:
        colors.dangerSoft,
    },

    logoutText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: '900',
    },

    backdrop: {
      flex: 1,
      backgroundColor:
        'rgba(16,40,91,0.38)',
      justifyContent:
        'center',
      padding: 24,
    },

    sheet: {
      backgroundColor:
        colors.surface,
      borderRadius:
        radius.large,
      padding: 18,
      maxHeight: '78%',
    },

    sheetTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '900',
      marginBottom: 8,
    },

    optionList: {
      maxHeight: 490,
    },

    option: {
      minHeight: 48,
      borderTopWidth: 1,
      borderTopColor:
        colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    optionText: {
      color: colors.textSoft,
      fontSize: 13,
    },

    optionActive: {
      color: colors.primary,
      fontWeight: '900',
    },
  });