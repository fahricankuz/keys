// Telefon uygulamasına anlık bildirim: iOS için APNs, Android için FCM (HTTP v1).
//
// Gizli değişkenler (yalnızca ilgili platform kullanılacaksa):
//   APNS_KEY        — App Store Connect → Keys → APNs anahtarı (.p8 dosyasının içeriği)
//   APNS_KEY_ID     — anahtar kimliği (10 karakter)
//   APNS_TEAM_ID    — Apple ekip kimliği
//   APNS_BUNDLE_ID  — uygulama kimliği (varsayılan online.kiracim.app)
//   APNS_SANDBOX    — "1": Xcode'dan kurulan geliştirme sürümleri için
//   FCM_SERVICE_ACCOUNT — Firebase → Project settings → Service accounts → JSON anahtarının içeriği

import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

const env = (k: string) => Deno.env.get(k) ?? '';

export type Note = { title: string; body: string; url: string; tag?: string | null };
/** Gönderim sonucu: 'ok', 'gone' (anahtar geçersiz, silinmeli) ya da hata. */
export type Result = 'ok' | 'gone' | 'error' | 'skipped';

/* ---- APNs ---- */

let apnsJwt: { token: string; at: number } | null = null;

async function apnsToken(): Promise<string> {
  // Apple aynı anahtarın 20-60 dakikada bir yenilenmesini ister.
  if (apnsJwt && Date.now() - apnsJwt.at < 45 * 60 * 1000) return apnsJwt.token;
  const key = await importPKCS8(env('APNS_KEY').replace(/\\n/g, '\n'), 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env('APNS_KEY_ID') })
    .setIssuer(env('APNS_TEAM_ID'))
    .setIssuedAt()
    .sign(key);
  apnsJwt = { token, at: Date.now() };
  return token;
}

export async function sendApns(deviceToken: string, n: Note): Promise<Result> {
  if (!env('APNS_KEY')) return 'skipped';
  const host = env('APNS_SANDBOX') === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: 'POST',
    headers: {
      authorization: 'bearer ' + await apnsToken(),
      'apns-topic': env('APNS_BUNDLE_ID') || 'online.kiracim.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      ...(n.tag ? { 'apns-collapse-id': n.tag.slice(0, 64) } : {}),
    },
    body: JSON.stringify({
      aps: { alert: { title: n.title, body: n.body }, sound: 'default', 'thread-id': n.tag ?? 'evim' },
      url: n.url,
    }),
  });
  if (res.ok) return 'ok';
  const reason = (await res.json().catch(() => ({}))).reason;
  if (res.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') return 'gone';
  console.error('APNs', res.status, reason);
  return 'error';
}

/* ---- FCM ---- */

let fcmAuth: { token: string; exp: number; project: string } | null = null;

async function fcmAccess(): Promise<{ token: string; project: string }> {
  if (fcmAuth && Date.now() < fcmAuth.exp) return fcmAuth;
  const sa = JSON.parse(env('FCM_SERVICE_ACCOUNT'));
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error('FCM oturumu alınamadı: ' + res.status);
  const j = await res.json();
  fcmAuth = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000, project: sa.project_id };
  return fcmAuth;
}

export async function sendFcm(deviceToken: string, n: Note): Promise<Result> {
  if (!env('FCM_SERVICE_ACCOUNT')) return 'skipped';
  const { token, project } = await fcmAccess();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title: n.title, body: n.body },
        data: { url: n.url },
        android: { priority: 'high', notification: { tag: n.tag ?? undefined, channel_id: 'evim' } },
      },
    }),
  });
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => ({}));
  const status = err?.error?.status;
  if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNREGISTERED') return 'gone';
  console.error('FCM', res.status, JSON.stringify(err).slice(0, 300));
  return 'error';
}
