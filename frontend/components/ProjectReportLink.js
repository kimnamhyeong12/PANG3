import React, { useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/design';
import { showAlert } from './CustomAlert';
import ProjectBrowser from './ProjectBrowser';
import { linkReportsToProject } from '../utils/projectApi';
export default function ProjectReportLink({ userId, groupId, personal, progressIds, onLinked }) {
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[linked,setLinked]=useState(''); const lock=useRef(false);
 if(personal)return null;
 return <View><TouchableOpacity accessibilityRole="button" disabled={!progressIds.length||busy} onPress={()=>setOpen(true)} style={{padding:12,alignItems:'center',opacity:progressIds.length?1:0.45}}><Text style={{color:colors.primary,fontWeight:'700'}}>{busy?'연결 중…':`프로젝트에 연결 (${progressIds.length})`}</Text></TouchableOpacity>
 {!!linked&&<Text style={{color:colors.textSoft,textAlign:'center',fontSize:12}}>연결됨 · {linked}</Text>}
 <ProjectBrowser visible={open} userId={userId} groupId={groupId} selectOnly onClose={()=>setOpen(false)} onSelect={async project=>{if(!project){setOpen(false);return;}if(lock.current)return;lock.current=true;setBusy(true);setOpen(false);try{await linkReportsToProject(project.projectId,userId,progressIds);setLinked(project.name);onLinked?.(project);showAlert('프로젝트 연결 완료',`${project.name}에 연결했습니다.`);}catch(error){showAlert('연결 실패',error.message);}finally{lock.current=false;setBusy(false);}}}/></View>;
}
