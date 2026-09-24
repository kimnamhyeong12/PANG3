import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

const ROUTE_NOTIFICATION_ID = 'fieldwork-route-guidance';
const TASK_CHANNEL_ID = 'task';
const ROUTE_CHANNEL_ID = 'route';

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  ASSIGNEE_CHANGED: 'ASSIGNEE_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  MORNING_SUMMARY: 'MORNING_SUMMARY',
  END_OF_DAY_INCOMPLETE: 'END_OF_DAY_INCOMPLETE',
  ROUTE_GUIDANCE: 'ROUTE_GUIDANCE',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// -------------------------------------------------------
// Android 알림 채널
// -------------------------------------------------------
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(TASK_CHANNEL_ID, {
    name: '업무 알림',
    description:
      '새 업무 배정, 담당자 변경, 우선순위 변경 및 업무 안내 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });

  await Notifications.setNotificationChannelAsync(ROUTE_CHANNEL_ID, {
    name: '경로 안내',
    description: '외근 경로 진행 상태 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
  });
}

// -------------------------------------------------------
// 권한 확인 / 요청
// -------------------------------------------------------
export async function checkNotificationPermission() {
  try {
    await setupNotificationChannels();

    const permission = await Notifications.getPermissionsAsync();

    return (
      permission.granted === true ||
      permission.status === 'granted'
    );
  } catch (error) {
    console.error('[Notification] 권한 확인 실패:', error);
    return false;
  }
}

export async function requestNotificationPermission() {
  try {
    await setupNotificationChannels();

    const current = await Notifications.getPermissionsAsync();

    if (
      current.granted === true ||
      current.status === 'granted'
    ) {
      return {
        success: true,
        status: 'granted',
        canAskAgain: current.canAskAgain,
      };
    }

    const result = await Notifications.requestPermissionsAsync();

    return {
      success:
        result.granted === true ||
        result.status === 'granted',
      status: result.status,
      canAskAgain: result.canAskAgain,
    };
  } catch (error) {
    console.error('[Notification] 권한 요청 실패:', error);

    return {
      success: false,
      status: 'error',
      canAskAgain: false,
      error,
    };
  }
}

// -------------------------------------------------------
// Expo Push Token
// -------------------------------------------------------
function getEasProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

export async function getExpoPushToken() {
  try {
    const granted = await checkNotificationPermission();

    if (!granted) {
      return null;
    }

    const projectId = getEasProjectId();

    if (!projectId) {
      console.log('[Notification] EAS projectId가 없어 Push Token을 발급하지 않습니다.');
      return null;
    }

    const result = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return result?.data || null;
  } catch (error) {
    // 에뮬레이터/FCM 설정 전 단계에서도 앱 자체는 정상 동작해야 한다.
    console.log(
      '[Notification] Expo Push Token 발급 실패:',
      error?.message || error
    );
    return null;
  }
}

function getUserId(userOrId) {
  if (userOrId === null || userOrId === undefined) return null;

  if (
    typeof userOrId === 'string' ||
    typeof userOrId === 'number'
  ) {
    return userOrId;
  }

  return (
    userOrId.userId ??
    userOrId.id ??
    userOrId.user_id ??
    null
  );
}

export async function registerPushTokenForUser(userOrId, token) {
  const userId = getUserId(userOrId);

  if (!API_BASE_URL || !userId || !token) {
    return {
      success: false,
      reason: 'missing-data',
    };
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/notifications/tokens`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          expoPushToken: token,
          platform: Platform.OS,
        }),
      }
    );

    const text = await response.text();

    if (!response.ok) {
      // 백엔드 알림 API가 아직 main에 배포되지 않은 단계에서는
      // 프론트 기능 자체를 막지 않는다.
      if (response.status === 404 || response.status === 405) {
        console.log(
          '[Notification] Push Token 등록 API가 아직 배포되지 않았습니다.'
        );

        return {
          success: false,
          reason: 'backend-not-ready',
          status: response.status,
        };
      }

      throw new Error(
        text || `Push Token 등록 실패: ${response.status}`
      );
    }

    return {
      success: true,
      token,
    };
  } catch (error) {
    console.log(
      '[Notification] Push Token 서버 등록 실패:',
      error?.message || error
    );

    return {
      success: false,
      reason: 'request-failed',
      error,
    };
  }
}

export async function syncPushTokenForUser(userOrId) {
  const userId = getUserId(userOrId);

  if (!userId) {
    return {
      success: false,
      reason: 'missing-user',
    };
  }

  const token = await getExpoPushToken();

  if (!token) {
    return {
      success: false,
      reason: 'token-unavailable',
    };
  }

  return registerPushTokenForUser(userId, token);
}

export async function unregisterPushTokenForUser(userOrId) {
  const userId = getUserId(userOrId);

  if (!API_BASE_URL || !userId) {
    return false;
  }

  try {
    const token = await getExpoPushToken();

    if (!token) {
      return false;
    }

    const response = await fetch(
      `${API_BASE_URL}/api/notifications/tokens`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          expoPushToken: token,
          platform: Platform.OS,
        }),
      }
    );

    if (
      !response.ok &&
      response.status !== 404 &&
      response.status !== 405
    ) {
      const text = await response.text();
      throw new Error(
        text || `Push Token 해제 실패: ${response.status}`
      );
    }

    return response.ok;
  } catch (error) {
    console.log(
      '[Notification] Push Token 해제 실패:',
      error?.message || error
    );
    return false;
  }
}

// -------------------------------------------------------
// 푸시 수신 / 알림 터치 listener
// -------------------------------------------------------
export function addNotificationReceivedListener(listener) {
  return Notifications.addNotificationReceivedListener(
    (notification) => {
      listener?.(notification);
    }
  );
}

export function addNotificationResponseListener(listener) {
  return Notifications.addNotificationResponseReceivedListener(
    (response) => {
      listener?.(response);
    }
  );
}

// -------------------------------------------------------
// 경로 안내 알림
// -------------------------------------------------------
export async function showRouteNotification({
  from,
  to,
  duration,
  distance,
  remainingCount,
}) {
  try {
    const granted = await checkNotificationPermission();

    if (!granted) {
      return false;
    }

    const safeFrom = from || '현재 위치';
    const safeTo = to || '다음 방문지';
    const safeDuration = duration || '-';
    const safeDistance = distance || '-';

    const count =
      Number.isFinite(Number(remainingCount))
        ? Number(remainingCount)
        : 0;

    try {
      await Notifications.dismissNotificationAsync(
        ROUTE_NOTIFICATION_ID
      );
    } catch (_) {
      // 기존 경로 알림이 없으면 무시
    }

    await Notifications.scheduleNotificationAsync({
      identifier: ROUTE_NOTIFICATION_ID,

      content: {
        title: '📍 외근도우미 · 경로 안내 중',
        body:
          `${safeFrom} → ${safeTo}\n` +
          `예상 ${safeDuration} · ${safeDistance}\n` +
          `남은 방문지 ${count}곳`,
        sticky: true,
        autoDismiss: false,
        data: {
          type: NOTIFICATION_TYPES.ROUTE_GUIDANCE,
          from: safeFrom,
          to: safeTo,
          remainingCount: count,
        },
      },

      trigger:
        Platform.OS === 'android'
          ? {
              channelId: ROUTE_CHANNEL_ID,
            }
          : null,
    });

    return true;
  } catch (error) {
    console.error(
      '[Notification] 경로 알림 실패:',
      error
    );
    return false;
  }
}

export async function updateRouteNotification(data) {
  return showRouteNotification(data);
}

export async function stopRouteNotification() {
  try {
    await Notifications.dismissNotificationAsync(
      ROUTE_NOTIFICATION_ID
    );

    return true;
  } catch (error) {
    console.error(
      '[Notification] 경로 알림 제거 실패:',
      error
    );
    return false;
  }
}
