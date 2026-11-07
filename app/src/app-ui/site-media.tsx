/* Site talebi ve yazışması: fotoğraf ve video ekleri.
   MediaPicker: ek seçimi (fotoğraf, telefonda kamera, video); en çok 6 dosya, en çok 2 video, video 40 MB.
   MediaList: kayıtlı eklerin gösterimi: fotoğraf küçük resim olarak, video "Videoyu oynat" ile (web'de sayfa içinde oynar,
   telefonda sistem oynatıcısı açılır). Dosyalar sitenin klasöründedir; imzalı adresle açılır. */
import { createElement, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { t } from '../domain/i18n';
import { fileUrl, humanError } from '../domain/backend';
import { SB } from '../domain/mapping';
import { isVideoPath } from '../domain/site';
import { Button, Text } from '../ui/kit';
import { radius, useColors } from '../ui/theme';
import { Icon, IconBtn, Muted, Row, Thumbs } from './blocks';
import { Picked, pickImages, pickVideo, takePhoto } from './media';

const MAX_FILES = 6, MAX_VIDEOS = 2;

export function MediaPicker({ files, setFiles }: { files: Picked[]; setFiles: (f: Picked[]) => void }) {
  const c = useColors();
  const videos = files.filter((f) => f.isVideo).length;
  const room = MAX_FILES - files.length;
  return (
    <View style={{ gap: 8 }}>
      <Row wrap>
        <Button kind="ghost" title={t('Fotoğraf ekle')} icon={<Icon name="cam" size={16} />} disabled={room <= 0}
          onPress={async () => { const f = await pickImages(room); if (f.length) setFiles([...files, ...f].slice(0, MAX_FILES)); }} />
        {Platform.OS !== 'web' ? <Button kind="ghost" title={t('Kamerayla çek')} icon={<Icon name="cam" size={16} />} disabled={room <= 0}
          onPress={async () => { const f = await takePhoto(); if (f.length) setFiles([...files, ...f].slice(0, MAX_FILES)); }} /> : null}
        <Button kind="ghost" title={t('Video ekle')} icon={<Icon name="cam" size={16} />} disabled={room <= 0 || videos >= MAX_VIDEOS}
          onPress={async () => { const f = await pickVideo(); if (f) setFiles([...files, f].slice(0, MAX_FILES)); }} />
      </Row>
      {files.length ? (
        <View style={{ gap: 4 }}>
          {files.map((f, i) => (
            <Row key={f.name + i} gap={8}>
              <Text v="small" style={{ flex: 1 }} numberOfLines={1}>{f.isVideo ? t('Video') + ': ' : ''}{f.name}</Text>
              <IconBtn name="x" size={16} label={t('{x} dosyasını kaldır', { x: f.name })} onPress={() => setFiles(files.filter((_, j) => j !== i))} />
            </Row>
          ))}
        </View>
      ) : <Muted>{t('Fotoğraf ve video ekleyebilirsin (en çok {n} dosya, video en çok 40 MB).', { n: MAX_FILES })}</Muted>}
    </View>
  );
}

function VideoItem({ path }: { path: string }) {
  const c = useColors();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const play = async () => {
    setErr(null);
    try {
      const u = await fileUrl(SB + path);
      if (!u) { setErr(t('Video şu an açılamıyor.')); return; }
      if (Platform.OS === 'web') setUrl(u); else Linking.openURL(u).catch(() => setErr(t('Video şu an açılamıyor.')));
    } catch (e) { setErr(humanError(e)); }
  };
  if (url) return (
    <View style={{ width: '100%', maxWidth: 420 }}>
      {createElement('video', { src: url, controls: true, autoPlay: true, playsInline: true, preload: 'metadata', 'aria-label': t('Talep videosu'), style: { width: '100%', borderRadius: radius.md, backgroundColor: '#000' } })}
    </View>
  );
  return (
    <View style={{ gap: 4 }}>
      <Button kind="ghost" title={t('Videoyu oynat')} onPress={play} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

/** Kayıtlı ekler (depo yolları): fotoğraflar küçük resim, videolar oynatılabilir. */
export function MediaList({ paths }: { paths?: string[] | null }) {
  const list = paths || [];
  if (!list.length) return null;
  const photos = list.filter((p) => !isVideoPath(p)).map((p) => SB + p);
  const videos = list.filter(isVideoPath);
  return (
    <View style={{ gap: 8 }}>
      {photos.length ? <Thumbs srcs={photos} size={96} /> : null}
      {videos.map((p) => <VideoItem key={p} path={p} />)}
    </View>
  );
}
