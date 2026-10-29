import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import { File } from 'expo-file-system';
import { ScreenHeader, PrimaryButton, SecondaryButton } from '../components/ui';
import * as DocumentPicker from 'expo-document-picker';
import { readFacilityOriginalPhoto } from '../modules/kakao-navigation';
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
import { createUploadFile } from '../utils/uploadFile';

const STATUS = { PENDING:'접수', REVIEWING:'검토 중', NEEDS_INFO:'보완 요청', APPROVED:'승인', REJECTED:'반려' };
function EvidenceImage({ url }) {
  const [source,setSource]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let active=true;setSource(null);setError('');downloadProtectedFile(url,'facility-evidence.jpg').then(uri=>{if(active)setSource({uri});}).catch(()=>{if(active)setError('사진을 불러오지 못했습니다. 다시 열어 주세요.');});return()=>{active=false;};},[url]);
  return source ? <Image source={source} resizeMode="contain" style={styles.image} /> : <Text style={styles.help}>{error||'사진을 불러오는 중…'}</Text>;
}
export default function FacilityApplicationScreen({ user, onClose, onSubmitted }) {
  const [tab,setTab]=useState('form'),[name,setName]=useState(''),[kindChoice,setKindChoice]=useState(''),[location,setLocation]=useState(''),[description,setDescription]=useState('');
  const [customKind,setCustomKind]=useState(''),[kindOpen,setKindOpen]=useState(false);
  const [noticeExpanded,setNoticeExpanded]=useState(false);
  const [photoError,setPhotoError]=useState('');
  const [categories,setCategories]=useState([]),[categoriesLoading,setCategoriesLoading]=useState(true),[categoryError,setCategoryError]=useState(''),[categoryRevision,setCategoryRevision]=useState(0);
  const kind=kindChoice==='custom'?customKind:kindChoice;
  const [date,setDate]=useState(koreaDayKey()),[calendar,setCalendar]=useState(false),[photo,setPhoto]=useState(null),[address,setAddress]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
  const [items,setItems]=useState([]),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false);
  const lock=useRef(false),request=useRef(null);
  useEffect(()=>{let active=true;setCategoriesLoading(true);setCategoryError('');groupApi('/api/public-data/categories').then(data=>{if(!Array.isArray(data)||!data.length)throw new Error('등록된 시설 종류를 불러오지 못했습니다.');if(active)setCategories([...new Set(data.map(item=>item.label).filter(label=>typeof label==='string'&&label.trim()))]);}).catch(failure=>{if(active)setCategoryError(failure.message||'시설 종류를 불러오지 못했습니다.');}).finally(()=>{if(active)setCategoriesLoading(false);});return()=>{active=false;};},[categoryRevision]);
  useEffect(()=>{if(tab!=='history')return;let active=true;setLoading(true);setError('');groupApi(selected?`/api/facility-applications/${selected}`:`/api/facility-applications?page=${page}`).then(data=>{if(!active)return;if(selected)setDetail(data);else{setItems(old=>page===0?data.items:[...old,...data.items]);setHasMore(data.hasMore);}}).catch(failure=>{if(active)setError(failure.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[tab,selected,page,revision,user.userId]);
  const permissions=()=>requestPhotoPermissions({platform:Platform.OS,version:Platform.Version,expoGo:Constants.appOwnership==='expo',picker:ImagePicker,library:MediaLibrary,android:PermissionsAndroid});
  const validateFile=asset=>{const fileName=asset.fileName||asset.filename||'photo.jpg';if(!/\.(jpe?g|png)$/i.test(fileName))throw new Error('위치정보가 있는 JPG·PNG 원본 사진을 선택해 주세요.');const size=new File(asset.uri).size;if(!size)throw new Error('사진 파일을 읽지 못했습니다. 다시 선택해 주세요.');if(size>15*1024*1024)throw new Error('15MB 이하의 사진을 선택해 주세요.');return {...asset,fileName,size,mimeType:/\.png$/i.test(fileName)?'image/png':'image/jpeg'};};
  const prepareOriginal=async(asset,permission)=>{
    const item=await resolvePhotoMetadata(asset,0,{platform:Platform.OS,expoGo:Constants.appOwnership==='expo',permissionError:permission.metadataError,readAssetInfo:id=>MediaLibrary.getAssetInfoAsync(id,{shouldDownloadFromNetwork:true})});
    if(item.error)throw new Error('사진의 촬영 위치를 확인하지 못했습니다. 위치정보가 있는 원본 사진을 선택해 주세요.');
    const validated=validateFile(item);setPhoto(validated);setAddress('');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{setAddress(await photoAddress(item.lat,item.lng,{fetchImpl:apiFetch,key:process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY,signal:controller.signal}));}catch{}finally{clearTimeout(timer);}
  };
  const pick=async()=>{
    if(lock.current)return;lock.current=true;setBusy(true);setPhotoError('');
    try{
      if(Platform.OS==='android'){
        if(Number(Platform.Version)>=29){const permission='android.permission.ACCESS_MEDIA_LOCATION';if(!await PermissionsAndroid.check(permission)&&await PermissionsAndroid.request(permission)!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('사진의 촬영 위치를 읽으려면 사진 위치정보 접근을 허용해 주세요.');}
        const result=await DocumentPicker.getDocumentAsync({type:['image/jpeg','image/png'],multiple:false,copyToCacheDirectory:false});
        if(!result.canceled)await prepareOriginal(await readFacilityOriginalPhoto(result.assets[0].uri),{});
      }else{
        const permission=await permissions();if(!permission.pickerAllowed)throw new Error('사진 접근을 허용해 주세요.');
        const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:1,exif:true});
        if(!result.canceled)await prepareOriginal(result.assets[0],permission);
      }
    }catch(failure){setPhotoError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  const submit=async()=>{
    if(lock.current)return;
    if(!name.trim()||!kind.trim()||!photo||!consent){setError('필수 항목, 원본 사진과 위치정보 수집 동의를 확인해 주세요.');return;}
    lock.current=true;setBusy(true);setError('');setPhotoError('');
    try{const values={name:name.trim(),kind:kind.trim(),address,detailLocation:location.trim(),confirmedDate:date,description:description.trim(),consent:true};const signature=JSON.stringify([values,photo.uri]);if(request.current?.signature!==signature)request.current={signature,key:`${Date.now()}-${Math.random().toString(36).slice(2)}`};const body=new FormData();body.append('application',JSON.stringify({...values,requestKey:request.current.key}));body.append('photo',createUploadFile({uri:photo.uri,name:photo.fileName,type:photo.mimeType}));await groupApi('/api/facility-applications',{method:'POST',body});setName('');setKindChoice('');setCustomKind('');setKindOpen(false);setLocation('');setDescription('');setPhoto(null);setPhotoError('');setAddress('');setConsent(false);request.current=null;setTab('history');setPage(0);setSelected(null);setRevision(v=>v+1);onSubmitted?.();}
    catch(failure){if(failure.status===413)setPhotoError(failure.message);else setError(failure.message);}finally{lock.current=false;setBusy(false);}
  };
  return <Modal visible statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={()=>{if(!busy)onClose();}}><SafeAreaProvider><SafeAreaView style={styles.root} edges={['bottom','left','right']}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS==='ios'?'padding':undefined}><ScreenHeader title="공공시설물 등록 신청" onBack={()=>{if(!busy)onClose();}} />
    <View style={styles.tabs}>{[['form','등록 신청'],['history','내 신청 내역']].map(([key,label])=><TouchableOpacity key={key} disabled={busy} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>{setTab(key);setSelected(null);setDetail(null);setPage(0);setError('');setRevision(v=>v+1);}} style={[styles.tab,tab===key&&styles.activeTab]}><Text style={styles.tabText}>{label}</Text></TouchableOpacity>)}</View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <View style={tab!=='form'&&styles.hidden}>
        <View style={styles.form}>
          <Text style={styles.help}>여러 시설물을 한 번에 등록하려면 고객센터의 문의하기에서 ‘대량 데이터 등록 요청’을 선택해 주세요.</Text>
          <Text style={styles.label}>시설물 이름 <Text style={styles.required}>*</Text></Text><TextInput placeholderTextColor={colors.textSoft} style={styles.input} accessibilityLabel="시설물 이름" value={name} onChangeText={setName} maxLength={100} editable={!busy} placeholder="시설물 이름" />
          <View style={styles.kindField}>
            <Text style={styles.label}>시설 종류 <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="시설 종류 선택" accessibilityState={{expanded:kindOpen,disabled:busy}} disabled={busy} style={styles.select} onPress={()=>{Keyboard.dismiss();setKindOpen(value=>!value);}}><Text style={[styles.selectText,!kindChoice&&styles.placeholder]}>{kindChoice==='custom'?'직접 입력 (새 카테고리 요청)':kindChoice||'시설 종류를 선택해 주세요.'}</Text><Ionicons name={kindOpen?'chevron-up':'chevron-down'} size={19} color={colors.textSoft} /></TouchableOpacity>
            {kindOpen&&<View accessibilityRole="radiogroup" accessibilityLabel="시설 종류 목록" style={styles.inlineOptions}>
              {categoriesLoading&&<ActivityIndicator color={colors.primary} />}
              {!!categoryError&&<><Text accessibilityRole="alert" style={styles.error}>{categoryError}</Text><SecondaryButton title="시설 종류 다시 불러오기" disabled={categoriesLoading} onPress={()=>setCategoryRevision(value=>value+1)} /></>}
              {[...categories.map(label=>({value:label,label})),{value:'custom',label:'직접 입력 (새 카테고리 요청)'}].map(option=><TouchableOpacity key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{checked:kindChoice===option.value,disabled:busy}} disabled={busy} onPress={()=>{setKindChoice(option.value);setKindOpen(false);}} style={[styles.option,kindChoice===option.value&&styles.selectedOption]}><Text style={[styles.optionText,kindChoice===option.value&&styles.selectedText]}>{option.label}</Text>{kindChoice===option.value&&<Ionicons name="checkmark" size={21} color={colors.primary} />}</TouchableOpacity>)}
            </View>}
            {kindChoice==='custom'&&<><TextInput placeholderTextColor={colors.textSoft} style={styles.input} accessibilityLabel="새 시설 카테고리 이름" value={customKind} onChangeText={setCustomKind} maxLength={40} editable={!busy} placeholder="새 카테고리 이름을 입력해 주세요." /><Text style={styles.help}>등록된 종류에 없으면 새 카테고리 이름을 입력해 주세요. 시설물 등록 신청과 함께 검토를 요청하며, 관리자 승인 후 카테고리에 추가됩니다.</Text></>}
          </View>
          <Text style={styles.label}>시설물 원본 사진 <Text style={styles.required}>*</Text></Text><SecondaryButton title={photo?'시설물 사진 변경':'시설물 원본 사진 선택'} icon="camera-outline" disabled={busy} onPress={pick} /><Text key="photo-hint" style={styles.help}>촬영 위치정보가 포함된 15MB 이하의 JPG·PNG 원본 사진을 선택해 주세요.</Text>{!!photoError&&<Text key="photo-error" accessibilityRole="alert" style={styles.error}>{photoError}</Text>}
          {photo&&<><Image source={{uri:photo.uri}} resizeMode="contain" style={styles.image} /><View style={styles.location}><Text style={styles.label}>촬영 위치 확인됨</Text><Text style={styles.help}>{address||'주소를 확인할 수 없습니다. 좌표로 검토합니다.'}</Text><Text selectable style={styles.help}>위도 {photo.lat.toFixed(6)} · 경도 {photo.lng.toFixed(6)}</Text></View><View style={styles.map}><WebView originWhitelist={['*']} source={{html:getInteractiveMapHtml(photo.lat,photo.lng,false),baseUrl:'https://localhost'}} /></View></>}
          <Text style={styles.label}>상세 위치</Text><TextInput placeholderTextColor={colors.textSoft} accessibilityLabel="상세 위치" style={styles.input} value={location} onChangeText={setLocation} maxLength={300} editable={!busy} placeholder="예: 건물 뒤편, 1층 안내데스크 옆" />
          <Text style={styles.label}>확인 날짜 <Text style={styles.required}>*</Text></Text><SecondaryButton title={date} icon="calendar-outline" disabled={busy} onPress={()=>setCalendar(true)} />
          <Text style={styles.label}>추가 설명</Text><TextInput placeholderTextColor={colors.textSoft} accessibilityLabel="추가 설명" style={[styles.input,styles.multiline]} multiline value={description} onChangeText={setDescription} maxLength={3000} editable={!busy} placeholder="검토에 필요한 내용을 적어 주세요." />
          <View style={styles.privacySection}>
            <View style={styles.consentRow}>
              <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="사진·촬영 위치정보 수집·이용 동의" accessibilityState={{checked:consent,disabled:busy}} disabled={busy} onPress={()=>setConsent(value=>!value)} style={styles.consentButton}><Ionicons name={consent?'checkbox':'square-outline'} size={26} color={consent?colors.primary:colors.textSoft} /><Text style={styles.consentText}>(필수) 정보 수집·이용 동의</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="정보 수집·이용 안내 전문보기" accessibilityState={{expanded:noticeExpanded}} onPress={()=>setNoticeExpanded(value=>!value)} style={styles.noticeButton}><Text style={styles.noticeButtonText}>{noticeExpanded?'접기':'전문보기'}</Text></TouchableOpacity>
            </View>
            {noticeExpanded&&<View style={styles.notice}><Text style={styles.label}>사진·촬영 위치정보 수집·이용 안내</Text><Text style={styles.noticeText}>사진·촬영 위치정보를 시설물 검토 목적으로 수집·이용합니다.</Text><Text style={styles.noticeText}>승인된 시설물 이름·종류·위치만 공공데이터에 공개되며 신청자 정보와 증빙 사진은 공개되지 않습니다.</Text></View>}
          </View>
          <PrimaryButton title={busy?'확인·접수 중…':'등록 신청'} disabled={busy||!photo||!name.trim()||!kind.trim()||!consent} onPress={submit} />
        </View>
      </View>
      {tab==='history'&&<><SecondaryButton title="새로고침" onPress={()=>{setPage(0);setRevision(v=>v+1);}} />{loading&&<ActivityIndicator color={colors.primary} />}{selected&&detail?<View style={styles.form}><SecondaryButton title="목록으로" onPress={()=>{setSelected(null);setDetail(null);}} /><Text style={styles.label}>{detail.name} · {STATUS[detail.status]}</Text><Text style={styles.help}>{detail.kind} · {detail.confirmedDate}</Text><Text style={styles.help}>{detail.address} {detail.detailLocation}</Text><Text selectable style={styles.help}>위도 {detail.photoLat} · 경도 {detail.photoLng}</Text><EvidenceImage url={`${API_BASE_URL}/api/facility-applications/${detail.id}/evidence/photo`} />{detail.hasScreenshot&&<EvidenceImage url={`${API_BASE_URL}/api/facility-applications/${detail.id}/evidence/screenshot`} />}<Text style={styles.help}>{detail.description}</Text>{!!detail.reviewNote&&<View style={styles.location}><Text style={styles.label}>관리자 검토 내용</Text><Text style={styles.help}>{detail.reviewNote}</Text></View>}</View>:!selected&&<>{items.map(item=><TouchableOpacity key={item.id} style={styles.item} onPress={()=>{setDetail(null);setSelected(item.id);}}><Text style={styles.label}>{item.name}</Text><Text style={styles.help}>{item.kind} · {STATUS[item.status]}</Text></TouchableOpacity>)}{!loading&&!error&&!items.length&&<Text style={styles.help}>등록 신청 내역이 없습니다.</Text>}{hasMore&&<SecondaryButton title="이전 신청 더 보기" disabled={loading} onPress={()=>setPage(v=>v+1)} />}</>}</>}
    </ScrollView>
    <ReportDatePicker visible={calendar} value={date} title="시설물 확인 날짜" onClose={()=>setCalendar(false)} onSelect={value=>{if(value>koreaDayKey())setError('오늘 이후 날짜는 선택할 수 없습니다.');else setDate(value);}} />
  </KeyboardAvoidingView></SafeAreaView></SafeAreaProvider></Modal>;
}
const styles=StyleSheet.create({privacySection:{borderTopWidth:1,borderTopColor:colors.line,paddingTop:16,gap:16},consentRow:{flexDirection:'row',alignItems:'center',gap:8},consentButton:{flex:1,flexDirection:'row',alignItems:'center',gap:9,minHeight:52,paddingVertical:8},consentText:{flex:1,color:colors.text,fontSize:14,lineHeight:22},noticeButton:{minHeight:48,minWidth:60,paddingHorizontal:8,justifyContent:'center',alignItems:'center'},noticeButtonText:{color:colors.textSoft,fontSize:13,fontWeight:'700',textDecorationLine:'underline'},notice:{backgroundColor:colors.surfaceMuted,padding:16,borderRadius:12,gap:12},noticeText:{color:colors.textSoft,fontSize:14,lineHeight:23},kindField:{gap:10},select:{minHeight:52,borderWidth:1,borderColor:colors.line,borderRadius:10,paddingHorizontal:12,paddingVertical:12,flexDirection:'row',alignItems:'center',gap:8},selectText:{flex:1,color:colors.text,fontSize:14},placeholder:{color:colors.textSoft},inlineOptions:{borderWidth:1,borderColor:colors.line,borderRadius:10,padding:6,gap:4},option:{minHeight:52,paddingHorizontal:14,paddingVertical:14,borderRadius:10,flexDirection:'row',alignItems:'center',gap:12},selectedOption:{backgroundColor:colors.primarySoft},optionText:{flex:1,color:colors.text,fontSize:14},selectedText:{color:colors.primary,fontWeight:'700'},root:{flex:1,backgroundColor:colors.background},body:{padding:20,paddingBottom:32,gap:16},form:{gap:14},required:{color:colors.danger},label:{color:colors.text,fontSize:14,fontWeight:'800'},help:{color:colors.textSoft,fontSize:12,lineHeight:21},input:{borderWidth:1,borderColor:colors.line,borderRadius:10,minHeight:50,padding:12,color:colors.text},multiline:{minHeight:120,textAlignVertical:'top'},image:{width:'100%',height:210,backgroundColor:colors.surfaceMuted,borderRadius:12},map:{height:220,borderRadius:12,overflow:'hidden'},location:{backgroundColor:colors.surfaceMuted,padding:14,borderRadius:12,gap:8},tabs:{flexDirection:'row',paddingHorizontal:20},tab:{flex:1,minHeight:48,justifyContent:'center',alignItems:'center',borderBottomWidth:2,borderBottomColor:colors.line},activeTab:{borderBottomColor:colors.primary},tabText:{color:colors.text,fontWeight:'700'},hidden:{display:'none'},error:{color:colors.danger,lineHeight:22},item:{paddingVertical:18,borderBottomWidth:1,borderBottomColor:colors.line,gap:8}});
