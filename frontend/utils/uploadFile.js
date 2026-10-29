import { File } from 'expo-file-system';

// expo/fetch reads File-like parts through bytes(); RN's { uri } parts are unsupported.
// Keep the selected filename and MIME type instead of using the cache filename.
export function createUploadFile({ uri, name, type }) {
  const source = new File(uri);
  return {
    name: name || source.name,
    type: type || source.type,
    bytes: () => source.bytes(),
  };
}
