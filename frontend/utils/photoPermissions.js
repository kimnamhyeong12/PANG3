const hasPhotoAccess = permission => permission?.granted || permission?.accessPrivileges === 'limited';

// Keep system-picker access separate from permission to read the original GPS.
// Inject native APIs so refusal and limited-access paths can be checked without a device.
export async function requestPhotoPermissions({ platform, version, expoGo, picker, library, android }) {
  const result = { pickerAllowed: true, metadataError: '', settingsRecommended: false, limited: false };
  if (platform !== 'android') {
    let permission = await picker.getMediaLibraryPermissionsAsync();
    if (!hasPhotoAccess(permission) && permission.canAskAgain !== false) permission = await picker.requestMediaLibraryPermissionsAsync();
    if (!hasPhotoAccess(permission)) return { ...result, pickerAllowed: false, settingsRecommended: true,
      metadataError: '사진 접근 권한이 없습니다. 앱 설정에서 사진 접근을 허용한 뒤 다시 선택해 주세요.' };
    return { ...result, limited: permission.accessPrivileges === 'limited' };
  }
  // Android's system picker can open even without full-library permission.
  if (expoGo) return { ...result, metadataError: 'Android Expo Go에서는 원본 사진 위치 권한을 사용할 수 없습니다. 사진 위치 권한이 포함된 개발용 APK로 확인해 주세요.' };
  try {
    let permission = await library.getPermissionsAsync(false, ['photo']);
    if (!hasPhotoAccess(permission) && permission.canAskAgain !== false) permission = await library.requestPermissionsAsync(false, ['photo']);
    result.limited = permission.accessPrivileges === 'limited';
    // MediaLibrary may aggregate photo-read and media-location permission into
    // one denied result. Check photo-read separately before diagnosing the denial.
    const photoRead = await android.check(Number(version) >= 33
      ? 'android.permission.READ_MEDIA_IMAGES' : 'android.permission.READ_EXTERNAL_STORAGE');
    const selectedRead = Number(version) >= 34 && await android.check('android.permission.READ_MEDIA_VISUAL_USER_SELECTED');
    result.limited = result.limited || (!photoRead && selectedRead);
    if (!hasPhotoAccess(permission) && !photoRead && !selectedRead) return { ...result, settingsRecommended: true,
      metadataError: '갤러리 원본 사진 접근이 거부되었습니다. 앱 설정에서 사진 접근을 허용한 뒤 다시 선택해 주세요. 원본 GPS 조회에 이 권한이 필요합니다.' };
    if (Number(version) >= 29) {
      const name = 'android.permission.ACCESS_MEDIA_LOCATION';
      if (!(await android.check(name))) {
        const status = await android.request(name);
        if (status !== android.RESULTS.GRANTED) return { ...result, settingsRecommended: true,
          metadataError: status === android.RESULTS.NEVER_ASK_AGAIN
            ? '사진 위치 정보 권한이 차단되어 다시 요청할 수 없습니다. 앱 설정에서 권한을 확인한 뒤 다시 선택해 주세요.'
            : '사진 위치 정보 권한을 받지 못했습니다. 권한 확인 후 사진을 다시 선택해 주세요. 권한 항목이 없으면 권한을 포함한 APK를 다시 빌드·설치해야 합니다.' };
      }
    }
    return result;
  } catch {
    return { ...result, settingsRecommended: true,
      metadataError: '원본 사진 권한을 확인하지 못했습니다. 앱 설정을 확인하세요. 권한 요청이 계속 실패하면 expo-media-library와 사진 위치 권한이 포함된 APK를 다시 빌드·설치해 주세요.' };
  }
}
