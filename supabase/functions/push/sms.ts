// SMS gönderimi (kira, sözleşme, DASK ve tahliye hatırlatmaları). Sağlayıcı ortam değişkeniyle seçilir:
//   SMS_PROVIDER=netgsm  → NETGSM_USER, NETGSM_PASS, NETGSM_HEADER (onaylı gönderici başlığı, ör. ANAHTAR)
//   SMS_PROVIDER=twilio  → TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
// Bilgilendirme amaçlı (işlem) SMS'ler için İYS onayı gerekmez; ticari ileti gönderilmez.
const env = (k: string) => Deno.env.get(k) ?? '';

/** Türkiye numaralarını 905XXXXXXXXX biçimine getirir; geçersizse null. */
export function normalizeTr(phone: string): string | null {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '9' + d;
  if (d.startsWith('5') && d.length === 10) d = '90' + d;
  return /^905\d{9}$/.test(d) ? d : null;
}

export const smsEnabled = () => !!env('SMS_PROVIDER');

export async function sendSms(phone: string, text: string): Promise<boolean> {
  const to = normalizeTr(phone);
  if (!to) return false;
  const msg = text.length > 300 ? text.slice(0, 297) + '…' : text;
  const p = env('SMS_PROVIDER');
  if (p === 'netgsm') {
    const res = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(env('NETGSM_USER') + ':' + env('NETGSM_PASS')) },
      body: JSON.stringify({ msgheader: env('NETGSM_HEADER'), encoding: 'TR', iysfilter: '0', messages: [{ msg, no: to }] })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || String(body.code ?? '00') !== '00') { console.error('netgsm hatası', res.status, JSON.stringify(body)); return false; }
    return true;
  }
  if (p === 'twilio') {
    const sid = env('TWILIO_SID');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(sid + ':' + env('TWILIO_TOKEN')), 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: '+' + to, From: env('TWILIO_FROM'), Body: msg })
    });
    if (!res.ok) { console.error('twilio hatası', res.status, await res.text()); return false; }
    return true;
  }
  return false;
}
