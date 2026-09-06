import React, { useRef, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export default function VoiceTextInput({
  value,
  onChangeText,
  inputStyle,
  multiline = true,
  placeholder,
}) {
  const [recording, setRecording] = useState(false);

  const activeRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const committedRef = useRef(false);
  const valueRef = useRef(value || '');

  valueRef.current = value || '';

  const appendTranscript = (text) => {
    const transcript = String(text || '').trim();

    if (!transcript || committedRef.current) {
      return;
    }

    committedRef.current = true;

    const current = String(valueRef.current || '').trimEnd();

    const next = current
      ? `${current} ${transcript}`
      : transcript;

    valueRef.current = next;
    onChangeText(next);
  };

  useSpeechRecognitionEvent('start', () => {
    if (!activeRef.current) {
      return;
    }

    setRecording(true);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) {
      return;
    }

    const transcript =
      event?.results?.[0]?.transcript || '';

    if (transcript.trim()) {
      latestTranscriptRef.current = transcript;
    }

    if (event?.isFinal && transcript.trim()) {
      appendTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (!activeRef.current) {
      return;
    }

    // 일부 Android 기기는 사용자가 종료 버튼을 누른 직후
    // final 결과를 놓칠 수 있어서 마지막 interim 결과를 사용한다.
    appendTranscript(latestTranscriptRef.current);

    activeRef.current = false;
    setRecording(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) {
      return;
    }

    const errorCode = event?.error || 'unknown';
    const message = event?.message || '';

    // 사용자가 직접 중단했을 때 발생할 수 있는
    // aborted/client는 마지막 인식 결과를 살린다.
    if (
      errorCode === 'aborted' ||
      errorCode === 'client'
    ) {
      appendTranscript(latestTranscriptRef.current);
    } else if (
      errorCode !== 'no-speech' &&
      errorCode !== 'speech-timeout'
    ) {
      Alert.alert(
        '음성 입력',
        message || `음성 인식 오류: ${errorCode}`
      );
    }

    activeRef.current = false;
    setRecording(false);
  });

  const startRecognition = async () => {
    try {
      if (
        !ExpoSpeechRecognitionModule.isRecognitionAvailable()
      ) {
        Alert.alert(
          '음성 입력',
          '이 기기에서 음성 인식 서비스를 사용할 수 없습니다. Google 음성 인식 서비스가 활성화되어 있는지 확인해 주세요.'
        );
        return;
      }

      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '마이크 권한 필요',
          '음성 입력을 사용하려면 마이크 권한을 허용해 주세요.'
        );
        return;
      }

      latestTranscriptRef.current = '';
      committedRef.current = false;
      activeRef.current = true;

      setRecording(true);

      ExpoSpeechRecognitionModule.start({
        lang: 'ko-KR',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (error) {
      activeRef.current = false;
      setRecording(false);

      console.log('음성 인식 시작 실패:', error);

      Alert.alert(
        '음성 입력',
        error?.message || '음성 인식을 시작하지 못했습니다.'
      );
    }
  };

  const stopRecognition = () => {
    if (!activeRef.current) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      appendTranscript(latestTranscriptRef.current);

      activeRef.current = false;
      setRecording(false);
    }
  };

  const handleVoicePress = () => {
    if (recording) {
      stopRecognition();
    } else {
      startRecognition();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor="#9AA7B5"
          style={[
            inputStyle,
            styles.inputWithVoiceButton,
          ]}
        />

        <TouchableOpacity
          style={[
            styles.voiceButton,
            recording && styles.voiceButtonRecording,
          ]}
          onPress={handleVoicePress}
          activeOpacity={0.7}
        >
          <Ionicons
            name={recording ? 'stop' : 'mic-outline'}
            size={20}
            color={recording ? '#FFFFFF' : '#12395B'}
          />
        </TouchableOpacity>
      </View>

      {recording && (
        <View style={styles.recordingStatus}>
          <View style={styles.recordingDot} />

          <Text style={styles.recordingGuide}>
            음성 입력 중
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  inputWrapper: {
    position: 'relative',
    width: '100%',
  },

  /*
   * 마이크 버튼이 입력 내용을 가리지 않도록
   * 오른쪽 여백을 확보한다.
   */
  inputWithVoiceButton: {
    paddingRight: 52,
  },

  /*
   * 평상시 마이크 버튼
   */
  voiceButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,

    width: 36,
    height: 36,

    borderRadius: 18,

    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#EEF3F7',

    borderWidth: 1,
    borderColor: '#D8E1E8',
  },

  /*
   * 음성 입력 중
   */
  voiceButtonRecording: {
    backgroundColor: '#E74C3C',
    borderColor: '#E74C3C',
  },

  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',

    marginTop: 6,
    marginLeft: 2,
  },

  recordingDot: {
    width: 6,
    height: 6,

    borderRadius: 3,

    backgroundColor: '#E74C3C',

    marginRight: 6,
  },

  recordingGuide: {
    color: '#718096',
    fontSize: 10,
    fontWeight: '700',
  },
});