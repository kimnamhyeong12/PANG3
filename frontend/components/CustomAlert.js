import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

let alertListener = null;
let pendingAlert = null;

const normalizeButtons = (buttons) => {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ text: '확인', style: 'default' }];
  }

  return buttons.map((button) => ({
    text: button?.text || '확인',
    onPress: button?.onPress,
    style: button?.style || 'default',
  }));
};

export const showAlert = (title, message, buttons, options) => {
  // 기존 window.alert('메시지')처럼 한 인자만 넘겨도 동작하도록 지원
  if (message === undefined) {
    message = title;
    title = '';
  }

  const payload = {
    title: title || '',
    message: message == null ? '' : String(message),
    buttons: normalizeButtons(buttons),
    options: options || {},
  };

  if (alertListener) {
    alertListener(payload);
  } else {
    pendingAlert = payload;
  }
};

const getTone = (title = '') => {
  const value = String(title);

  if (/완료|성공|저장|추가/.test(value)) {
    return 'success';
  }

  if (/실패|오류|불가|필요|없음|권한/.test(value)) {
    return 'warning';
  }

  return 'info';
};

const TONE_META = {
  success: {
    symbol: '✓',
    badgeBackground: '#E8F7EF',
    badgeText: '#168653',
  },
  warning: {
    symbol: '!',
    badgeBackground: '#FFF3E8',
    badgeText: '#D96B16',
  },
  info: {
    symbol: 'i',
    badgeBackground: '#EAF2FF',
    badgeText: '#2563EB',
  },
};

export function CustomAlertHost() {
  const [alertData, setAlertData] = useState(null);

  useEffect(() => {
    alertListener = setAlertData;

    if (pendingAlert) {
      setAlertData(pendingAlert);
      pendingAlert = null;
    }

    return () => {
      if (alertListener === setAlertData) {
        alertListener = null;
      }
    };
  }, []);

  const tone = useMemo(
    () => getTone(alertData?.title),
    [alertData?.title]
  );
  const meta = TONE_META[tone];

  const close = () => {
    setAlertData(null);
  };

  const handleDismiss = () => {
    if (alertData?.options?.cancelable === false) return;
    close();
    alertData?.options?.onDismiss?.();
  };

  const handleButtonPress = (button) => {
    close();
    button?.onPress?.();
  };

  if (!alertData) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />

        <View style={styles.card}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: meta.badgeBackground },
            ]}
          >
            <Text style={[styles.iconText, { color: meta.badgeText }]}>
              {meta.symbol}
            </Text>
          </View>

          {!!alertData.title && (
            <Text style={styles.title}>{alertData.title}</Text>
          )}

          {!!alertData.message && (
            <Text
              style={[
                styles.message,
                !alertData.title && styles.messageWithoutTitle,
              ]}
            >
              {alertData.message}
            </Text>
          )}

          <View
            style={[
              styles.buttonRow,
              alertData.buttons.length === 1 && styles.singleButtonRow,
            ]}
          >
            {alertData.buttons.map((button, index) => {
              const isCancel = button.style === 'cancel';
              const isDestructive = button.style === 'destructive';
              const isPrimary = !isCancel && !isDestructive;

              return (
                <Pressable
                  key={`${button.text}-${index}`}
                  onPress={() => handleButtonPress(button)}
                  style={({ pressed }) => [
                    styles.button,
                    isPrimary && styles.primaryButton,
                    isCancel && styles.cancelButton,
                    isDestructive && styles.destructiveButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isPrimary && styles.primaryButtonText,
                      isCancel && styles.cancelButtonText,
                      isDestructive && styles.destructiveButtonText,
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 29,
  },
  title: {
    color: '#111827',
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    marginTop: 8,
    color: '#667085',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
  },
  messageWithoutTitle: {
    marginTop: 0,
    color: '#344054',
    fontSize: 15,
  },
  buttonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  singleButtonRow: {
    justifyContent: 'center',
  },
  button: {
    minHeight: 48,
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: '#12395B',
  },
  cancelButton: {
    backgroundColor: '#F2F4F7',
  },
  destructiveButton: {
    backgroundColor: '#FEF3F2',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  cancelButtonText: {
    color: '#344054',
  },
  destructiveButtonText: {
    color: '#D92D20',
  },
});

export default showAlert;
