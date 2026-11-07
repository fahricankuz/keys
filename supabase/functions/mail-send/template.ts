// anahtar — gönderim kuyruğundaki e-postaların (mail_outbox) HTML'i: hesap silindi, ekibe paket seçimi, kurum yöneticisi daveti,
// yatırımcı raporu özeti ("Mailime gönder"), yönetici panelinden yazılan ileti (admin_message).
// Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir). E-posta istemcileri için: tablo düzeni, satır içi stil, sistem yazı tipi.
// Müşteriye giden iletiler kırmızı bantta kırmızı zeminli logoyla (anahtar-logo-mail-kirmizi.png) gelir; karanlık modda da bozulmaz.

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#8A807B', kil: '#E8DDD5', krem: '#F3ECE5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const LOGO = 'https://anahtar.io/mail/anahtar-logo-mail-kirmizi.png';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const trimUrl = (u?: string) => (u || 'https://anahtar.io').replace(/\/+$/, '');

export type OutboxRow = { kind: string; lang?: string; data?: Record<string, unknown> };
export type Mail = { subject: string; html: string; text: string };

type Layout = { lang: string; title: string; lead: string[]; rows?: [string, string][]; button?: { label: string; url: string }; note?: string; foot: string };
function layout(o: Layout): string {
  const rows = (o.rows ?? []).filter(([, v]) => String(v ?? '').trim());
  return `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.kart};border:1px solid ${C.kil};border-radius:24px;overflow:hidden">
<tr><td bgcolor="${C.tugla}" style="background:${C.tugla};padding:22px 28px"><img src="${LOGO}" width="168" height="31" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none">
<div style="font:800 24px/1.25 ${FONT};color:${C.kirec};margin-top:12px">${esc(o.title)}</div></td></tr>
<tr><td style="padding:24px 28px 8px">${o.lead.map((p, i) => `<div style="font:400 16px/1.6 ${FONT};color:${i === 0 ? C.baca : C.kahve};margin-top:${i ? 8 : 0}px;white-space:pre-line">${esc(p)}</div>`).join('')}</td></tr>
${rows.length ? `<tr><td style="padding:8px 28px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:400 15px/1.5 ${FONT}">${rows.map(([k, v]) =>
    `<tr><td style="padding:5px 0;color:${C.kahve};width:38%;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:${C.baca};font-weight:600">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : ''}
${o.button ? `<tr><td style="padding:18px 28px 6px"><a href="${esc(o.button.url)}" style="display:inline-block;background:${C.tugla};color:#ffffff;text-decoration:none;font:700 15px ${FONT};padding:13px 26px;border-radius:999px">${esc(o.button.label)}</a></td></tr>` : ''}
${o.note ? `<tr><td style="padding:14px 28px 0"><div style="font:400 14px/1.55 ${FONT};color:${C.kahve}">${esc(o.note)}</div></td></tr>` : ''}
<tr><td style="padding:0 28px 26px"><div style="height:8px"></div></td></tr>
</table>
<div style="font:400 12px/1.5 ${FONT};color:${C.duman};margin-top:14px;text-align:center">${esc(o.foot)}</div>
</td></tr></table></body></html>`;
}

const plain = (o: Layout) => [...o.lead, '', ...(o.rows ?? []).filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => `${k}: ${v}`),
  o.button ? `\n${o.button.label}: ${o.button.url}` : '', o.note ? `\n${o.note}` : '', '', '— anahtar'].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');

const PLAN: Record<string, string> = { tek: 'Başlangıç', bes: 'Profesyonel', kurumsal: 'Kurumsal' };

/** Kuyruk satırının e-postası. Bilinmeyen tür null döner (gönderilmez). */
export function renderOutbox(row: OutboxRow, appUrl?: string, contact = 'info@anahtar.io'): Mail | null {
  const en = row.lang === 'en';
  const d = (row.data ?? {}) as Record<string, any>;
  const app = trimUrl(appUrl);
  const foot = en ? 'anahtar · The key to your rentals · anahtar.io' : 'anahtar · Kira işinin anahtarı · anahtar.io';
  const lg = en ? 'en' : 'tr';
  const first = String(d.name ?? '').trim().split(/\s+/)[0] || '';
  let L: Layout, subject: string;

  if (row.kind === 'account_deleted') {
    const admin = d.by === 'admin';
    const hello = en ? (first ? `Hi ${first},` : 'Hi,') : (first ? `Merhaba ${first},` : 'Merhaba,');
    subject = en ? 'Your anahtar account has been deleted' : 'anahtar hesabın silindi';
    L = en
      ? { lang: lg, foot, title: 'Your account has been deleted',
          lead: [hello, admin ? 'Your anahtar account was suspended and then deleted by our team.' : 'As you requested, your anahtar account has been deleted.',
                 'Your account data and the properties you owned were removed. Messages you sent in other people’s properties are kept for their records without your name.'],
          rows: admin && d.reason ? [['Reason', String(d.reason)]] : [],
          note: `If you did not expect this e-mail or think there is a mistake, write to ${contact}. Thank you for using anahtar.` }
      : { lang: lg, foot, title: 'Hesabın silindi',
          lead: [hello, admin ? 'anahtar hesabın, ekibimiz tarafından askıya alındıktan sonra silindi.' : 'Talebin üzerine anahtar hesabın silindi.',
                 'Hesap bilgilerin ve sahibi olduğun mülkler kaldırıldı. Başkalarının mülklerinde yazdığın mesajlar, onların kayıtları için adın olmadan saklanır.'],
          rows: admin && d.reason ? [['Gerekçe', String(d.reason)]] : [],
          note: `Bu e-postayı beklemiyorsan ya da bir yanlışlık olduğunu düşünüyorsan ${contact} adresine yaz. anahtar’ı kullandığın için teşekkürler.` };
    return { subject, html: layout(L), text: plain(L) };
  }

  if (row.kind === 'plan_choice') {
    const plan = PLAN[String(d.plan)] ?? String(d.plan ?? '');
    const units = String(d.units ?? '');
    subject = `Yeni paket seçimi: ${d.name || d.email || 'kullanıcı'} → ${plan}${units ? ' · ' + units + ' mülk' : ''}`;
    L = { lang: 'tr', foot, title: 'Yeni paket seçimi',
      lead: [`${d.name || 'Bir kullanıcı'} satın alma sayfasında paket seçti.`, 'Henüz ödeme yapılmadı; ödeme yapıldığında abonelik kendiliğinden tanımlanır.'],
      rows: [['Ad', String(d.name ?? '')], ['E-posta', String(d.email ?? '')], ['Paket', plan], ['Mülk adedi', units], ['Dönem', d.yearly ? 'Yıllık' : 'Aylık']],
      button: { label: 'Yönetici panelinde aç', url: app + '/admin' },
      note: 'Aboneliği kendin tanımlamak istersen yönetici paneli → Abonelikler → Paket ver.' };
    return { subject, html: layout(L), text: plain(L) };
  }

  if (row.kind === 'org_master_invite') {
    const code = String(d.code ?? '');
    subject = en ? `You were invited to manage ${d.org || 'an organization'} on anahtar` : `${d.org || 'Kurum'} için anahtar yönetici davetin`;
    const url = `${app}/katil?kod=${encodeURIComponent(code)}`;
    L = en
      ? { lang: lg, foot, title: 'You are invited as organization manager',
          lead: ['Hi,', `You were invited to manage ${d.org || 'an organization'} on anahtar. Create an account (or sign in) with this e-mail address and join with the invitation link below.`],
          rows: [['Organization', String(d.org ?? '')], ['Invitation code', code]],
          button: { label: 'Accept the invitation', url }, note: `If you were not expecting this, you can ignore the e-mail or write to ${contact}.` }
      : { lang: lg, foot, title: 'Kurum yöneticisi olarak davet edildin',
          lead: ['Merhaba,', `${d.org || 'Bir kurum'} için anahtar yöneticisi olarak davet edildin. Bu e-posta adresiyle hesap aç (ya da giriş yap) ve aşağıdaki davet bağlantısıyla katıl.`],
          rows: [['Kurum', String(d.org ?? '')], ['Davet kodu', code]],
          button: { label: 'Daveti kabul et', url }, note: `Bu e-postayı beklemiyorsan görmezden gelebilir ya da ${contact} adresine yazabilirsin.` };
    return { subject, html: layout(L), text: plain(L) };
  }
  if (row.kind === 'admin_message') {
    // Yönetici panelinde yazılan ileti: konu ve paragraflar olduğu gibi (layout kaçışlar); yanıt adresi info@anahtar.io.
    const paras = String(d.body ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
    subject = String(d.subject ?? '').replace(/[\r\n]+/g, ' ').trim() || 'anahtar';
    L = { lang: 'tr', foot, title: subject, lead: paras.length ? paras : [''],
          note: `Bu e-postayı yanıtlayarak bize yazabilirsin (${contact}).` };
    return { subject, html: layout(L), text: plain(L) };
  }

  if (row.kind === 'investor_report') {
    // Özet değerleri uygulamada biçimlenir (para birimi ve yüzde); burada yalnız gösterilir (layout kaçışlar).
    const period = /^\d{4}(-Q[1-4])?$/.test(String(d.period ?? '')) ? String(d.period) : '';
    const url = `${app}/uygulama/site/yatirimci${period ? '?donem=' + encodeURIComponent(period) : ''}`;
    const label = String(d.label ?? period);
    const v = (k: string) => String(d[k] ?? '');
    subject = en ? `${d.org || 'anahtar'} · Investor report · ${label}` : `${d.org || 'anahtar'} · Yatırımcı raporu · ${label}`;
    L = en
      ? { lang: lg, foot, title: `Investor report · ${label}`,
          lead: ['Hi,', `Here is the summary of the ${d.org || ''} investor report. Open the report to download the A4 PDF.`],
          rows: [['Period revenue', v('revenue')], ['NOI', v('noi')], ['NOI margin', v('margin')], ['Occupancy (m²)', v('occupancy')], ['WALE', v('wale')],
                 ['Collection rate', v('collection')], ['Receivables over 30 days', v('receivables')], ['FX difference', v('fx_diff')],
                 [`Previous period (${v('prev_label')})`, v('prev_revenue')]],
          button: { label: 'Open the report', url },
          note: 'Amounts at the CBRT selling rate of each transaction’s day. This report does not replace audited financial statements or a valuation report.' }
      : { lang: lg, foot, title: `Yatırımcı raporu · ${label}`,
          lead: ['Merhaba,', `${d.org || ''} yatırımcı raporunun özeti aşağıda. A4 PDF’i indirmek için raporu aç.`],
          rows: [['Dönem geliri', v('revenue')], ['NOI', v('noi')], ['NOI marjı', v('margin')], ['Doluluk (m²)', v('occupancy')], ['WALE', v('wale')],
                 ['Tahsilat oranı', v('collection')], ['30 günü geçen alacak', v('receivables')], ['Kur farkı', v('fx_diff')],
                 [`Önceki dönem (${v('prev_label')})`, v('prev_revenue')]],
          button: { label: 'Raporu aç', url },
          note: 'Tutarlar her işlemin kendi gününün TCMB döviz satış kuruyla çevrilmiştir. Bu rapor denetlenmiş finansal tablo ya da değerleme raporu yerine geçmez.' };
    return { subject, html: layout(L), text: plain(L) };
  }
  return null;
}
