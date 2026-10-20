// Only call this with an Asset returned by MediaLibrary, never a filename match.
export function originalPhotoAsset(asset) {
  if (!asset || typeof asset.id !== 'string' || !asset.id || !asset.uri) {
    throw new Error('갤러리 원본 사진 정보를 확인할 수 없습니다.');
  }
  return { assetId: asset.id, uri: asset.uri, fileName: asset.filename,
    width: asset.width, height: asset.height, exif: {}, originalGalleryAsset: true };
}

export function mergeOriginalPhotoPage(previous, incoming) {
  const merged = new Map(previous.map(asset => [asset.id, asset]));
  for (const asset of incoming) {
    if (asset?.id && asset.uri) merged.set(asset.id, asset);
  }
  return [...merged.values()];
}
