/* Fotoğraf ve belge seçimi. Görseller küçültülüp veri adresine (data URL) çevrilir ve depoya öyle yüklenir (depolama maliyeti);
   PDF'ler olduğu gibi yüklenir, en fazla 10 MB (bkz. backend.js → storeFile). */
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image, Platform } from 'react-native';
import { t } from '../domain/i18n';
import { host } from '../domain/host';

/** PDF ve diğer sıkıştırılmayan dosyalar için üst sınır (bayt). */
export const MAX_FILE = 10 * 1024 * 1024;

export type Picked = { name: string; dataUrl: string | null; isImage: boolean; uri?: string; mime?: string; size?: number };

/** Küçültme ayarı (tüm görseller): uzun kenar 1280 px, WebP kalite 0,75 (JPEG yedeği 0,70). Tipik bir telefon fotoğrafı
    ≈ 2 MB'tan ≈ 55 KB'a iner; dekont ve belgelerdeki yazılar okunur kalır. */
type Preset = { max: number; webp: number; jpeg: number };
const PHOTO: Preset = { max: 1280, webp: 0.75, jpeg: 0.7 };
const DOC: Preset = PHOTO;

/** Görselin boyutu (px); okunamazsa null. */
function dimsOf(uri: string, w?: number, h?: number): Promise<[number, number] | null> {
  if (w && h) return Promise.resolve([w, h]);
  return new Promise((res) => Image.getSize(uri, (a, b) => res([a, b]), () => res(null)));
}

/** Görseli uzun kenarı `max` px olacak şekilde küçültür (zaten küçükse büyütmez, yalnızca yeniden sıkıştırır).
    Web'de WebP denenir (aynı kalitede çok daha küçük); tarayıcı WebP üretemezse (bazı Safari sürümleri sessizce PNG verir)
    JPEG'e dönülür. WebP dosyası "RIFF" (base64: UklGR) ile başlar. */
async function shrink(uri: string, preset: Preset, w?: number, h?: number): Promise<string | null> {
  const dims = await dimsOf(uri, w, h);
  const actions: ImageManipulator.Action[] = !dims ? [{ resize: { width: preset.max } }]
    : Math.max(dims[0], dims[1]) <= preset.max ? []
    : dims[0] >= dims[1] ? [{ resize: { width: preset.max } }] : [{ resize: { height: preset.max } }];
  const run = (format: ImageManipulator.SaveFormat, compress: number) => ImageManipulator.manipulateAsync(uri, actions, { compress, format, base64: true });
  try {
    if (Platform.OS === 'web') {
      const wp = await run(ImageManipulator.SaveFormat.WEBP, preset.webp);
      if (wp.base64 && wp.base64.startsWith('UklGR')) return 'data:image/webp;base64,' + wp.base64;
    }
    const r = await run(ImageManipulator.SaveFormat.JPEG, preset.jpeg);
    return r.base64 ? 'data:image/jpeg;base64,' + r.base64 : null;
  } catch { return null; }
}

async function fromAssets(assets: ImagePicker.ImagePickerAsset[], max: number): Promise<Picked[]> {
  const out: Picked[] = [];
  for (const a of assets.slice(0, max)) {
    const dataUrl = await shrink(a.uri, PHOTO, a.width, a.height);
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
  // PDF sıkıştırılamaz: büyük dosya seçilir seçilmez, yükleme beklenmeden bildirilir.
  if (!isImage && a.size && a.size > MAX_FILE) { host.notify({ title: t('Dosya çok büyük'), body: t('En fazla 10 MB yüklenebilir.'), icon: 'doc' }); return null; }
  return { name: a.name, dataUrl: isImage ? await shrink(a.uri, DOC, (a as any).width, (a as any).height) : null, isImage, uri: a.uri, mime: a.mimeType || undefined, size: a.size || undefined };
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
