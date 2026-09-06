import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BackButton, PrimaryButton } from '../components/ui';

const getStatusLabel = (status) => {
  if (status === 'complete') return '작업 후';
  if (status === 'working') return '작업 중';
  return '작업 전';
};

const getStatusColor = (status) => {
  if (status === 'complete') return '#1F9D55';
  if (status === 'working') return '#FACC15';
  return '#E74C3C';
};

export default function ReportListScreen({
  locations = [],
  onBack,
  onSelectLocation,
  onCreateReport,
}) {
  const [selectedIds, setSelectedIds] = useState([]);

  const isReportable = (loc) =>
    loc.status === 'working' || loc.status === 'complete';

  const toggleSelect = (loc) => {
    if (!isReportable(loc)) {
      Alert.alert('선택 불가', '작업 전 방문지는 보고서에 포함할 수 없습니다.');
      return;
    }

    const id = loc.id;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const selectedLocations = locations.filter((loc) =>
    selectedIds.includes(loc.id)
  );

  const handleCreateReport = () => {
    if (selectedLocations.length === 0) {
      Alert.alert('선택 필요', '보고서에 포함할 방문지를 선택하세요.');
      return;
    }

    onCreateReport?.(selectedLocations);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>FIELD REPORT</Text>
          <Text style={styles.title}>보고서 작성</Text>
          <Text style={styles.desc}>
            작업 중 또는 작업 후 방문지만 보고서에 포함할 수 있습니다
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {locations.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={36} color="#8A98A8" />
            <Text style={styles.emptyTitle}>등록된 방문지가 없습니다</Text>
            <Text style={styles.emptyDesc}>
              지도에서 방문지를 먼저 추가해주세요.
            </Text>
          </View>
        ) : (
          locations.map((loc, index) => {
            const reportable = isReportable(loc);
            const checked = selectedIds.includes(loc.id);

            return (
              <View
                key={loc.id ?? index}
                style={[
                  styles.item,
                ]}
              >
                <TouchableOpacity
                  style={styles.checkArea}
                  onPress={() => toggleSelect(loc)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.checkBox,
                      checked && styles.checkBoxActive,
                      !reportable && styles.checkBoxDisabled,
                    ]}
                  >
                    {checked && (
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.itemMain}
                  activeOpacity={0.85}
                  onPress={() => onSelectLocation?.(loc)}
                >
                  <View
                    style={[
                      styles.noBox,
                      { backgroundColor: getStatusColor(loc.status) },
                    ]}
                  >
                    <Text style={styles.noText}>{index + 1}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {loc.detailAddress || loc.roadAddress || '이름 없음'}
                    </Text>

                    <Text style={styles.itemAddr} numberOfLines={1}>
                      {loc.roadAddress || '주소 없음'}
                    </Text>

                    <View style={styles.statusRow}>
                      <Text
                        style={[
                          styles.statusBadge,
                          { color: getStatusColor(loc.status) },
                        ]}
                      >
                        {getStatusLabel(loc.status)}
                      </Text>

                      {!reportable && (
                        <Text style={styles.disabledText}>
                          보고서 포함 불가
                        </Text>
                      )}
                    </View>
                  </View>

                  <Ionicons
                    name="create-outline"
                    size={20}
                    color="#607086"
                  />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Text style={styles.selectedText}>
          선택 {selectedLocations.length}건
        </Text>

        <PrimaryButton
          title="선택한 방문지로 보고서 만들기"
          onPress={handleCreateReport}
          disabled={selectedLocations.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7FA',
  },

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
    gap: 12,
    paddingBottom: 120,
  },

  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D9E1EA',
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  emptyDesc: {
    marginTop: 6,
    fontSize: 11,
    color: '#718096',
  },

  item: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D9E1EA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  checkArea: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#12395B',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  checkBoxActive: {
    backgroundColor: '#12395B',
  },

  checkBoxDisabled: {
    borderColor: '#A0AEC0',
    backgroundColor: '#EDF2F7',
  },

  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  noBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  noText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  itemTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1F2D3D',
  },

  itemAddr: {
    marginTop: 4,
    fontSize: 11,
    color: '#607086',
  },

  statusRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 5,
  },

  statusBadge: {
    fontSize: 11,
    fontWeight: '900',
  },

  disabledText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E74C3C',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#D9E1EA',
  },

  selectedText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#12395B',
    marginBottom: 10,
  },
});