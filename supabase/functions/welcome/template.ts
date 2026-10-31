// anahtar — hoş geldin e-postasının HTML'i. Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir).
// Tür: kiracı, mülk sahibi (seçtiği pakete göre: Başlangıç ya da Profesyonel) ve ekip üyesi.
// E-posta istemcileri için: tablo düzeni, satır içi stil, SVG ve görsel yok, sistem yazı tipi (report/template.ts ile aynı dil).

export type WelcomeKind = 'tenant' | 'tek' | 'bes' | 'team';
export type WelcomeInput = { kind: WelcomeKind; name?: string; lang?: string; appUrl: string; trialEnds?: string | null };

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95',
            kil: '#E8DDD5', fesKoyu: '#2A6B3A', bal: '#F2B544', gulKoyu: '#A8231F', zemin: '#F3ECE5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
/** Marka logosu (kenarlıksız, koyu zeminli; anahtar.io/mail altında yayında durur). */
const LOGO_URL = 'https://anahtar.io/mail/anahtar-logo-mail-v2.png';

type Pair = [string, string];
type Copy = {
  subject: string; badge: string; title: string; lead: string; steps: Pair[]; feats: Pair[]; ps: string;
  plan?: { name: string; price: string; points: string[]; note: (end: string | null) => string };
};
type Lang = {
  hi: (n: string) => string; first: string; can: string; cta: string; pwa: string; help: (mail: string, center: string) => string;
  mail: string; center: string; foot: string; chosen: string; date: (d: Date) => string; kinds: Record<WelcomeKind, Copy>;
};

const TXT: Record<'tr' | 'en', Lang> = {
  tr: {
    hi: (n) => (n ? `Merhaba ${n},` : 'Merhaba,'), first: 'İlk adımlar', can: 'Neler yapabilirsin', cta: 'Panelime git',
    pwa: 'Telefonuna da ekleyebilirsin: tarayıcıda “Ana ekrana ekle”.',
    help: (m, c) => `Sorunda ${m} adresine yazabilir ya da ${c} bakabilirsin.`, mail: 'info@anahtar.io', center: 'destek merkezine',
    foot: 'anahtar · Kira işinin anahtarı · anahtar.io', chosen: 'Seçtiğin paket',
    date: (d) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }),
    kinds: {
      tenant: {
        subject: 'Hoş geldin! Kiran artık tek yerde', badge: 'Kiracı hesabı · her zaman ücretsiz', title: 'Hoş geldin, kiran artık tek yerde.',
        lead: 'Kira ödemelerin, arıza talepleri, belgeler ve ev sahibinle yazışmaların anahtar’da düzenli duruyor.',
        steps: [
          ['Evine bağlan', 'Ev sahibinden davet kodunu iste ve panelde gir. Ev sahibin anahtar kullanmıyorsa uygulamadan ona WhatsApp ile öneri gönderebilirsin.'],
          ['Kirayı öde, dekontu yükle', 'Ödemeler ekranında “Dekont yükle”ye bas; fotoğraf ya da PDF yeter. Onaylanınca ay yeşile döner.'],
          ['Bir şey bozulursa talep aç', 'Fotoğrafını ekle; ev sahibin teklifleri ve masrafı aynı ekranda paylaşır, sen adım adım izlersin.']
        ],
        feats: [
          ['Ödemeler', 'Hangi ay ödendi, hangisi bekliyor; kira günü yaklaşınca hatırlatma.'], ['Talepler', 'Arıza ve bakımı fotoğrafla bildir, durumunu izle.'],
          ['Belgeler', 'Sözleşme, giriş tutanağı, faturalar her zaman yanında.'], ['Mesajlar', 'Ev sahibinle yazışmalar kayıtlı ve düzenli.'],
          ['Giriş ve çıkış tutanağı', 'Oda oda fotoğraf; çıkışta depozito hesabı adil.'], ['Kira artışı', 'Yasal üst sınırı (TÜFE) iki taraf aynı hesapla görür.']
        ],
        ps: 'Kiracı hesabın için hiçbir zaman ücret ödemezsin.'
      },
      tek: {
        subject: 'Hoş geldin! Başlangıç paketin hazır', badge: 'Başlangıç paketi · 1 ay ücretsiz deneme', title: 'Hoş geldin, kira işin artık anahtar’da.',
        lead: 'Ödemeler, talepler, belgeler ve sözleşmeler tek panelde; kiracın da kendi tarafından aynı veriyi görür.',
        steps: [
          ['Mülkünü ekle', 'Adres, kira, ödeme günü ve depozito; 1 dakika sürer.'],
          ['Kiracını davet et', 'Davet kodunu WhatsApp ya da SMS ile gönder; kiracın ücretsiz katılır.'],
          ['Ödemeleri izle', 'Dekont geldiğinde bildirim alırsın, tek dokunuşla onaylarsın.']
        ],
        feats: [
          ['Kira takibi', 'Ay ay tahsilat, gecikme ve kısmi ödeme.'], ['Hatırlatmalar', 'Kira günü, sözleşme yenileme, DASK ve sigorta.'],
          ['Talepler', 'Arıza, teklif ve masraf kararı tek akışta.'], ['Belgeler', 'Sözleşme ve poliçeler bitiş tarihleriyle.'],
          ['Tutanak ve depozito', 'Giriş-çıkış karşılaştırması ve iade hesabı.'], ['Giderler', 'Mülk başına masraf kaydı.']
        ],
        plan: {
          name: 'Başlangıç', price: 'Mülk başına ayda ₺99,99 (KDV dahil). 1-9 mülk için.',
          points: ['Ödeme, talep, belge ve tutanak', 'Sözleşme yenileme ve TÜFE hesabı', 'Hatırlatmalar ve gider kayıtları'],
          note: (end) => (end ? `Deneme süresi ${end} tarihine kadar. ` : '') + 'Ekip üyeleri, Excel ile toplu aktarma, net getiri raporu ve SMS hatırlatmaları için Profesyonel’e istediğin zaman geçebilirsin.'
        },
        ps: 'Deneme bitince kayıtların silinmez; paket seçmezsen salt okunur olur.'
      },
      bes: {
        subject: 'Hoş geldin! Profesyonel paketin hazır', badge: 'Profesyonel paketi · 1 ay ücretsiz deneme', title: 'Hoş geldin, portföyün artık tek panelde.',
        lead: 'Profesyonel ile ekibini ekler, mülklerini toplu aktarır, net getirini ve vergini önceden görürsün.',
        steps: [
          ['Mülklerini aktar', 'Excel dosyanı yükle; tüm mülk ve kiracılar tek seferde gelsin.'],
          ['Ekibini ekle', 'Emlakçı, muhasebeci ve personeli rol vererek davet et; ekip hesapları ücretsiz.'],
          ['Kiracılarını davet et', 'Davet kodlarını gönder; ödemeler ve talepler panelinde toplansın.']
        ],
        feats: [
          ['Ekip üyeleri', 'Rol ve mülk bazında yetki.'], ['Excel ile toplu aktarma', 'Yüzlerce satır tek seferde.'],
          ['Net getiri ve yıllık rapor', 'Gelir, gider ve doluluk tek sayfada.'], ['Vergi tahmini', 'Kira geliri beyanı için yıllık hesap.'],
          ['SMS hatırlatmaları', 'Kira, aidat ve sözleşme için kiracıya SMS.'], ['Başlangıç’taki her şey', 'Ödeme, talep, belge, tutanak, yenileme.']
        ],
        plan: {
          name: 'Profesyonel', price: 'Mülk başına ayda ₺199,99 (KDV dahil). 1-9 mülk için.',
          points: ['Başlangıç’taki her şey', 'Ekip üyeleri ve roller', 'Excel ile toplu aktarma, net getiri ve yıllık rapor', 'Vergi tahmini ve SMS hatırlatmaları'],
          note: (end) => (end ? `Deneme süresi ${end} tarihine kadar. ` : '') + '10 ve üstü mülk için Kurumsal pakete geçmek istersen bize yaz.'
        },
        ps: 'Deneme bitince kayıtların silinmez; paket seçmezsen salt okunur olur.'
      },
      team: {
        subject: 'Hoş geldin! Ekip hesabın hazır', badge: 'Ekip hesabı · ücretsiz', title: 'Hoş geldin, ekibine katılmaya hazırsın.',
        lead: 'Mülk sahibinin sana verdiği mülkleri, verdiği yetkiyle yönetirsin: ödemeler, talepler, belgeler ve kiracı yazışmaları.',
        steps: [
          ['Ekibe katıl', 'Mülk sahibinden ekip davet kodunu iste ve panelde gir.'],
          ['Mülklerini gör', 'Sana verilen mülkler panelinde listelenir; rolün neyi yapabileceğini belirler.'],
          ['İşleri takip et', 'Dekontları, talepleri ve hatırlatmaları tek yerden izle.']
        ],
        feats: [
          ['Ödemeler', 'Tahsilat ve gecikmeleri izle.'], ['Talepler', 'Arıza ve teklifleri yönet.'],
          ['Belgeler', 'Sözleşme ve tutanaklara ulaş.'], ['Mesajlar', 'Kiracılarla yazış.']
        ],
        ps: 'Ekip hesapları her zaman ücretsizdir.'
      }
    }
  },
  en: {
    hi: (n) => (n ? `Hi ${n},` : 'Hi,'), first: 'First steps', can: 'What you can do', cta: 'Open my dashboard',
    pwa: 'You can add it to your phone too: “Add to Home Screen” in your browser.',
    help: (m, c) => `Need help? Write to ${m} or visit the ${c}.`, mail: 'info@anahtar.io', center: 'help center',
    foot: 'anahtar · The key to renting · anahtar.io', chosen: 'Your plan',
    date: (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' }),
    kinds: {
      tenant: {
        subject: 'Welcome! Your rent, all in one place', badge: 'Tenant account · always free', title: 'Welcome, your rent is now in one place.',
        lead: 'Your rent payments, repair requests, documents and messages with your landlord stay organised in anahtar.',
        steps: [
          ['Connect to your home', 'Ask your landlord for the invite code and enter it in the app. If they don’t use anahtar yet, you can suggest it to them on WhatsApp.'],
          ['Pay and upload the receipt', 'Tap “Upload receipt” on Payments; a photo or PDF is enough. Once approved, the month turns green.'],
          ['Report repairs', 'Add a photo; your landlord shares quotes and costs on the same screen and you follow each step.']
        ],
        feats: [
          ['Payments', 'Which months are paid and which are due; reminders before rent day.'], ['Requests', 'Report repairs with photos and follow progress.'],
          ['Documents', 'Lease, move-in report and bills always at hand.'], ['Messages', 'Conversations with your landlord, kept in order.'],
          ['Move-in and move-out reports', 'Room-by-room photos; a fair deposit calculation.'], ['Rent increase', 'Both sides see the same legal cap (CPI).']
        ],
        ps: 'Your tenant account is always free.'
      },
      tek: {
        subject: 'Welcome! Your Starter plan is ready', badge: 'Starter plan · 1-month free trial', title: 'Welcome, your rentals now live in anahtar.',
        lead: 'Payments, requests, documents and leases in one dashboard; your tenant sees the same data from their side.',
        steps: [
          ['Add your property', 'Address, rent, due day and deposit; it takes a minute.'],
          ['Invite your tenant', 'Send the invite code by WhatsApp or SMS; your tenant joins for free.'],
          ['Track payments', 'Get notified when a receipt arrives and approve it with one tap.']
        ],
        feats: [
          ['Rent tracking', 'Monthly collections, late and partial payments.'], ['Reminders', 'Rent day, lease renewal, earthquake and home insurance.'],
          ['Requests', 'Repairs, quotes and cost decisions in one flow.'], ['Documents', 'Leases and policies with expiry dates.'],
          ['Reports and deposit', 'Move-in vs move-out comparison and refund calculation.'], ['Expenses', 'Costs recorded per property.']
        ],
        plan: {
          name: 'Starter', price: '₺99.99 per property per month (VAT included). For 1-9 properties.',
          points: ['Payments, requests, documents and reports', 'Lease renewal and CPI calculation', 'Reminders and expense records'],
          note: (end) => (end ? `Your trial runs until ${end}. ` : '') + 'Switch to Professional any time for team members, Excel import, net yield reports and SMS reminders.'
        },
        ps: 'Your records are kept after the trial; without a plan they become read-only.'
      },
      bes: {
        subject: 'Welcome! Your Professional plan is ready', badge: 'Professional plan · 1-month free trial', title: 'Welcome, your portfolio is now in one dashboard.',
        lead: 'With Professional you add your team, import properties in bulk and see your net yield and taxes in advance.',
        steps: [
          ['Import your properties', 'Upload your Excel file; all properties and tenants arrive at once.'],
          ['Add your team', 'Invite agents, accountants and staff with roles; team accounts are free.'],
          ['Invite your tenants', 'Send invite codes; payments and requests gather in your dashboard.']
        ],
        feats: [
          ['Team members', 'Permissions by role and property.'], ['Excel import', 'Hundreds of rows at once.'],
          ['Net yield and annual report', 'Income, expenses and occupancy on one page.'], ['Tax estimate', 'Yearly figure for your rental income return.'],
          ['SMS reminders', 'SMS to tenants for rent, service charge and lease.'], ['Everything in Starter', 'Payments, requests, documents, reports, renewal.']
        ],
        plan: {
          name: 'Professional', price: '₺199.99 per property per month (VAT included). For 1-9 properties.',
          points: ['Everything in Starter', 'Team members and roles', 'Excel import, net yield and annual report', 'Tax estimate and SMS reminders'],
          note: (end) => (end ? `Your trial runs until ${end}. ` : '') + 'For 10 or more properties, write to us about the Enterprise plan.'
        },
        ps: 'Your records are kept after the trial; without a plan they become read-only.'
      },
      team: {
        subject: 'Welcome! Your team account is ready', badge: 'Team account · free', title: 'Welcome, you’re ready to join your team.',
        lead: 'You manage the properties the owner assigns to you, with the permissions they give: payments, requests, documents and tenant messages.',
        steps: [
          ['Join the team', 'Ask the owner for the team invite code and enter it in the app.'],
          ['See your properties', 'Assigned properties appear in your dashboard; your role sets what you can do.'],
          ['Stay on top of things', 'Follow receipts, requests and reminders in one place.']
        ],
        feats: [
          ['Payments', 'Follow collections and late payments.'], ['Requests', 'Manage repairs and quotes.'],
          ['Documents', 'Reach leases and reports.'], ['Messages', 'Talk to tenants.']
        ],
        ps: 'Team accounts are always free.'
      }
    }
  }
};

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderWelcome(o: WelcomeInput): { subject: string; html: string; text: string } {
  const lang = o.lang === 'en' ? 'en' : 'tr';
  const L = TXT[lang];
  const K = L.kinds[o.kind] || L.kinds.tek;
  const app = o.appUrl.replace(/\/$/, '');
  const url = app + '/uygulama', help = app + '/destek/';
  const end = o.trialEnds ? L.date(new Date(o.trialEnds)) : null;
  const name = esc((o.name || '').trim().split(/\s+/)[0] || '');

  const steps = K.steps.map(([a, b], i) => `<tr><td width="44" valign="top" style="padding:10px 0"><div style="width:32px;height:32px;border-radius:50%;background:${C.tugla};color:#fff;font:800 15px/32px ${FONT};text-align:center">${i + 1}</div></td>
<td style="padding:10px 0"><div style="font:700 15px ${FONT};color:${C.baca}">${esc(a)}</div><div style="font:400 14px/1.5 ${FONT};color:${C.kahve};margin-top:2px">${esc(b)}</div></td></tr>`).join('');
  let feats = '';
  for (let i = 0; i < K.feats.length; i += 2) {
    feats += '<tr>' + K.feats.slice(i, i + 2).map(([a, b]) => `<td width="50%" valign="top" style="padding:6px"><div style="background:${C.zemin};border-radius:16px;padding:14px 16px">
<div style="font:700 14px ${FONT};color:${C.baca}">${esc(a)}</div><div style="font:400 13px/1.45 ${FONT};color:${C.kahve};margin-top:3px">${esc(b)}</div></div></td>`).join('') + '</tr>';
  }
  const P = K.plan;
  const plan = P ? `<tr><td style="padding:8px 32px 4px"><div style="border:2px solid ${C.tugla};border-radius:20px;padding:18px 20px;background:${C.kart}">
<div style="font:600 12px ${FONT};color:${C.gulKoyu};letter-spacing:.6px;text-transform:uppercase">${esc(L.chosen)}</div>
<div style="font:800 22px ${FONT};color:${C.baca};margin-top:4px">${esc(P.name)}</div>
<div style="font:400 14px/1.5 ${FONT};color:${C.kahve};margin-top:6px">${esc(P.price)}</div>
<table role="presentation" width="100%" style="margin-top:10px">${P.points.map((x) => `<tr><td width="22" valign="top" style="font:800 14px ${FONT};color:${C.fesKoyu};padding:3px 0">✓</td><td style="font:500 14px/1.45 ${FONT};color:${C.baca};padding:3px 0">${esc(x)}</td></tr>`).join('')}</table>
<div style="font:400 13px/1.5 ${FONT};color:${C.kahve};margin-top:10px;background:${C.zemin};border-radius:12px;padding:10px 12px">${esc(P.note(end))}</div>
</div></td></tr>` : '';
  const link = (href: string, label: string) => `<a href="${href}" style="color:${C.gulKoyu};font-weight:700">${esc(label)}</a>`;

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(K.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}">
<div style="display:none;max-height:0;overflow:hidden">${esc(K.lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec};padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.kart};border-radius:28px;overflow:hidden;border:1px solid ${C.kil}">
<tr><td style="background:${C.kart};padding:24px 32px 22px"><img src="${LOGO_URL}" width="168" height="31" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr>
<tr><td style="background:${C.baca};padding:26px 32px 30px">
<div style="display:inline-block;margin-top:0;background:${C.bal};color:${C.baca};font:700 12px ${FONT};padding:5px 12px;border-radius:999px">${esc(K.badge)}</div>
<div style="font:800 32px/1.12 ${FONT};color:#FFF3EA;letter-spacing:-1px;margin-top:12px">${esc(K.title)}</div>
<div style="font:400 15px/1.55 ${FONT};color:#BDB1AB;margin-top:10px">${esc(K.lead)}</div></td></tr>
<tr><td style="padding:26px 32px 4px;font:400 15px/1.55 ${FONT};color:${C.baca}">${L.hi(name)}</td></tr>
<tr><td style="padding:12px 32px 0"><div style="font:800 18px ${FONT};color:${C.baca}">${esc(L.first)}</div><table role="presentation" width="100%">${steps}</table></td></tr>
${plan}
<tr><td style="padding:18px 26px 4px"><div style="font:800 18px ${FONT};color:${C.baca};padding:0 6px 6px">${esc(L.can)}</div><table role="presentation" width="100%">${feats}</table></td></tr>
<tr><td align="center" style="padding:24px 32px 8px"><a href="${url}" style="display:inline-block;background:${C.tugla};color:#fff;text-decoration:none;font:700 16px ${FONT};padding:15px 34px;border-radius:999px">${esc(L.cta)}</a>
<div style="font:400 13px ${FONT};color:${C.duman};margin-top:10px">${esc(L.pwa)}</div></td></tr>
<tr><td style="padding:16px 32px 28px"><div style="border-top:1px solid ${C.kil};padding-top:16px;font:400 13px/1.55 ${FONT};color:${C.kahve}">${esc(K.ps)}<br>${L.help(link('mailto:' + L.mail, L.mail), link(help, L.center))}</div>
<div style="font:400 12px ${FONT};color:${C.duman};margin-top:14px">${esc(L.foot)}</div></td></tr>
</table></td></tr></table></body></html>`;

  const text = [L.hi((o.name || '').trim().split(/\s+/)[0] || ''), '', K.title, K.lead, '', L.first + ':',
    ...K.steps.map(([a, b], i) => `${i + 1}. ${a}: ${b}`),
    ...(P ? ['', `${L.chosen}: ${P.name}`, P.price, ...P.points.map((x) => '- ' + x), P.note(end)] : []),
    '', L.can + ':', ...K.feats.map(([a, b]) => `- ${a}: ${b}`), '', `${L.cta}: ${url}`, '', K.ps, `${L.mail} · ${help}`].join('\n');
  return { subject: K.subject, html, text };
}
