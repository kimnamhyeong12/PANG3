import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/design';
import { fetchProjects } from '../utils/projectApi';

// Selection only. Project creation is kept in the explicit project-management screen.
export default function ProjectPicker({ visible, userId, groupId, personal, selectedId, includeAll = false, allLabel = '전체 업무', onSelect, onClose }) {
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!visible)return;let active=true;setRows([]);setError('');if(!groupId||personal){setBusy(false);return;}setBusy(true);
  fetchProjects(groupId,userId).then(data=>{if(active)setRows(data||[]);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};},[visible,groupId,userId,personal]);
 const row=(project)=>{const selected=project ? String(project.projectId)===String(selectedId) : selectedId==null;
  return <TouchableOpacity key={project?.projectId??'all'} accessibilityRole="button" accessibilityState={{selected}} onPress={()=>onSelect(project)} style={styles.option}>
   <Text numberOfLines={2} style={[styles.text,selected&&styles.active]}>{project?.name||allLabel}</Text>{selected&&<Ionicons name="checkmark" size={20} color={colors.primary}/>}</TouchableOpacity>;};
 return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.backdrop}>
  <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="프로젝트 선택 닫기" onPress={onClose}/>
  <View style={styles.sheet}><View style={styles.heading}><Text style={styles.title}>프로젝트 선택</Text><TouchableOpacity accessibilityLabel="닫기" onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={colors.text}/></TouchableOpacity></View>
  {busy&&<ActivityIndicator color={colors.primary}/>}<ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{maxHeight:360}}>
   {includeAll&&row(null)}{rows.map(row)}
   {!busy&&!rows.length&&<Text style={styles.empty}>{error||'등록된 프로젝트 없음'}</Text>}
  </ScrollView></View></View></Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,justifyContent:'center',padding:36,backgroundColor:'#10285B55'},sheet:{backgroundColor:colors.surface,borderRadius:16,padding:18,maxHeight:'70%'},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8},title:{fontSize:17,fontWeight:'800',color:colors.text},close:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},option:{minHeight:48,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:10,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line},text:{flex:1,color:colors.text,fontSize:14},active:{color:colors.primary,fontWeight:'700'},empty:{color:colors.textSoft,paddingVertical:18}});
