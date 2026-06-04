import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { BackButton, PrimaryButton } from '../components/ui';



const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

function getAiRecommendation(memo) {
  const text = memo.toLowerCase();

  if (
    text.includes('배수') ||
    text.includes('토사') ||
    text.includes('침수') ||
    text.includes('악취')
  ) {
    return {
      category: '배수시설 관리',
      risk: '높음',
      riskColor: '#DC2626',
      report:
        '배수구 내 토사 적체로 인해 배수 불량 및 침수 위험이 우려되어 정비 요청이 필요함.',
    };
  }

  if (
    text.includes('파손') ||
    text.includes('균열') ||
    text.includes('전선') ||
    text.includes('부식')
  ) {
    return {
      category: '시설물 안전',
      risk: '높음',
      riskColor: '#DC2626',
      report:
        '시설물 파손 또는 균열이 확인되어 안전조치 및 보수 요청이 필요함.',
    };
  }

  return {
    category: '일반 점검',
    risk: '보통',
    riskColor: '#F39C12',
    report: '현장 점검 결과 특이사항을 기록하고 추후 필요 시 재확인함.',
  };
}

export default function FieldActionScreen({
  location,
  actionType,
  onBack,
  onSave,
}) {
  console.log('현재 location:', location);
  console.log('location.id:', location?.id);
  console.log('location.taskId:', location?.taskId);
  console.log('location.task_id:', location?.task_id);
  const [status, setStatus] = useState(location?.status || 'pending');

  const [latitude, setLatitude] = useState(
    location?.latitude || location?.lat
      ? String(location.latitude ?? location.lat)
      : ''
  );

  const [longitude, setLongitude] = useState(
    location?.longitude || location?.lng
      ? String(location.longitude ?? location.lng)
      : ''
  );

  const [locationMapImage, setLocationMapImage] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [mainComment, setMainComment] = useState('');
  const [fieldMemo, setFieldMemo] = useState('');

  const taskId = location?.id ?? location?.taskId ?? location?.task_id;

  useEffect(() => {
    const loadSavedReport = async () => {
      if (!taskId || !API_BASE_URL) return;

      try {
        console.log('보고서 불러오기 taskId:', taskId);

        const res = await fetch(
          `${API_BASE_URL}/api/task-progress/task/${taskId}`
        );

        if (!res.ok) {
          console.log('보고서 불러오기 실패 status:', res.status);
          return;
        }

        const data = await res.json();

        if (!data) return;

        console.log('저장된 보고서 불러오기 성공:', data);

        setLatitude(
          data.latitude !== null && data.latitude !== undefined
            ? String(data.latitude)
            : ''
        );

        setLongitude(
          data.longitude !== null && data.longitude !== undefined
            ? String(data.longitude)
            : ''
        );

        setLocationMapImage(data.locationMapImage || null);
        setPhotos(data.fieldPhotos || []);
        setMainComment(data.mainComment || '');
        setFieldMemo(data.fieldMemo || '');
        setStatus(data.progressStatus || location?.status || 'pending');
      } catch (error) {
        console.log('저장된 보고서 불러오기 실패:', error);
      }
    };

    loadSavedReport();
  }, [taskId]);

  const rec = getAiRecommendation(`${mainComment} ${fieldMemo}`);

  const pickLocationMapImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
    });

    if (!result.canceled) {
      setLocationMapImage(result.assets[0].uri);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });

    if (!result.canceled) {
      const newPhoto = {
        uri: result.assets[0].uri,
        comment: '',
      };

      setPhotos([...photos, newPhoto]);
    }
  };

  const retakePhoto = async (index) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });

    if (!result.canceled) {
      const nextPhotos = [...photos];

      nextPhotos[index] = {
        ...nextPhotos[index],
        uri: result.assets[0].uri,
      };

      setPhotos(nextPhotos);
    }
  };

  const deletePhoto = (index) => {
    const nextPhotos = photos.filter((_, i) => i !== index);
    setPhotos(nextPhotos);
  };

  const updatePhotoComment = (index, text) => {
    const nextPhotos = [...photos];
    nextPhotos[index].comment = text;
    setPhotos(nextPhotos);
  };

  const handleSave = async () => {
    try {
      if (!taskId) {
        alert('방문지 ID를 찾을 수 없습니다.');
        return;
      }

      const reportData = {
        taskId,

        latitude: Number(latitude),
        longitude: Number(longitude),

        locationMapImage,
        fieldPhotos: photos,

        mainComment,
        fieldMemo,

        progressStatus: status,
      };

      console.log('보고서 저장 요청:', reportData);

      const res = await fetch(`${API_BASE_URL}/api/task-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportData),
      });

      if (!res.ok) {
        throw new Error(`보고서 저장 실패: ${res.status}`);
      }

      const savedReport = await res.json();

      console.log('보고서 저장 성공:', savedReport);

      onSave?.(savedReport);
    } catch (error) {
      console.log(error);
      alert('보고서 저장 중 문제가 발생했습니다.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>FIELD RECORD</Text>
          <Text style={styles.title}>
            {location?.detailAddress || location?.name || '방문지 기록'}
          </Text>
          <Text style={styles.desc}>
            {location?.roadAddress || location?.address || ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>업무 유형</Text>
          <Text style={styles.typeText}>
            {actionType === 'report'
              ? '보고서 작성'
              : actionType === 'photo'
              ? '사진 기록'
              : actionType === 'memo'
              ? '메모 작성'
              : '상태 변경'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>위도 / 경도 수정</Text>

          <Text style={styles.inputLabel}>위도</Text>
          <TextInput
            value={latitude}
            onChangeText={setLatitude}
            placeholder="예: 35.116234"
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.inputLabel}>경도</Text>
          <TextInput
            value={longitude}
            onChangeText={setLongitude}
            placeholder="예: 128.968123"
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.guideText}>
            입력한 위도/경도는 보고서 저장 시 반영됩니다.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>위치도 사진</Text>

          {locationMapImage ? (
            <Image
              source={{ uri: locationMapImage }}
              style={styles.locationMapImage}
            />
          ) : (
            <View style={styles.photoEmpty}>
              <Text style={styles.photoEmptyText}>등록된 위치도 없음</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={pickLocationMapImage}
          >
            <Text style={styles.secondaryText}>위치도 사진 업로드</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>현장 사진</Text>

          {photos.length === 0 ? (
            <TouchableOpacity style={styles.photoEmpty} onPress={pickImage}>
              <Text style={styles.photoEmptyText}>촬영된 사진 없음</Text>
            </TouchableOpacity>
          ) : (
            photos.map((item, index) => (
              <View key={index} style={styles.photoItem}>
                <Image source={{ uri: item.uri }} style={styles.photo} />

                <View style={styles.photoButtonRow}>
                  <TouchableOpacity
                    style={styles.photoSmallButton}
                    onPress={() => retakePhoto(index)}
                  >
                    <Text style={styles.photoSmallButtonText}>다시찍기</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.photoSmallButton, styles.deleteButton]}
                    onPress={() => deletePhoto(index)}
                  >
                    <Text style={styles.photoSmallButtonText}>삭제</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={item.comment}
                  onChangeText={(text) => updatePhotoComment(index, text)}
                  placeholder={`현장 사진 ${index + 1} 설명 입력`}
                  style={styles.photoMemo}
                  multiline
                />
              </View>
            ))
          )}

          <TouchableOpacity style={styles.addPhotoBox} onPress={pickImage}>
            <Text style={styles.addPhotoPlus}>＋</Text>
            <Text style={styles.addPhotoText}>사진 추가</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>종합 의견</Text>
          <TextInput
            value={mainComment}
            onChangeText={setMainComment}
            multiline
            placeholder="예: 23:00(현행) → 24:00(변경) 소등시간 연장"
            style={styles.memo}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>현장 메모</Text>
          <TextInput
            value={fieldMemo}
            onChangeText={setFieldMemo}
            multiline
            placeholder="예: 담당자 확인 필요, 추가 점검 예정, 민원인 요청사항 등"
            style={styles.memo}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>처리 상태</Text>

          <View style={styles.statusRow}>
            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'pending' && styles.statusActive,
              ]}
              onPress={() => setStatus('pending')}
            >
              <Text
                style={[
                  styles.statusText,
                  status === 'pending' && styles.statusTextActive,
                ]}
              >
                미작업
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'working' && styles.statusActive,
              ]}
              onPress={() => setStatus('working')}
            >
              <Text
                style={[
                  styles.statusText,
                  status === 'working' && styles.statusTextActive,
                ]}
              >
                작업중
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusBtn,
                status === 'complete' && styles.statusActive,
              ]}
              onPress={() => setStatus('complete')}
            >
              <Text
                style={[
                  styles.statusText,
                  status === 'complete' && styles.statusTextActive,
                ]}
              >
                작업완료
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.aiCard}>
          <Text style={styles.aiEyebrow}>AI RECOMMENDATION</Text>
          <Text style={styles.aiTitle}>{rec.category}</Text>
          <Text style={[styles.risk, { color: rec.riskColor }]}>
            위험도: {rec.risk}
          </Text>
          <Text style={styles.aiReport}>{rec.report}</Text>
        </View>

        <PrimaryButton title="보고서 저장" onPress={handleSave} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F7FA' },

  header: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#D9E1EA',
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#607086',
    letterSpacing: 1.6,
  },

  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  desc: {
    fontSize: 10,
    color: '#718096',
  },

  body: {
    padding: 16,
    gap: 14,
    paddingBottom: 30,
  },

  card: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  cardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#607086',
    marginBottom: 10,
  },

  typeText: {
    color: '#12395B',
    fontSize: 16,
    fontWeight: '900',
  },

  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#607086',
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: '#D9E1EA',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    marginBottom: 10,
    color: '#1F2D3D',
  },

  guideText: {
    fontSize: 10,
    color: '#718096',
    marginTop: 2,
  },

  locationMapImage: {
    height: 210,
    borderRadius: 14,
    marginBottom: 10,
  },

  photoEmpty: {
    height: 150,
    borderRadius: 14,
    backgroundColor: '#EAF1F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },

  photoEmptyText: {
    fontSize: 11,
    color: '#718096',
    fontWeight: '800',
  },

  photoItem: {
    marginBottom: 14,
  },

  photo: {
    height: 180,
    borderRadius: 14,
    marginBottom: 8,
  },

  photoMemo: {
    minHeight: 70,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    padding: 10,
    textAlignVertical: 'top',
    fontSize: 12,
  },

  photoButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  photoSmallButton: {
    flex: 1,
    backgroundColor: '#12395B',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },

  deleteButton: {
    backgroundColor: '#E74C3C',
  },

  photoSmallButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
  },

  addPhotoBox: {
    height: 70,
    borderRadius: 14,
    backgroundColor: '#F8FBFD',
    borderWidth: 1,
    borderColor: '#D9E1EA',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  addPhotoPlus: {
    fontSize: 24,
    fontWeight: '900',
    color: '#12395B',
  },

  addPhotoText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#607086',
  },

  secondaryButton: {
    backgroundColor: '#12395B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },

  secondaryText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },

  memo: {
    minHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    padding: 12,
    textAlignVertical: 'top',
    fontSize: 13,
  },

  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },

  statusBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    paddingVertical: 13,
    alignItems: 'center',
  },

  statusActive: {
    backgroundColor: '#12395B',
    borderColor: '#12395B',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#607086',
  },

  statusTextActive: {
    color: 'white',
  },

  aiCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },

  aiEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#C2410C',
    letterSpacing: 1.4,
  },

  aiTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
    marginTop: 6,
  },

  risk: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },

  aiReport: {
    fontSize: 11,
    lineHeight: 18,
    color: '#607086',
    marginTop: 8,
  },
});