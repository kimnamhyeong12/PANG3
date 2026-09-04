import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { API_BASE_URL } from '../utils/api';

const SILENCE_TIMEOUT_MS = 5000;
const METERING_THRESHOLD_DB = -45;

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export default function VoiceTextInput({
  value,
  onChangeText,
  inputStyle,
  multiline = true,
  placeholder,
}) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 200);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const recordingRef = useRef(false);
  const transcribingRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const autoStopStartedRef = useRef(false);

  const setRecordingState = (next) => {
    recordingRef.current = next;
    setRecording(next);
  };

  const setTranscribingState = (next) => {
    transcribingRef.current = next;
    setTranscribing(next);
  };

  const startRecording = async () => {
    try {
      if (!API_BASE_URL) {
        Alert.alert('음성 입력', '서버 주소가 설정되어 있지 않습니다.');
        return;
      }

      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('마이크 권한 필요', '음성 입력을 사용하려면 마이크 권한을 허용해 주세요.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();

      lastVoiceAtRef.current = Date.now();
      autoStopStartedRef.current = false;
      setRecordingState(true);
    } catch (error) {
      console.log('음성 녹음 시작 실패:', error);
      Alert.alert('음성 입력', '녹음을 시작하지 못했습니다.');
    }
  };

  const stopAndTranscribe = async ({ automatic = false } = {}) => {
    if (!recordingRef.current || transcribingRef.current || autoStopStartedRef.current) {
      return;
    }

    autoStopStartedRef.current = true;
    setRecordingState(false);
    setTranscribingState(true);

    try {
      await recorder.stop();

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('녹음 파일을 찾을 수 없습니다.');
      }

      const form = new FormData();
      form.append('audio', {
        uri,
        name: 'voice.m4a',
        type: 'audio/mp4',
      });

      const response = await fetch(`${API_BASE_URL}/api/speech/transcribe`, {
        method: 'POST',
        body: form,
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch (_) {
        data = {};
      }

      if (response.status === 404) {
        throw new Error('음성 인식 서버가 아직 반영되지 않았습니다. 백엔드 배포 후 다시 시도해 주세요.');
      }

      if (!response.ok || !data?.text) {
        throw new Error(data?.error || rawText || `음성 변환 실패: ${response.status}`);
      }

      const transcript = String(data.text).trim();
      if (!transcript) {
        if (!automatic) {
          Alert.alert('음성 입력', '인식된 음성이 없습니다.');
        }
        return;
      }

      const current = String(value || '').trimEnd();
      onChangeText(current ? `${current} ${transcript}` : transcript);
    } catch (error) {
      console.log('음성 변환 실패:', error);
      Alert.alert('음성 입력', error?.message || '음성을 텍스트로 변환하지 못했습니다.');
    } finally {
      setTranscribingState(false);
      autoStopStartedRef.current = false;
      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch (_) {}
    }
  };

  // 소리가 들어오면 마지막 음성 감지 시점을 갱신하고,
  // 마지막 음성 이후 5초 동안 조용하면 자동으로 녹음을 끝낸다.
  useEffect(() => {
    if (!recordingRef.current || transcribingRef.current) return;

    const metering = recorderState?.metering;
    if (typeof metering === 'number' && metering > METERING_THRESHOLD_DB) {
      lastVoiceAtRef.current = Date.now();
      return;
    }

    if (
      lastVoiceAtRef.current > 0 &&
      Date.now() - lastVoiceAtRef.current >= SILENCE_TIMEOUT_MS
    ) {
      stopAndTranscribe({ automatic: true });
    }
  }, [recorderState?.metering, recorderState?.durationMillis]);

  const handleVoicePress = () => {
    if (transcribingRef.current) return;

    if (recordingRef.current) {
      stopAndTranscribe({ automatic: false });
    } else {
      startRecording();
    }
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        style={inputStyle}
      />

      <TouchableOpacity
        style={[
          styles.voiceButton,
          recording && styles.voiceButtonRecording,
          transcribing && styles.voiceButtonDisabled,
        ]}
        onPress={handleVoicePress}
        disabled={transcribing}
      >
        <Text style={styles.voiceButtonText}>
          {transcribing
            ? '음성 변환 중...'
            : recording
              ? '■ 녹음 종료'
              : '🎙 음성으로 입력'}
        </Text>
      </TouchableOpacity>

      {recording && (
        <Text style={styles.recordingGuide}>말이 끝난 뒤 5초간 조용하면 자동으로 종료됩니다.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  voiceButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#12395B',
  },
  voiceButtonRecording: {
    backgroundColor: '#E74C3C',
  },
  voiceButtonDisabled: {
    opacity: 0.6,
  },
  voiceButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
  },
  recordingGuide: {
    marginTop: 6,
    color: '#607086',
    fontSize: 10,
    fontWeight: '700',
  },
});
