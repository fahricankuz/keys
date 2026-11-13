/* Sentry'ye giden verinin temizliği (KVKK). Bağımlılığı yok: Node testleri de yükleyebilsin (tests/sentry-temizlik.spec.mjs).
   redact(): public.log_redact ve supabase/functions/_shared/log.ts → redact ile AYNI kurallar (üçünü birlikte değiştir; docs/loglar.md).
   Web (sentry.js) ve telefon (sentry.native.js) aynı süzgeci kullanır. */
export function redact(s) {
  return String(s ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g, '[e-posta]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){1,2}/g, '[jeton]')
    .replace(/([Bb]earer|[Bb]asic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 [gizli]')
    .replace(/(token|secret|password|passwd|parola|sifre|şifre|apikey|api_key|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, '$1$2[gizli]')
    .replace(/(^|[^0-9])(\+?90[ -]?)?0?5[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}(?![0-9])/g, '$1[telefon]');
}

/** errors.js ile aynı gürültü süzgeci (ağ kopması, tarayıcı eklentileri); Sentry'de ignoreErrors olarak da kullanılır. */
export const NOISE = /Failed to fetch|NetworkError|Load failed|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError/i;

const UUID = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

/** Adresin sorgu dizesi (?…) ve parçası (#…) atılır: Supabase onay bağlantısı #access_token=… taşır, REST sorguları e-posta taşıyabilir.
    Yol kimlikleri (UUID, uzun sayılar) parametreleştirilir ki aynı ekran tek sorun olarak gruplansın. */
export function scrubUrl(u) {
  if (typeof u !== 'string' || !u) return u;
  const cut = u.split('#')[0].split('?')[0];
  return redact(cut.replace(UUID, '/:id').replace(/\/\d{5,}(?=\/|$)/g, '/:n'));
}

/** Serbest metin: içindeki adresler scrubUrl'den, kalanı redact'ten geçer. */
export function scrubText(s) {
  return typeof s === 'string' ? redact(s.replace(/https?:\/\/[^\s"'<>)\]]+/gi, (m) => scrubUrl(m))) : s;
}

export function scrubBreadcrumb(b) {
  if (!b) return b;
  if (b.message) b.message = scrubText(b.message);
  const d = b.data;
  if (d && typeof d === 'object') {
    for (const k of ['url', 'from', 'to']) if (typeof d[k] === 'string') d[k] = scrubUrl(d[k]);
    delete d.query; delete d.request_body; delete d.response_body;
  }
  return b;
}

function scrubSpan(s) {
  if (s.description) s.description = scrubText(s.description);
  const d = s.data;
  if (d && typeof d === 'object') {
    for (const k of Object.keys(d)) {
      if (/query|fragment|body/i.test(k)) delete d[k];
      else if (typeof d[k] === 'string') d[k] = /^(url|http\.url|http\.target|server\.address)$/.test(k) || /^https?:\/\//.test(d[k]) ? scrubUrl(d[k]) : scrubText(d[k]);
    }
  }
}

/** beforeSend ve beforeSendTransaction: kullanıcıda yalnız UUID kalır; istekte çerez, başlık, gövde ve sorgu yok; metinler log_redact kurallarından geçer. */
export function scrubEvent(e) {
  if (!e) return e;
  if (e.message) e.message = scrubText(e.message);
  if (e.logentry && e.logentry.message) e.logentry.message = scrubText(e.logentry.message);
  for (const x of (e.exception && e.exception.values) || []) x.value = scrubText(x.value);
  if (e.transaction) e.transaction = scrubUrl(e.transaction);
  if (e.request) {
    e.request.url = scrubUrl(e.request.url);
    delete e.request.cookies; delete e.request.headers; delete e.request.data; delete e.request.query_string;
  }
  e.user = e.user && e.user.id ? { id: String(e.user.id) } : undefined;
  if (e.breadcrumbs) e.breadcrumbs = e.breadcrumbs.map(scrubBreadcrumb);
  if (e.spans) for (const s of e.spans) scrubSpan(s);
  for (const k of ['tags', 'extra']) if (e[k]) for (const n of Object.keys(e[k])) e[k][n] = scrubText(e[k][n]);
  return e;
}
