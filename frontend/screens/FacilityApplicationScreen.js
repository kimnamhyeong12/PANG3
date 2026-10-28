import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import { File } from 'expo-file-system';
import { ScreenHeader, PrimaryButton, SecondaryButton } from '../components/ui';
import OriginalPhotoPicker from '../components/OriginalPhotoPicker';
import ReportDatePicker from '../components/ReportDatePicker';
import { requestPhotoPermissions } from '../utils/photoPermissions';
import { resolvePhotoMetadata } from '../utils/photoMetadata';
import { photoAddress } from '../utils/photoRegistration';
import { getInteractiveMapHtml } from '../utils/reportLocationMap';
import { koreaDayKey } from '../utils/completionDay';
import { groupApi } from '../utils/groupApi';
import { apiFetch, downloadProtectedFile } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { colors } from '../constants/design';

const STATUS = { PENDING:'접수', REVIEWING:'검토 중', NEEDS_INFO:'보완 요청', APPROVED:'승인', REJECTED:'반려' };
function EvidenceImage({ url }) {
  const [source,setSource]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;setSource(null);setError('');downloadProtectedFile(url,'facility-evidence.jpg').then(uri=>{if(active)setSource({uri});}).catch(()=>{if(active)setError('사진을 불러오지 못했습니다. 다시 열어 주세요.');});return()=>{active=false;};},[url]);
  return source ? <Image source={source} resizeMode="contain" style={styles.image} /> : <Text style={styles.help}>{error||'사진을 불러오는 중…'}</Text>;
}
export default function FacilityApplicationScreen({ user, onClose, onSubmitted }) {
  const [tab,setTab]=useState('form'),[name,setName]=useState(''),[kind,setKind]=useState(''),[location,setLocation]=useState(''),[description,setDescription]=useState('');
  const [date,setDate]=useState(koreaDayKey()),[calendar,setCalendar]=useState(false),[photo,setPhoto]=useState(null),[screenshot,setScreenshot]=useState(null),[address,setAddress]=useState('');
  const [originalOpen,setOriginalOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
  const [items,setItems]=useState([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false);
  const lock=useRef(false),request=useRef(null);
  useEffect(()=>{if(tab!=='history')return;let active=true;setLoading(true);setError('');groupApi(selected?`/api/facility-applications/${selected}`:`/api/facility-applications?page=${page}`).then(data=>{if(!active)return;if(selected)setDetail(data);else{setItems(old=>page===0?data.items:[...old,...data.items]);setHasMore(data.hasMore);}}).catch(failure=>{if(active)setError(failure.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[tab,selected,page,revision,user.userId]);
  const permissions=()=>requestPhotoPermissions({platform:Platform.OS,version:Platform.Version,expoGo:Constants.appOwnership==='expo',picker:ImagePicker,library:MediaLibrary,android:PermissionsAndroid});
  const validateFile=asset=>{const fileName=asset.fileName||asset.filename||'photo.jpg';if(!/\.(jpe?g|png)$/i.test(fileName))throw new Error('위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.');const size=new File(asset.uri).size;if(!size||size>15*1024*1024)throw new Error('사진 한 장은 최대 15MB까지 첨부할 수 있습니다.');return {...asset,fileName,size,mimeType:/\.png$/i.test(fileName)?'image/png':'image/jpeg'};};
  const resolveOriginal=async asset=>{
    setOriginalOpen(false);if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {const permission=await permissions();const item=await resolvePhotoMetadata(asset,0,{platform:Platform.OS,expoGo:Constants.appOwnership==='expo',permissionError:permission.metadataError,readAssetInfo:id=>MediaLibrary.getAssetInfoAsync(id,{shouldDownloadFromNetwork:true})});if(item.error)throw new Error(item.error);setPhoto(validateFile(item));setAddress('');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{setAddress(await photoAddress(item.lat,item.lng,{fetchImpl:apiFetch,key:process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,signal:controller.signal}));}catch{}finally{clearTimeout(timer);}}
    catch(failure){setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  const pick=async original=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      if(original){const permission=await permissions();if(permission.metadataError)throw new Error(permission.metadataError);if(!permission.pickerAllowed)throw new Error('사진 접근을 허용해 주세요.');setOriginalOpen(true);return;}
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:1});
      if(!result.canceled)setScreenshot(validateFile(result.assets[0]));
    }catch(failure){setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  const submit=async()=>{
    if(lock.current)return;
    if(!name.trim()||!kind.trim()||!location.trim()||!photo||!screenshot||!consent){setError('필수 항목, 두 장의 사진과 위치정보 수집 동의를 확인해 주세요.');return;}
    lock.current=true;setBusy(true);setError('');
    try{const values={name:name.trim(),kind:kind.trim(),address,detailLocation:location.trim(),confirmedDate:date,description:description.trim(),consent:true};const signature=JSON.stringify([values,photo.uri,screenshot.uri]);if(request.current?.signature!==signature)request.current={signature,key:`${Date.now()}-${Math.random().toString(36).slice(2)}`};const body=new FormData();body.append('application',JSON.stringify({...values,requestKey:request.current.key}));for(const [key,file]of [['photo',photo],['screenshot',screenshot]])body.append(key,{uri:file.uri,name:file.fileName,type:file.mimeType});await groupApi('/api/facility-applications',{method:'POST',body});setName('');setKind('');setLocation('');setDescription('');setPhoto(null);setScreenshot(null);setAddress('');setConsent(false);request.current=null;setTab('history');setPage(0);setSelected(null);setRevision(v=>v+1);onSubmitted?.();}
    catch(failure){setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  return <Modal visible statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaProvider><SafeAreaView style={styles.root} edges={['bottom','left','right']}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}><ScreenHeader title="공공시설물 등록 신청" onBack={()=>{if(!busy)onClose();}} />
    <View style={styles.tabs}>{[['form','등록 신청'],['history','내 신청 내역']].map(([key,label])=><TouchableOpacity key={key} disabled={busy} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>{setTab(key);setSelected(null);setDetail(null);setPage(0);setError('');setRevision(v=>v+1);}} style={[styles.tab,tab===key&&styles.activeTab]}><Text style={styles.tabText}>{label}</Text></TouchableOpacity>)}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={tab!=='form'&&styles.hidden}>
        <View style={styles.form}>
          <Text style={styles.label}>시설물 이름 *</Text><TextInput style={styles.input} accessibilityLabel="시설물 이름" value={name} onChangeText={setName} maxLength={100} editable={!busy} placeholder="시설물 이름" />
          <Text style={styles.label}>시설 종류 *</Text><TextInput style={styles.input} accessibilityLabel="시설 종류" value={kind} onChangeText={setKind} maxLength={40} editable={!busy} placeholder="예: 소화전, 공중화장실" />
          <Text style={styles.label}>현재 위치 지도 스크린샷 *</Text><SecondaryButton title={screenshot?'스크린샷 변경':'지도 스크린샷 선택'} icon="map-outline" disabled={busy} onPress={()=>pick(false)} />{screenshot&&<Image source={{uri:screenshot.uri}} resizeMode="contain" style={styles.image} />}
          <Text style={styles.label}>시설물 원본 사진 *</Text><Text style={styles.help}>촬영 위치정보가 포함된 JPG·PNG 사진을 선택해 주세요.</Text><SecondaryButton title={photo?'시설물 사진 변경':'시설물 원본 사진 선택'} icon="camera-outline" disabled={busy} onPress={()=>pick(true)} />
          {photo&&<><Image source={{uri:photo.uri}} resizeMode="contain" style={styles.image} /><View style={styles.location}><Text style={styles.label}>촬영 위치 확인됨</Text><Text style={styles.help}>{address||'주소를 확인할 수 없습니다. 좌표로 검토합니다.'}</Text><Text selectable style={styles.help}>위도 {photo.lat.toFixed(6)} · 경도 {photo.lng.toFixed(6)}</Text></View><View style={styles.map}><WebView originWhitelist={['*']} source={{html:getInteractiveMapHtml(photo.lat,photo.lng,false),baseUrl:'https://localhost'}} /></View></>}
          <Text style={styles.label}>상세 위치 *</Text><TextInput accessibilityLabel="상세 위치" style={styles.input} value={location} onChangeText={setLocation} maxLength={300} editable={!busy} placeholder="예: 구청 본관 1층 안내데스크 옆" />
          <Text style={styles.label}>확인 날짜 *</Text><SecondaryButton title={date} icon="calendar-outline" disabled={busy} onPress={()=>setCalendar(true)} />
          <Text style={styles.label}>추가 설명</Text><TextInput accessibilityLabel="추가 설명" style={[styles.input,styles.multiline]} multiline value={description} onChangeText={setDescription} maxLength={3000} editable={!busy} placeholder="검토에 필요한 내용을 적어 주세요." />
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:consent}} disabled={busy} onPress={()=>setConsent(v=>!v)}><Text style={styles.help}>{consent?'☑':'☐'} (필수) 사진·촬영 위치정보를 시설물 검토 목적으로 수집·이용하는 데 동의합니다. 승인된 시설물 이름·종류·위치만 공공데이터에 공개되며 신청자 정보와 증빙 사진은 공개되지 않습니다.</Text></TouchableOpacity>
          <PrimaryButton title={busy?'확인·접수 중…':'등록 신청'} disabled={busy||!photo||!screenshot||!name.trim()||!kind.trim()||!location.trim()||!consent} onPress={submit} />
        </View>
      </View>
      {tab==='history'&&<><SecondaryButton title="새로고침" onPress={()=>{setPage(0);setRevision(v=>v+1);}} />{loading&&<ActivityIndicator color={colors.primary} />}{selected&&detail?<View style={styles.form}><SecondaryButton title="목록으로" onPress={()=>{setSelected(null);setDetail(null);}} /><Text style={styles.label}>{detail.name} · {STATUS[detail.status]}</Text><Text style={styles.help}>{detail.kind} · {detail.confirmedDate}</Text><Text style={styles.help}>{detail.address} {detail.detailLocation}</Text><Text selectable style={styles.help}>위도 {detail.photoLat} · 경도 {detail.photoLng}</Text><EvidenceImage url={`${API_BASE_URL}/api/facility-applications/${detail.id}/evidence/photo`} /><EvidenceImage url={`${API_BASE_URL}/api/facility-applications/${detail.id}/evidence/screenshot`} /><Text style={styles.help}>{detail.description}</Text>{!!detail.reviewNote&&<View style={styles.location}><Text style={styles.label}>관리자 검토 내용</Text><Text style={styles.help}>{detail.reviewNote}</Text></View>}</View>:!selected&&<>{items.map(item=><TouchableOpacity key={item.id} style={styles.item} onPress={()=>{setDetail(null);setSelected(item.id);}}><Text style={styles.label}>{item.name}</Text><Text style={styles.help}>{item.kind} · {STATUS[item.status]}</Text></TouchableOpacity>)}{!loading&&!error&&!items.length&&<Text style={styles.help}>등록 신청 내역이 없습니다.</Text>}{hasMore&&<SecondaryButton title="이전 신청 더 보기" disabled={loading} onPress={()=>setPage(v=>v+1)} />}</>}</>}
    </ScrollView>
    <ReportDatePicker visible={calendar} value={date} title="시설물 확인 날짜" onClose={()=>setCalendar(false)} onSelect={value=>{if(value>koreaDayKey())setError('오늘 이후 날짜는 선택할 수 없습니다.');else setDate(value);}} />
    <OriginalPhotoPicker visible={originalOpen} maximum={1} onCancel={()=>setOriginalOpen(false)} onConfirm={assets=>{if(assets[0])resolveOriginal(assets[0]);}} />
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider></Modal>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:colors.background},body:{padding:20,paddingBottom:32,gap:16},form:{gap:14},label:{color:colors.text,fontSize:14,fontWeight:'800'},help:{color:colors.textSoft,fontSize:12,lineHeight:21},input:{borderWidth:1,borderColor:colors.line,borderRadius:10,minHeight:50,padding:12,color:colors.text},multiline:{minHeight:120,textAlignVertical:'top'},image:{width:'100%',height:210,backgroundColor:colors.surfaceMuted,borderRadius:12},map:{height:220,borderRadius:12,overflow:'hidden'},location:{backgroundColor:colors.surfaceMuted,padding:14,borderRadius:12,gap:8},tabs:{flexDirection:'row',paddingHorizontal:20},tab:{flex:1,minHeight:48,justifyContent:'center',alignItems:'center',borderBottomWidth:2,borderBottomColor:colors.line},activeTab:{borderBottomColor:colors.primary},tabText:{color:colors.text,fontWeight:'700'},hidden:{display:'none'},error:{color:colors.danger,lineHeight:22},item:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:colors.line,gap:8}});
