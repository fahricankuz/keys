/* Fotoğraf ve belge seçimi. Görseller küçültülüp veri adresine (data URL) çevrilir
   ve durumla birlikte saklanır; PDF gibi dosyalarda yalnızca ad tutulur. */
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

export type Picked = { name: string; dataUrl: string | null; isImage: boolean; uri?: string; mime?: string; size?: number };

/** Görseli küçültür. Web'de WebP denenir (aynı kalitede çok daha küçük); tarayıcı WebP üretemezse
    (bazı Safari sürümleri sessizce PNG verir) JPEG'e dönülür. WebP dosyası "RIFF" (base64: UklGR) ile başlar. */
async function shrink(uri: string, width = 720): Promise<string | null> {
  const run = (format: ImageManipulator.SaveFormat, compress: number) =>
    ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], { compress, format, base64: true });
  try {
    if (Platform.OS === 'web') {
      const w = await run(ImageManipulator.SaveFormat.WEBP, 0.7);
      if (w.base64 && w.base64.startsWith('UklGR')) return 'data:image/webp;base64,' + w.base64;
    }
    const r = await run(ImageManipulator.SaveFormat.JPEG, 0.62);
    return r.base64 ? 'data:image/jpeg;base64,' + r.base64 : null;
  } catch { return null; }
}

async function fromAssets(assets: ImagePicker.ImagePickerAsset[], max: number): Promise<Picked[]> {
  const out: Picked[] = [];
  for (const a of assets.slice(0, max)) {
    const dataUrl = await shrink(a.uri);
    out.push({ name: a.fileName || 'foto.jpg', dataUrl, isImage: true });
  }
  return out;
}

export async function pickImages(max = 4): Promise<Picked[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: max > 1, selectionLimit: max, quality: 0.8 });
  return r.canceled ? [] : fromAssets(r.assets, max);
}

export async function takePhoto(): Promise<Picked[]> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return [];
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return r.canceled ? [] : fromAssets(r.assets, 1);
  } catch { return []; }
}

/** Dekont, belge ve fatura: görsel ya da PDF. */
export async function pickDocument(): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const isImage = (a.mimeType || '').startsWith('image/');
  return { name: a.name, dataUrl: isImage ? await shrink(a.uri) : null, isImage, uri: a.uri, mime: a.mimeType || undefined, size: a.size || undefined };
}

/** JSON içe aktarma için metin dosyası. */
export async function pickJson(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  try {
    if ((a as any).file) return await (a as any).file.text();
    const res = await fetch(a.uri);
    return await res.text();
  } catch { return null; }
}

/** Excel ya da CSV dosyası seçtirir; içeriği bayt olarak döner (toplu içe aktarma). */
export async function pickTable(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const r = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    copyToCacheDirectory: true
  });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  try {
    const buf = (a as any).file ? await (a as any).file.arrayBuffer() : await (await fetch(a.uri)).arrayBuffer();
    return { name: a.name, bytes: new Uint8Array(buf) };
  } catch { return null; }
}
