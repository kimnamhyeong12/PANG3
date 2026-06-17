const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || '';

export function resolveApiUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export { API_BASE_URL };
