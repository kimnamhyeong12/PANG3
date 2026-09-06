import React, { useRef, useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
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
    if (!transcript || committedRef.current) return;

    committedRef.current = true;
    const current = String(valueRef.current || '').trimEnd();
    const next = current ? `${current} ${transcript}` : transcript;
    valueRef.current = next;
    onChangeText(next);
  };

  useSpeechRecognitionEvent('start', () => {
    if (!activeRef.current) return;
    setRecording(true);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!activeRef.current) return;

    const transcript = event?.results?.[0]?.transcript || '';
    if (transcript.trim()) {
      latestTranscriptRef.current = transcript;
    }

    if (event?.isFinal && transcript.trim()) {
      appendTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (!activeRef.current) return;

    // 일부 Android 기기는 사용자가 종료 버튼을 누른 직후 final 결과를 놓칠 수 있어
    // 마지막 interim 결과가 있으면 그것을 사용한다.
    appendTranscript(latestTranscriptRef.current);
    activeRef.current = false;
    setRecording(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!activeRef.current) return;

    const errorCode = event?.error || 'unknown';
    const message = event?.message || '';

    // 사용자가 직접 중단했을 때 발생할 수 있는 aborted/client는 마지막 인식 결과를 살린다.
    if (errorCode === 'aborted' || errorCode === 'client') {
      appendTranscript(latestTranscriptRef.current);
    } else if (errorCode !== 'no-speech' && errorCode !== 'speech-timeout') {
      Alert.alert('음성 입력', message || `음성 인식 오류: ${errorCode}`);
    }

    activeRef.current = false;
    setRecording(false);
  });

  const startRecognition = async () => {
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert(
          '음성 입력',
          '이 기기에서 음성 인식 서비스를 사용할 수 없습니다. Google 음성 인식 서비스가 활성화되어 있는지 확인해 주세요.'
        );
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('마이크 권한 필요', '음성 입력을 사용하려면 마이크 권한을 허용해 주세요.');
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
      Alert.alert('음성 입력', error?.message || '음성 인식을 시작하지 못했습니다.');
    }
  };

  const stopRecognition = () => {
    if (!activeRef.current) return;
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
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        style={inputStyle}
      />

      <TouchableOpacity
        style={[styles.voiceButton, recording && styles.voiceButtonRecording]}
        onPress={handleVoicePress}
      >
        <Text style={styles.voiceButtonText}>
          {recording ? '■ 음성 입력 종료' : '🎙 음성으로 입력'}
        </Text>
      </TouchableOpacity>

      {recording && (
        <Text style={styles.recordingGuide}>
          말씀을 마치면 자동으로 인식이 종료됩니다. 버튼을 눌러 직접 종료할 수도 있습니다.
        </Text>
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
