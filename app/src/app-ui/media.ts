/* Fotoğraf ve belge seçimi. Görseller küçültülüp veri adresine (data URL) çevrilir ve depoya öyle yüklenir (depolama maliyeti);
   PDF'ler olduğu gibi yüklenir, en fazla 10 MB (bkz. backend.js → storeFile). */
import type * as ImagePickerT from 'expo-image-picker';
import type * as ImageManipulatorT from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Image, Platform } from 'react-native';
import { t } from '../domain/i18n';
import { host } from '../domain/host';

// Fotoğraf seçici ve küçültücü yalnız kullanıldığı anda yüklenir; her sayfanın ortak paketine girmez.
const picker = () => import('expo-image-picker');
const manipulator = () => import('expo-image-manipulator');

/** PDF ve diğer sıkıştırılmayan dosyalar için üst sınır (bayt). */
export const MAX_FILE = 10 * 1024 * 1024;

export type Picked = { name: string; dataUrl: string | null; isImage: boolean; uri?: string; mime?: string; size?: number;
  /** Listelerdeki küçük önizleme için 320 px kopya (yüklemede ayrıca saklanır; bkz. backend.js → storeFile). */
  thumb?: string | null };

/** Küçültme ayarı (tüm görseller): uzun kenar 1280 px, WebP kalite 0,75 (JPEG yedeği 0,70). Tipik bir telefon fotoğrafı
    ≈ 2 MB'tan ≈ 55 KB'a iner; dekont ve belgelerdeki yazılar okunur kalır. */
type Preset = { max: number; webp: number; jpeg: number };
const PHOTO: Preset = { max: 1280, webp: 0.75, jpeg: 0.7 };
const DOC: Preset = PHOTO;
/** Küçük önizleme: listelerdeki 48–120 px kareler için (yüksek çözünürlüklü ekranda da net). */
const THUMB: Preset = { max: 320, webp: 0.7, jpeg: 0.7 };
const thumbOf = (dataUrl: string | null) => (dataUrl ? shrink(dataUrl, THUMB) : Promise.resolve(null));

/** Görselin boyutu (px); okunamazsa null. */
function dimsOf(uri: string, w?: number, h?: number): Promise<[number, number] | null> {
  if (w && h) return Promise.resolve([w, h]);
  return new Promise((res) => Image.getSize(uri, (a, b) => res([a, b]), () => res(null)));
}

/** Görseli uzun kenarı `max` px olacak şekilde küçültür (zaten küçükse büyütmez, yalnızca yeniden sıkıştırır).
    Web'de WebP denenir (aynı kalitede çok daha küçük); tarayıcı WebP üretemezse (bazı Safari sürümleri sessizce PNG verir)
    JPEG'e dönülür. WebP dosyası "RIFF" (base64: UklGR) ile başlar. */
async function shrink(uri: string, preset: Preset, w?: number, h?: number): Promise<string | null> {
  const ImageManipulator = await manipulator();
  const dims = await dimsOf(uri, w, h);
  const actions: ImageManipulatorT.Action[] = !dims ? [{ resize: { width: preset.max } }]
    : Math.max(dims[0], dims[1]) <= preset.max ? []
    : dims[0] >= dims[1] ? [{ resize: { width: preset.max } }] : [{ resize: { height: preset.max } }];
  const run = (format: ImageManipulatorT.SaveFormat, compress: number) => ImageManipulator.manipulateAsync(uri, actions, { compress, format, base64: true });
  try {
    if (Platform.OS === 'web') {
      const wp = await run(ImageManipulator.SaveFormat.WEBP, preset.webp);
      if (wp.base64 && wp.base64.startsWith('UklGR')) return 'data:image/webp;base64,' + wp.base64;
    }
    const r = await run(ImageManipulator.SaveFormat.JPEG, preset.jpeg);
    return r.base64 ? 'data:image/jpeg;base64,' + r.base64 : null;
  } catch { return null; }
}

/** Tarayıcıda görseli doğrudan hedef boyutta çizer (tam boyutlu bir tuval açmaz). Telefon fotoğrafları büyüktür (12-48 MP);
    iPhone Safari'de tam boyutlu tuval sınırı aşılınca klasik küçültme sessizce başarısız olur. Bu yol o sınıra takılmaz. */
async function shrinkCanvas(uri: string, preset: Preset): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  try {
    const img = document.createElement('img');
    img.decoding = 'async';
    img.src = uri;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const k = Math.min(1, preset.max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let out = canvas.toDataURL('image/webp', preset.webp);
    if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', preset.jpeg);   // WebP üretemeyen tarayıcı PNG verir
    canvas.width = canvas.height = 0;
    return out.length > 64 ? out : null;
  } catch { return null; }
}

/** Görseli yüklenebilir boyuta getirir: önce tam çözünürlük hedefi, olmazsa giderek daha küçük hedefler (1280 → 1024 → 800 → 600 px);
    her kademede önce tuval yolu, sonra klasik küçültme denenir. Hepsi başarısız olursa null. */
async function shrinkRobust(uri: string, preset: Preset, w?: number, h?: number): Promise<string | null> {
  for (const max of [preset.max, 1024, 800, 600].filter((m, i, a) => m <= preset.max && a.indexOf(m) === i)) {
    const p = { ...preset, max };
    const r = (await shrinkCanvas(uri, p)) ?? (await shrink(uri, p, w, h));
    if (r) return r;
  }
  return null;
}

async function fromAssets(assets: ImagePickerT.ImagePickerAsset[], max: number, onStart?: (n: number) => void): Promise<Picked[]> {
  const out: Picked[] = [];
  onStart?.(Math.min(assets.length, max));
  for (const a of assets.slice(0, max)) {
    const dataUrl = await shrinkRobust(a.uri, PHOTO, a.width, a.height);
    if (!dataUrl) { host.notify({ title: t('Fotoğraf işlenemedi'), body: t('Bu fotoğraf küçültülemedi. Başka bir fotoğraf dene ya da ekran görüntüsü al.'), icon: 'doc' }); continue; }
    out.push({ name: a.fileName || 'foto.jpg', dataUrl, isImage: true, thumb: await thumbOf(dataUrl) });
  }
  return out;
}

/** `onStart`: fotoğraf seçildi ve hazırlanmaya başlandı (arayüz bekleme göstergesi gösterir). */
export async function pickImages(max = 4, onStart?: (n: number) => void): Promise<Picked[]> {
  const ImagePicker = await picker();
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: max > 1, selectionLimit: max, quality: 0.8 });
  return r.canceled ? [] : fromAssets(r.assets, max, onStart);
}

export async function takePhoto(onStart?: (n: number) => void): Promise<Picked[]> {
  try {
    const ImagePicker = await picker();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return [];
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return r.canceled ? [] : fromAssets(r.assets, 1, onStart);
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
  const dataUrl = isImage ? await shrinkRobust(a.uri, DOC, (a as any).width, (a as any).height) : null;
  return { name: a.name, dataUrl, isImage, uri: a.uri, mime: a.mimeType || undefined, size: a.size || undefined, thumb: isImage ? await thumbOf(dataUrl) : null };
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
