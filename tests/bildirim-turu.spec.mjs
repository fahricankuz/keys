// Bildirim türü (ses, Android kanalı, uygulama içi simge): uygulama ve sunucu kopyası aynı kuralı uygular; ses dosyaları ve app.json eşleşir.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { notifyKind as appKind, NOTIFY_KINDS as APP_KINDS } from '../app/src/domain/notify-kind.js';
import { notifyKind as srvKind, NOTIFY_KINDS as SRV_KINDS, apnsSound, fcmChannel } from '../supabase/functions/push/kind.ts';

const CASES = [
  [{ tag: 'rent-due-p1-2026-12', title: 'Kira günü' }, 'hatirlatma'],
  [{ tag: 'aidat-late-9', title: 'B12: aidat gecikti' }, 'hatirlatma'],
  [{ tag: 'trial-3', title: 'Deneme süren 3 gün sonra bitiyor' }, 'hatirlatma'],
  [{ tag: 'bill-issue-20261122', title: 'Ödemende sorun var' }, 'hatirlatma'],
  [{ tag: 'bill-plan-1', title: 'Paketin tanımlandı' }, 'odeme'],
  [{ tag: null, title: 'Ödemen onaylandı', url: '/uygulama' }, 'odeme'],
  [{ tag: null, title: 'Dekont reddedildi' }, 'odeme'],
  [{ tag: null, title: 'Yeni mesaj', url: '/uygulama/mesajlar' }, 'mesaj'],
  [{ tag: 'req-1', title: 'Yeni talep', url: '/uygulama/talepler' }, 'talep'],
  [{ tag: null, title: 'Talep güncellendi' }, 'talep'],
  [{ tag: 'hukuk-4', title: 'Hukuki talebin yanıtlandı' }, 'talep'],
  [{ tag: null, title: 'Genel kurul çağrısı', url: '/uygulama/sitem' }, 'duyuru'],
  [{ tag: null, title: 'Yeni duyuru: su kesintisi' }, 'duyuru'],
  [{ tag: null, title: 'Oylama açıldı' }, 'duyuru'],
  [{ tag: null, title: 'Yeni belge', url: '/uygulama/belgeler' }, 'belge'],
  [{ tag: null, title: 'Kira sözleşmesi hazır' }, 'belge'],
  [{ tag: null, title: 'Kira günü yaklaşıyor' }, 'hatirlatma'],
  [{ tag: null, title: 'Hesabın yeniden açıldı', url: '/uygulama' }, 'genel'],
  [null, 'genel'],
  [{}, 'genel'],
];

test('uygulama ve sunucu aynı türü bulur; türler aynı', () => {
  expect(SRV_KINDS).toEqual(APP_KINDS);
  for (const [n, want] of CASES) {
    expect(appKind(n), JSON.stringify(n)).toBe(want);
    expect(srvKind(n), JSON.stringify(n)).toBe(want);
  }
});

test('ses ve kanal: türün dosyası/kanalı, bilinmeyende varsayılan', () => {
  expect(apnsSound('odeme')).toBe('odeme.wav');
  expect(apnsSound('genel')).toBe('default');
  expect(fcmChannel('mesaj')).toBe('mesaj');
  expect(fcmChannel('genel')).toBe('evim');
});

test('her türün ses dosyası var, kısa (≤ 30 sn, iOS sınırı) ve app.json → expo-notifications.sounds listesinde', () => {
  const app = JSON.parse(readFileSync(new URL('../app/app.json', import.meta.url)));
  const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
  const listed = plugin[1].sounds;
  for (const k of APP_KINDS) {
    const rel = './assets/sounds/' + k + '.wav';
    expect(listed).toContain(rel);
    const file = new URL('../app/' + rel.slice(2), import.meta.url);
    expect(existsSync(file)).toBe(true);
    const b = readFileSync(file);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    const rate = b.readUInt32LE(24), bytes = b.readUInt32LE(40), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34);
    expect(bytes / (rate * ch * bits / 8)).toBeLessThanOrEqual(30);
  }
  expect(listed.length).toBe(APP_KINDS.length);
});
