import ProjectPicker from './ProjectPicker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { showAlert } from './CustomAlert';
import { createProject, fetchProjects, fetchProjectPlaces, registerProjectPlaces, updateProject } from '../utils/projectApi';

function ProjectManager({ visible, userId, groupId, personal, selectOnly = false, onSelect, onClose, onRegistered, onShowPlaces }) {
 const [projects,setProjects]=useState([]), [project,setProject]=useState(null), [places,setPlaces]=useState([]), [selected,setSelected]=useState([]);
 const [name,setName]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState('');
 const {height:windowHeight,width:windowWidth}=useWindowDimensions();
 const [layoutHeight,setLayoutHeight]=useState(windowHeight);
 // Keep the full viewport height when Android resizes the modal for its keyboard.
 useEffect(()=>{setLayoutHeight(windowHeight);},[windowWidth]);
 const lock=useRef(false), epoch=useRef(0);
 const load=async () => { const e=++epoch.current; setBusy(true); setError(''); try { const rows=await fetchProjects(groupId,userId); if(e===epoch.current) setProjects(rows||[]); } catch(err){if(e===epoch.current)setError(err.message);} finally{if(e===epoch.current)setBusy(false);} };
 useEffect(()=>{setProject(null);setPlaces([]);setSelected([]);setName('');setError(''); if(visible && groupId && !personal)load(); return()=>{epoch.current++;};},[visible,groupId,personal]);
 const open=async p=>{ if(selectOnly){onSelect?.(p);return;} setProject(p);setSelected([]);setName(p.name);setBusy(true);setError('');try{setPlaces(await fetchProjectPlaces(p.projectId));}catch(err){setError(err.message);}finally{setBusy(false);} };
 const run=async action=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(err){setError(err.message);}finally{lock.current=false;setBusy(false);} };
 const confirmRegistration=(ids,count)=>showAlert('새 업무로 등록',`선택한 방문지 중 ${count}곳에 진행 중인 업무가 있습니다. 기존 업무를 유지하고 새 업무로 추가할까요?`,[
  {text:'취소',style:'cancel'}, {text:'새 업무로 등록',onPress:()=>register(ids,true)},
 ]);
 const register=(ids,allowActive=false)=>{
  if(lock.current || busy || !ids.length)return;
  const activeCount=places.filter(p=>ids.includes(p.placeId)&&p.activeTaskCount>0).length;
  if(!allowActive&&activeCount){confirmRegistration(ids,activeCount);return;}
  return run(async()=>{
   const result=await registerProjectPlaces(project.projectId,userId,ids,allowActive);
   const created=result.created||[],skipped=result.skipped||[];
   if(created.length)await onRegistered?.(created);
   setPlaces(await fetchProjectPlaces(project.projectId));setSelected([]);
   // Another member may have registered a task after this list was loaded.
   // Confirm only the skipped places so already-created tasks are not repeated.
   if(skipped.length&&!allowActive){confirmRegistration(skipped,skipped.length);return;}
   showAlert('방문지 등록',`${created.length}건을 새 업무로 등록했습니다.`);
  });
 };
 const close=()=>{if(!busy){Keyboard.dismiss();onClose();}};
 const button=(title,action,disabled=false)=> <TouchableOpacity accessibilityRole="button" onPress={action} disabled={busy||disabled} style={{padding:13,borderRadius:12,backgroundColor:disabled?colors.surfaceMuted:colors.primary,alignItems:'center',opacity:busy?0.6:1}}><Text style={{color:disabled?colors.textSoft:'#FFF',fontWeight:'700'}}>{title}</Text></TouchableOpacity>;
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}><View accessibilityLabel="프로젝트 카드 영역" style={{position:'absolute',top:0,left:0,right:0,height:layoutHeight,justifyContent:'center',alignItems:'center',padding:20,backgroundColor:'#10285B55'}}>
 <Pressable accessibilityLabel="프로젝트 닫기" disabled={busy} onPress={close} style={{position:'absolute',top:0,bottom:0,left:0,right:0}}/>
 <View style={{backgroundColor:colors.surface,borderRadius:24,padding:20,maxHeight:layoutHeight*0.85,width:'100%',maxWidth:440,gap:12}}>
 <View style={{flexDirection:'row',alignItems:'center',gap:12}}>{project&&<TouchableOpacity onPress={()=>{setProject(null);setName('');setPlaces([]);}} disabled={busy}><Ionicons name="arrow-back" size={24} color={colors.text}/></TouchableOpacity>}
 <Text style={{flex:1,fontSize:20,fontWeight:'800',color:colors.text}}>{project?.name || '프로젝트'}</Text><TouchableOpacity accessibilityLabel="닫기" onPress={close} disabled={busy}><Ionicons name="close" size={24} color={colors.text}/></TouchableOpacity></View>
 {personal ? <Text style={{color:colors.textSoft}}>팀 그룹을 선택하면 프로젝트를 사용할 수 있습니다.</Text> : <>
 <View style={{flexDirection:'row',gap:8}}><TextInput value={name} onChangeText={setName} placeholder={project?'프로젝트 이름':'새 프로젝트 이름'} placeholderTextColor={colors.textSoft} accessibilityLabel={project?'프로젝트 이름':'새 프로젝트 이름'} maxLength={100} editable={!busy} style={{flex:1,padding:12,borderRadius:12,backgroundColor:colors.surfaceMuted,color:colors.text}}/>
 {button(project?'수정':'만들기',()=>run(async()=>{if(project){const saved=await updateProject(project.projectId,userId,{name:name.trim()});setProject({...project,...saved});}else{const p=await createProject(groupId,userId,name.trim());await open(p);}}),!name.trim())}</View>
 {!!error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
 {busy&&<ActivityIndicator color={colors.primary}/>}
 <ScrollView accessibilityLabel={project?'프로젝트 방문지 목록':'프로젝트 목록'} keyboardShouldPersistTaps="handled" style={{maxHeight:350}}>
 {!project ? projects.map(p=><TouchableOpacity key={p.projectId} disabled={busy} onPress={()=>open(p)} style={{paddingVertical:16,borderBottomWidth:1,borderColor:colors.line,flexDirection:'row',gap:10}}><Ionicons name="folder-outline" size={22} color={colors.primary}/><Text style={{flex:1,color:colors.text,fontWeight:'700'}}>{p.name}{p.status==='ARCHIVED'?' · 보관':''}</Text><Ionicons name="chevron-forward" size={20} color={colors.textSoft}/></TouchableOpacity>) : places.map(p=><TouchableOpacity key={p.placeId} accessibilityRole="checkbox" accessibilityLabel={p.name} accessibilityState={{checked:selected.includes(p.placeId)}} disabled={busy} onPress={()=>setSelected(old=>old.includes(p.placeId)?old.filter(id=>id!==p.placeId):[...old,p.placeId])} style={{paddingVertical:14,flexDirection:'row',gap:12,borderBottomWidth:1,borderColor:colors.line}}><Ionicons name={selected.includes(p.placeId)?'checkbox':'square-outline'} size={24} color={colors.primary}/><View style={{flex:1}}><Text style={{color:colors.text,fontWeight:'700'}}>{p.name}</Text><Text style={{color:colors.textSoft,fontSize:12}}>{p.roadAddress}{p.activeTaskCount>0?' · 진행 중인 업무 있음':''}</Text></View></TouchableOpacity>)}
 {!busy&&project&&!places.length&&<Text style={{paddingVertical:18,color:colors.textSoft}}>{project?'등록된 방문지 없음':''}</Text>}
 </ScrollView>
 {project&&<><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}>{button(`선택 등록 (${selected.length})`,()=>register(selected),!selected.length)}</View><View style={{flex:1}}>{button('전체 등록',()=>register(places.map(p=>p.placeId)),!places.length)}</View></View>
 {onShowPlaces&&button('저장된 방문지 지도에서 보기',()=>{onShowPlaces(places);onClose();},!places.length)}</>}
 </>}
 </View></View></Modal>;
}

export default function ProjectBrowser(props) {
 return props.selectOnly ? <ProjectPicker {...props}/> : <ProjectManager {...props}/>;
}
