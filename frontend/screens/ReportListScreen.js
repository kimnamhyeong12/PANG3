import { showAlert } from '../components/CustomAlert';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
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

const getTaskId = (loc) =>
  loc?.id ??
  loc?.taskId ??
  loc?.task_id ??
  null;

const getGroupId = (loc) =>
  loc?.groupId ??
  loc?.group_id ??
  loc?.group?.groupId ??
  null;

const getGroupName = (loc, activeGroup, assignment) =>
  loc?.groupName ||
  loc?.group_name ||
  loc?.group?.groupName ||
  assignment?.groupName ||
  activeGroup?.groupName ||
  '팀';

export default function ReportListScreen({
  locations = [],
  loading = false,
  user,
  activeGroup,
  groupAssignments = [],
  onBack,
  onSelectLocation,
  onCreateReport,
}) {
  const [selectedIds, setSelectedIds] = useState([]);

  const assignmentMap = new Map(
    groupAssignments.map((item) => [Number(item.taskId), item])
  );

  const isReportable = (loc) =>
    loc.status === 'working' || loc.status === 'complete';

  const toggleSelect = (loc) => {
    if (!isReportable(loc)) {
      showAlert(
        '선택 불가',
        '작업 전 방문지는 보고서에 포함할 수 없습니다.'
      );
      return;
    }

    const id = getTaskId(loc);

    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [...prev, id]
    );
  };

  const selectedLocations = locations.filter((loc) =>
    selectedIds.includes(getTaskId(loc))
  );

  const workspaceName = activeGroup?.groupName || user?.name || user?.loginId || '나';

  const handleCreateReport = () => {
    if (selectedLocations.length === 0) {
      showAlert(
        '선택 필요',
        '보고서에 포함할 방문지를 선택하세요.'
      );
      return;
    }

    onCreateReport?.(selectedLocations);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />

        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            FIELD REPORT
          </Text>

          <Text style={styles.title}>
            보고서 작성
          </Text>

          <Text style={styles.desc}>
            작업 중 또는 작업 후 방문지만 보고서에 포함할 수 있습니다
          </Text>

          <Text style={styles.scopeSummary}>
            현재 업무공간 · {workspaceName}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
      >
        {loading ? (
          <View style={styles.emptyBox}>
            <ActivityIndicator size="large" color="#173A5E" />
            <Text style={styles.emptyTitle}>방문지를 불러오는 중입니다</Text>
          </View>
        ) : locations.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons
              name="document-text-outline"
              size={36}
              color="#8A98A8"
            />

            <Text style={styles.emptyTitle}>
              등록된 방문지가 없습니다
            </Text>

            <Text style={styles.emptyDesc}>
              지도에서 방문지를 먼저 추가해주세요.
            </Text>
          </View>
        ) : (
          locations.map((loc, index) => {
            const reportable =
              isReportable(loc);

            const taskId = getTaskId(loc);

            const checked =
              selectedIds.includes(taskId);

            const assignment =
              assignmentMap.get(
                Number(taskId)
              );

            const groupId = getGroupId(loc);

            // groupId가 있으면 확실한 팀 방문지.
            // 오래된 응답에서 groupId가 빠진 경우에는 담당자 배정 정보가 있으면 팀 방문지로 본다.
            const isTeamLocation =
              Boolean(groupId) ||
              Boolean(assignment);

            const groupName = isTeamLocation
              ? getGroupName(
                  loc,
                  activeGroup,
                  assignment
                )
              : null;

            return (
              <View
                key={taskId ?? index}
                style={styles.item}
              >
                <TouchableOpacity
                  style={styles.checkArea}
                  onPress={() =>
                    toggleSelect(loc)
                  }
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.checkBox,
                      checked &&
                        styles.checkBoxActive,
                      !reportable &&
                        styles.checkBoxDisabled,
                    ]}
                  >
                    {checked && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color="#FFFFFF"
                      />
                    )}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.itemMain}
                  activeOpacity={0.85}
                  onPress={() =>
                    onSelectLocation?.(loc)
                  }
                >
                  <View
                    style={[
                      styles.noBox,
                      {
                        backgroundColor:
                          getStatusColor(
                            loc.status
                          ),
                      },
                    ]}
                  >
                    <Text style={styles.noText}>
                      {index + 1}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={styles.itemTitle}
                      numberOfLines={1}
                    >
                      {loc.detailAddress ||
                        loc.roadAddress ||
                        '이름 없음'}
                    </Text>

                    <View style={styles.scopeRow}>
                      <View
                        style={[
                          styles.scopeBadge,
                          isTeamLocation
                            ? styles.teamScopeBadge
                            : styles.personalScopeBadge,
                        ]}
                      >
                        <Ionicons
                          name={
                            isTeamLocation
                              ? 'people'
                              : 'person'
                          }
                          size={11}
                          color={
                            isTeamLocation
                              ? '#12395B'
                              : '#475569'
                          }
                        />

                        <Text
                          style={[
                            styles.scopeBadgeText,
                            isTeamLocation
                              ? styles.teamScopeText
                              : styles.personalScopeText,
                          ]}
                          numberOfLines={1}
                        >
                          {isTeamLocation
                            ? `팀 · ${groupName}`
                            : `1인 · ${workspaceName}`}
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={styles.itemAddr}
                      numberOfLines={1}
                    >
                      {loc.roadAddress ||
                        '주소 없음'}
                    </Text>

                    {isTeamLocation && (
                      <View
                        style={styles.assigneeRow}
                      >
                        <Ionicons
                          name="person-outline"
                          size={12}
                          color="#12395B"
                        />

                        <Text
                          style={[
                            styles.assigneeText,
                            !assignment &&
                              styles.assigneeEmpty,
                          ]}
                        >
                          {assignment
                            ? `담당자: ${
                                assignment.assigneeName ||
                                assignment.assigneeLoginId
                              }`
                            : '담당자 미지정'}
                        </Text>
                      </View>
                    )}

                    <View style={styles.statusRow}>
                      <Text
                        style={[
                          styles.statusBadge,
                          {
                            color:
                              getStatusColor(
                                loc.status
                              ),
                          },
                        ]}
                      >
                        {getStatusLabel(
                          loc.status
                        )}
                      </Text>

                      {!reportable && (
                        <Text
                          style={
                            styles.disabledText
                          }
                        >
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
          disabled={
            selectedLocations.length === 0
          }
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

    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 34,

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

  scopeSummary: {
    marginTop: 5,
    fontSize: 10,
    fontWeight: '800',
    color: '#12395B',
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

  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },

  scopeBadge: {
    maxWidth: '100%',
    minHeight: 25,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },

  teamScopeBadge: {
    backgroundColor: '#EAF1F7',
    borderColor: '#C7D7E6',
  },

  personalScopeBadge: {
    backgroundColor: '#F1F5F9',
    borderColor: '#D7DEE7',
  },

  scopeBadgeText: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '900',
  },

  teamScopeText: {
    color: '#12395B',
  },

  personalScopeText: {
    color: '#475569',
  },

  itemAddr: {
    marginTop: 5,
    fontSize: 11,
    color: '#607086',
  },

  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },

  assigneeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#12395B',
  },

  assigneeEmpty: {
    color: '#E67E22',
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

    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 60,

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
