import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { resolveApiUrl } from '../utils/api';
import useLiveRevision from '../utils/useLiveRevision';
import { emptyProjectFilters, filterProjectRecords, isCompletedRecord, recordDay, selectionChanged, toggleProjectSelection } from '../utils/projectWorkflow';
import { createProjectReport, fetchCompiledReport, fetchProjectGroupReports, fetchReportVersions, finalizeCompiledReport, replaceReportItems, reviseCompiledReport, updateCompiledReport, updateReportItem } from '../utils/projectApi';
import { EmptyState } from './ui';
import ProtectedImage from './ProtectedImage';
import { showAlert } from './CustomAlert';
import CompiledReportViewScreen from '../screens/CompiledReportViewScreen';
import ProjectReportMap from './ProjectReportMap';
import { ProjectFilters, ProjectModal, ProjectError, ProjectLoading, ProjectCheckRow, PrimaryButton, SecondaryButton, projectStyles as s } from './ProjectNativeUI';

export default function ProjectReportWorkspace({ project, tasks, userId, reportId, onClose, onOpenReport, onChanged, onDirtyChange, onEditReport }) {
  const [rows, setRows] = useState(null), [document, setDocument] = useState(null);
  const [selected, setSelected] = useState(new Set()), [initial, setInitial] = useState(new Set());
  const [title, setTitle] = useState(''), [filters, setFilters] = useState(emptyProjectFilters), [outside, setOutside] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState(false), [versions, setVersions] = useState(null);
  const mounted = useRef(true), lock = useRef(false);
  const changed = selectionChanged(selected, initial);
  const nameChanged = title !== (document?.report?.title || '');
  const dirty = busy || changed || nameChanged;
  const liveRevision = useLiveRevision(['projects', 'reports', 'tasks'], { dirty });
  const readonly = project.status === 'ARCHIVED' || document?.report?.status === 'FINAL';
  const linked = useMemo(() => new Set(tasks.map(row => String(row.taskId))), [tasks]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    let active = true; setError('');
    Promise.all([fetchProjectGroupReports(project.groupId, userId), reportId ? fetchCompiledReport(reportId, userId) : null]).then(([all, value]) => {
      if (!active) return;
      setRows(all.filter(isCompletedRecord)); setDocument(value); setTitle(value?.report?.title || '');
      const ids = new Set((value?.sections || []).flatMap(section => section.items || []).map(item => String(item.progressId)));
      setSelected(ids); setInitial(ids);
    }).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [project.projectId, project.groupId, userId, reportId, retry, liveRevision]);
  const pool = useMemo(() => (rows || []).filter(row => outside ? !linked.has(String(row.taskId)) : linked.has(String(row.taskId))), [rows, linked, outside]);
  const visible = filterProjectRecords(pool, filters);
  const items = (document?.sections || []).flatMap(section => section.items || []);
  const act = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (e) { if (mounted.current) setError(e.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const refresh = () => { if (mounted.current) { setRetry(n => n + 1); onChanged(); } };
  const saveSelection = () => act(async () => {
    const ids = [...selected].map(Number);
    if (reportId) {
      let expectedUpdatedAt = document.report.updatedAt;
      if (nameChanged) {
        const renamed = await updateCompiledReport(reportId, userId, { title: title.trim() });
        expectedUpdatedAt = renamed.updatedAt;
      }
      await replaceReportItems(reportId, userId, ids, expectedUpdatedAt);
      if (mounted.current) { setInitial(new Set(selected)); refresh(); }
    } else {
      const result = await createProjectReport(project.projectId, userId, title.trim(), ids);
      if (mounted.current) { onChanged(); onOpenReport(result.reportId); }
    }
  });
  const close = () => {
    if (busy) return;
    if (changed || nameChanged) showAlert('보고서 닫기', '저장하지 않은 선택과 이름 변경을 취소할까요?', [{ text: '계속 작성', style: 'cancel' }, { text: '닫기', onPress: onClose }]);
    else onClose();
  };
  const move = (index, delta) => act(async () => {
    const reordered = [...items]; [reordered[index], reordered[index + delta]] = [reordered[index + delta], reordered[index]];
    try {
      for (let i = 0; i < reordered.length; i++) if (reordered[i].sortOrder !== i) await updateReportItem(reportId, userId, reordered[i].progressId, { sortOrder: i });
    } finally { refresh(); }
  });
  const canAct = !busy && !changed && !nameChanged;
  return <View style={s.panel}>
    <View style={s.heading}><Text style={s.headingText}>{reportId ? '건별 보고서' : '새 통합보고서'}</Text><TouchableOpacity disabled={busy} style={s.icon} accessibilityLabel="보고서 접기" onPress={close}><Ionicons name="chevron-up" size={20} color={colors.textSoft}/></TouchableOpacity></View>
    <ProjectError message={error} onRetry={!rows ? () => setRetry(n => n + 1) : undefined}/>
    {!rows ? !error && <ProjectLoading/> : <>
      <Text style={s.label}>보고서 이름</Text>
      <TextInput accessibilityLabel="통합보고서 이름" style={s.input} value={title} onChangeText={setTitle} placeholder="보고서 이름을 입력해 주세요." maxLength={200} editable={!readonly && !busy}/>
      {reportId && nameChanged && !changed && <SecondaryButton title="이름 저장" disabled={busy || !title.trim()} onPress={() => act(async () => { await updateCompiledReport(reportId, userId, { title: title.trim() }); refresh(); })}/>}
      <ProjectFilters rows={pool} value={filters} onChange={setFilters} disabled={busy}/>
      <View style={[s.heading, { justifyContent: 'space-between' }]}><SecondaryButton style={{ flex: 1 }} title={outside ? '프로젝트 내 업무 추가' : '프로젝트 외 업무 추가'} onPress={() => setOutside(value => !value)} disabled={busy}/>
      {!readonly && !!visible.length && <SecondaryButton style={{ flex: 1 }} title={visible.every(row => selected.has(String(row.progressId))) ? '전체 선택 해제' : '전체 선택'} disabled={busy} onPress={() => setSelected(prev => toggleProjectSelection(prev, visible.map(row => row.progressId), !visible.every(row => prev.has(String(row.progressId)))))}/>}
      </View>
      {visible.map(row => <ProjectCheckRow key={row.progressId} row={row} record checked={selected.has(String(row.progressId))} disabled={readonly || busy} onPress={() => setSelected(prev => toggleProjectSelection(prev, [row.progressId], !prev.has(String(row.progressId))))}/>)}
      {!visible.length && <EmptyState title="조건에 맞는 완료 기록이 없어요"/>}
      {!readonly && <PrimaryButton title={busy ? '저장 중…' : reportId ? `${selected.size}건 선택 적용` : `${selected.size}건으로 보고서 만들기`} disabled={busy || !selected.size || !title.trim() || (reportId && !changed)} onPress={saveSelection}/>}
    </>}
    {document && <>
      <View style={s.heading}><Text style={s.headingText}>통합보고서</Text><Text style={s.meta}>{readonly ? '확정' : '작성 중'} v{document.report.version || 1}</Text></View>
      <ProjectReportMap items={items}/>
      <Text style={s.meta}>작성날짜 {recordDay(document.report.createdAt)} · 총 {items.length}건</Text>
      <View style={[s.heading, { flexWrap: 'wrap' }]}>
        <SecondaryButton title="미리보기 · 다운로드" icon="document-text-outline" disabled={!canAct} onPress={() => setPreview(true)}/>
        <SecondaryButton title="이전 버전" disabled={!canAct} onPress={() => act(async () => { const list = await fetchReportVersions(reportId, userId); if (mounted.current) setVersions(list); })}/>
      </View>
      {project.status !== 'ARCHIVED' && (readonly
        ? <SecondaryButton title="수정본 만들기" disabled={!canAct} onPress={() => act(async () => { const result = await reviseCompiledReport(reportId, userId); if (mounted.current) { onChanged(); onOpenReport(result.reportId); } })}/>
        : <PrimaryButton title="확정하기" disabled={!canAct || !items.length} onPress={() => showAlert('보고서 확정', '현재 내용으로 확정합니다. 이후 변경은 새 버전에서 할 수 있습니다.', [{ text: '취소', style: 'cancel' }, { text: '확정하기', onPress: () => act(async () => { await finalizeCompiledReport(reportId, userId); refresh(); }) }])}/>)}
      {items.map((item, index) => <View key={item.progressId} style={[s.panel, { padding: 12, backgroundColor: colors.surfaceMuted }]}>
        <View style={s.heading}><Text style={s.headingText}>{index + 1}. {item.title}</Text>
          {!readonly && <><TouchableOpacity disabled={!canAct || index === 0} style={s.icon} accessibilityLabel={`${item.title} 위로`} onPress={() => move(index, -1)}><Ionicons name="chevron-up" color={index ? colors.primary : colors.textFaint} size={18}/></TouchableOpacity>
            <TouchableOpacity disabled={!canAct || index === items.length - 1} style={s.icon} accessibilityLabel={`${item.title} 아래로`} onPress={() => move(index, 1)}><Ionicons name="chevron-down" color={index < items.length - 1 ? colors.primary : colors.textFaint} size={18}/></TouchableOpacity></>}
        </View><Text style={s.meta}>{[item.address, item.author?.name].filter(Boolean).join(' · ')}</Text>
        {!!item.locationMapImage && <ProtectedImage source={{ uri: resolveApiUrl(item.locationMapImage) }} style={{ width: '100%', height: 170, borderRadius: 10 }} resizeMode="contain"/>}
        {!!item.photos?.length && <View style={{ flexDirection: 'row', gap: 6 }}>{item.photos.map((photo, photoIndex) => <View key={`${photo.index ?? photoIndex}:${photo.url}`} style={{ flex: 1, minWidth: 0, gap: 5 }}><ProtectedImage source={{ uri: resolveApiUrl(photo.url) }} style={{ width: '100%', aspectRatio: 0.8, borderRadius: 8 }} resizeMode="cover"/><Text style={[s.meta, { textAlign: 'center' }]}>{photo.slot}</Text></View>)}</View>}
        <Text style={s.label}>본문</Text><Text style={[s.meta, { color: colors.text }]}>{item.comment || '-'}</Text>
        {!readonly && <SecondaryButton title="보기 · 수정" disabled={!canAct} onPress={() => onEditReport?.({ ...(rows || []).find(row => String(row.progressId) === String(item.progressId)), taskId: item.taskId, progressId: item.progressId, reportName: item.title, latitude: item.lat, longitude: item.lng, roadAddress: item.address })}/>}
      </View>)}
    </>}
    {preview && <Modal visible animationType="slide" onRequestClose={() => setPreview(false)}><CompiledReportViewScreen user={{ userId }} reportId={reportId} title={document.report.title} onBack={() => setPreview(false)}/></Modal>}
    {versions && <ProjectModal title="이전 버전" onClose={() => setVersions(null)}>{versions.map(version => <TouchableOpacity style={s.row} key={version.reportId} onPress={() => { setVersions(null); onOpenReport(version.reportId); }}><View style={s.grow}><Text style={s.name}>{version.title}</Text><Text style={s.meta}>v{version.version} · {version.status === 'FINAL' ? '확정' : '작성 중'}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.primary}/></TouchableOpacity>)}</ProjectModal>}
  </View>;
}
