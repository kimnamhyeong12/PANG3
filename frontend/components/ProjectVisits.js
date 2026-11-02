import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from './CustomAlert';
import { EmptyState } from './ui';
import { colors } from '../constants/design';
import { fetchProjectGroupTasks, linkProjectTasks, unlinkProjectTask } from '../utils/projectApi';
import { emptyProjectFilters, filterProjectRecords, toggleProjectSelection } from '../utils/projectWorkflow';
import { ProjectFilters, ProjectModal, ProjectError, ProjectLoading, ProjectStatus, ProjectCheckRow, PrimaryButton, SecondaryButton, projectStyles as s } from './ProjectNativeUI';

export default function ProjectVisits({ project, userId, rows, collapsed, onToggle, onChanged, onDirtyChange, disabled }) {
  const [adding, setAdding] = useState(false), [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(new Set()), [filters, setFilters] = useState(emptyProjectFilters);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirtyChange(adding || busy); return () => onDirtyChange(false); }, [adding, busy, onDirtyChange]);
  useEffect(() => {
    if (!adding) return;
    let active = true; setCandidates(null); setError('');
    fetchProjectGroupTasks(project.groupId, userId).then(list => {
      if (active) setCandidates(list.map(row => ({ ...row, taskId: row.taskId || row.id, createdAt: row.workDate || row.createdAt })));
    }).catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [adding, project.groupId, userId, retry]);
  const available = useMemo(() => {
    const linked = new Set(rows.map(row => String(row.taskId)));
    return (candidates || []).filter(row => !linked.has(String(row.taskId)));
  }, [rows, candidates]);
  const visible = filterProjectRecords(available, filters);
  const act = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); if (mounted.current) { setAdding(false); onChanged(); } }
    catch (e) { if (mounted.current) setError(e.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const archived = project.status === 'ARCHIVED';
  return <View style={s.panel}>
    <View style={s.heading}><Text style={s.headingText}>프로젝트 방문지 <Text style={s.meta}>{rows.length}곳</Text></Text>
      <SecondaryButton title="추가" disabled={disabled || busy || archived} onPress={() => { setSelected(new Set()); setFilters(emptyProjectFilters()); setAdding(true); }}/>
      <TouchableOpacity style={s.icon} onPress={onToggle} accessibilityLabel={`프로젝트 방문지 ${collapsed ? '펼치기' : '접기'}`}><Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={20} color={colors.textSoft}/></TouchableOpacity>
    </View>
    {!adding && <ProjectError message={error}/>}
    {!collapsed && <>{rows.map(row => <View style={s.row} key={row.taskId}><View style={s.grow}><Text style={s.name}>{row.detailAddress || row.roadAddress}</Text><Text style={s.meta}>{row.roadAddress}</Text></View><ProjectStatus row={row}/>
      <TouchableOpacity style={s.icon} disabled={disabled || busy || archived} accessibilityLabel={`${row.detailAddress || row.roadAddress} 프로젝트에서 제외`} onPress={() => showAlert('프로젝트에서 제외', '이 프로젝트의 작성 중 보고서에서도 빠집니다. 원본 방문지·기록과 확정 보고서는 유지됩니다.', [{ text: '취소', style: 'cancel' }, { text: '제외', onPress: () => act(() => unlinkProjectTask(project.projectId, userId, row.taskId)) }])}><Text style={{ color: colors.textSoft, fontSize: 12 }}>제외</Text></TouchableOpacity>
    </View>)}{!rows.length && <EmptyState title="등록된 방문지가 없어요" icon="location-outline"/>}</>}
    {adding && <ProjectModal title="프로젝트 방문지 추가" onClose={() => setAdding(false)} busy={busy} action={<PrimaryButton disabled={busy || !selected.size} title={busy ? '추가 중…' : `${selected.size}개 방문지 추가`} onPress={() => act(() => linkProjectTasks(project.projectId, userId, [...selected]))}/>}>
      <ProjectError message={error} onRetry={!candidates ? () => setRetry(n => n + 1) : undefined}/>
      {!candidates ? !error && <ProjectLoading/> : <><ProjectFilters rows={available} value={filters} onChange={setFilters} disabled={busy}/>
        {visible.map(row => <ProjectCheckRow key={row.taskId} row={row} checked={selected.has(String(row.taskId))} disabled={busy} onPress={() => setSelected(prev => toggleProjectSelection(prev, [row.taskId], !prev.has(String(row.taskId))))}/>)}
        {!visible.length && <EmptyState title="조건에 맞는 방문지가 없어요"/>}</>}
    </ProjectModal>}
  </View>;
}
