import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useLiveRevision from '../utils/useLiveRevision';
import { useScreenBackHandler } from '../utils/screenBack';
import { createProject, deleteProject, fetchProject, fetchProjectReports, fetchProjects, fetchProjectTasks, updateProject } from '../utils/projectApi';
import { recordDay } from '../utils/projectWorkflow';
import { colors } from '../constants/design';
import { EmptyState, ScreenHeader } from '../components/ui';
import { showAlert } from '../components/CustomAlert';
import ProjectVisits from '../components/ProjectVisits';
import ProjectReportWorkspace from '../components/ProjectReportWorkspace';
import { ProjectError, ProjectLoading, PrimaryButton, SecondaryButton, projectStyles as s } from '../components/ProjectNativeUI';

function ProjectNameForm({ project, groupId, userId, onClose, onSaved }) {
  const [name, setName] = useState(project?.name || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const save = async () => {
    if (lock.current || !name.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = project ? await updateProject(project.projectId, userId, { name: name.trim() }) : await createProject(groupId, userId, name.trim());
      if (mounted.current) onSaved(value);
    } catch (e) { if (mounted.current) setError(e.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#10285B55' }}>
      <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} disabled={busy} onPress={onClose} accessibilityLabel="프로젝트 만들기 닫기"/>
      <View style={[s.panel, { width: '100%', maxWidth: 440, alignSelf: 'center' }]}>
        <View style={s.heading}><Text style={s.headingText}>{project ? '프로젝트 이름 변경' : '프로젝트 만들기'}</Text><TouchableOpacity style={s.icon} onPress={onClose} disabled={busy} accessibilityLabel="닫기"><Ionicons name="close" size={22} color={colors.text}/></TouchableOpacity></View>
        <ProjectError message={error}/>
        <View style={s.heading}><TextInput accessibilityLabel="프로젝트 이름" style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder="프로젝트 이름" autoFocus maxLength={100} editable={!busy}/><PrimaryButton title={busy ? '저장 중…' : project ? '저장' : '만들기'} onPress={save} disabled={busy || !name.trim()}/></View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function GroupProjectList({ user, group, onOpenProject, onChanged }) {
  const [creating, setCreating] = useState(false), [projects, setProjects] = useState(null), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [refreshing, setRefreshing] = useState(false);
  const liveRevision = useLiveRevision(['projects', 'reports', 'tasks'], { dirty: creating });
  useEffect(() => {
    if (!group?.groupId || !user?.userId) return;
    let active = true; setError('');
    fetchProjects(group.groupId, user.userId).then(value => active && setProjects(value)).catch(e => active && setError(e.message)).finally(() => active && setRefreshing(false));
    return () => { active = false; };
  }, [group?.groupId, user?.userId, revision, liveRevision]);
  return <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setRevision(n => n + 1); }}/>}>
    <View style={s.heading}><Text style={s.headingText}>프로젝트</Text><SecondaryButton title="프로젝트 만들기" icon="add" onPress={() => setCreating(true)}/></View>
    <ProjectError message={error} onRetry={() => setRevision(n => n + 1)}/>
    {!projects ? !error && <ProjectLoading/> : <>{projects.map(project => <TouchableOpacity key={project.projectId} style={s.row} onPress={() => onOpenProject?.(project)}>
      <Ionicons name="folder-outline" size={24} color={colors.primary}/><View style={s.grow}><Text style={s.name}>{project.name}</Text><Text style={s.meta}>완료 {project.completedCount || 0}건 · 보고서 {(project.draftReportCount || 0) + (project.finalReportCount || 0)}개</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textSoft}/>
    </TouchableOpacity>)}{!projects.length && <EmptyState icon="folder-open-outline" title="프로젝트가 없어요"/>}</>}
    {creating && <ProjectNameForm groupId={group.groupId} userId={user.userId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setRevision(n => n + 1); onChanged?.(); }}/ >}
  </ScrollView>;
}

export default function ProjectScreen({ user, projectId, initialProject, onBack, onEditReport, onReportViewChange }) {
  const projectScroll = useRef(null);
  const scrollToReportItem = useCallback(y => projectScroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }), []);
  const [project, setProject] = useState(initialProject), [tasks, setTasks] = useState([]), [reports, setReports] = useState(null);
  const [view, setView] = useState(initialProject?.reportView || null), [collapsed, setCollapsed] = useState(true), [renaming, setRenaming] = useState(false);
  useEffect(() => { onReportViewChange?.(view); }, [view, onReportViewChange]);
  const [visitDirty, setVisitDirty] = useState(false), [reportDirty, setReportDirty] = useState(false);
  const [error, setError] = useState(''), [revision, setRevision] = useState(0), [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const dirty = visitDirty || reportDirty || renaming || deleting;
  const remove = () => showAlert('프로젝트 삭제', `"${project.name}" 프로젝트와 통합보고서를 삭제할까요? 원본 방문지와 건별 보고서는 유지됩니다.`, [
    { text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: async () => {
      if (deleteLock.current) return; deleteLock.current = true; setDeleting(true);
      try { await deleteProject(projectId, user.userId); onBack(); }
      catch (error) { showAlert('프로젝트 삭제 실패', error.message); }
      finally { deleteLock.current = false; setDeleting(false); }
    } },
  ]);
  const liveRevision = useLiveRevision(['projects', 'reports', 'tasks'], { dirty });
  const changed = useCallback(() => setRevision(n => n + 1), []);
  const close = useCallback(() => { setView(null); setReportDirty(false); }, []);
  const open = useCallback(id => { setView(String(id)); setCollapsed(true); setReportDirty(false); }, []);
  const requestView = id => {
    const next = String(id) === view ? null : String(id);
    const switchView = () => { if (next) open(next); else close(); };
    if (reportDirty) showAlert('보고서 전환', '저장하지 않은 변경을 취소하고 이동할까요?', [{ text: '계속 작성', style: 'cancel' }, { text: '이동', onPress: switchView }]);
    else switchView();
  };
  const back = () => {
    if (dirty) showAlert('프로젝트 나가기', '저장하지 않은 변경을 취소하고 나갈까요?', [{ text: '계속 작성', style: 'cancel' }, { text: '나가기', onPress: onBack }]);
    else onBack();
  };
  useScreenBackHandler(() => { if (view) { requestView(view); return true; } return false; });
  useEffect(() => {
    let active = true; setError('');
    Promise.all([fetchProject(projectId, user.userId), fetchProjectTasks(projectId, user.userId), fetchProjectReports(projectId, user.userId)]).then(([p, t, r]) => {
      if (active) { setProject(p); setTasks(t); setReports(r); }
    }).catch(e => active && setError(e.message)).finally(() => active && setRefreshing(false));
    return () => { active = false; };
  }, [projectId, user.userId, revision, liveRevision]);
  return <View style={s.root}>
    <ScreenHeader title={project?.name || '프로젝트'} onBack={back} right={<View style={s.heading}><TouchableOpacity style={s.icon} disabled={dirty} accessibilityLabel="프로젝트 이름 변경" onPress={() => setRenaming(true)}><Ionicons name="create-outline" size={22} color={colors.primary}/></TouchableOpacity>{project?.canDelete && <TouchableOpacity style={s.icon} accessibilityLabel="프로젝트 삭제" disabled={dirty} onPress={remove}><Ionicons name="trash-outline" size={21} color={colors.danger}/></TouchableOpacity>}</View>}/>
    <ScrollView ref={projectScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={refreshing} enabled={!dirty} onRefresh={() => { if (!dirty) { setRefreshing(true); changed(); } }}/>}>
      <ProjectError message={error} onRetry={!dirty ? changed : undefined}/>
      {!reports ? !error && <ProjectLoading/> : <>
        <ProjectVisits project={project} userId={user.userId} rows={tasks} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} onChanged={changed} onDirtyChange={setVisitDirty} disabled={reportDirty}/>
        <View style={s.panel}><View style={s.heading}><Text style={s.headingText}>통합 보고서 <Text style={s.meta}>{reports.length}건</Text></Text><SecondaryButton title="새 보고서" icon="add" disabled={visitDirty || project.status === 'ARCHIVED'} onPress={() => requestView('new')}/></View>
          {reports.map(report => <TouchableOpacity style={[s.row, view === String(report.reportId) && { backgroundColor: colors.primarySoft }]} key={report.reportId} disabled={visitDirty} onPress={() => requestView(report.reportId)} accessibilityRole="button" accessibilityState={{ expanded: view === String(report.reportId) }}>
            <View style={s.grow}><Text style={s.name}>{report.title}</Text><Text style={s.meta}>{report.itemCount || 0}건 · {recordDay(report.updatedAt || report.createdAt)}</Text></View>
            <View style={[s.badge, { backgroundColor: report.status === 'FINAL' ? colors.successSoft : colors.warningSoft }]}><Text style={{ fontSize: 11, color: report.status === 'FINAL' ? colors.successInk : colors.warningInk }}>{report.status === 'FINAL' ? '확정' : '작성 중'} v{report.version || 1}</Text></View>
            <Ionicons name={view === String(report.reportId) ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSoft}/>
          </TouchableOpacity>)}{!reports.length && <Text style={s.meta}>아직 보고서가 없습니다.</Text>}
        </View>
        {view && <ProjectReportWorkspace key={`${projectId}:${view}`} project={project} tasks={tasks} userId={user.userId} reportId={view === 'new' ? null : view} onClose={close} onOpenReport={open} onChanged={changed} onDirtyChange={setReportDirty} onEditReport={onEditReport} onScrollToItem={scrollToReportItem}/ >}
      </>}
    </ScrollView>
    {renaming && <ProjectNameForm project={project} userId={user.userId} onClose={() => setRenaming(false)} onSaved={() => { setRenaming(false); changed(); }}/ >}
  </View>;
}
