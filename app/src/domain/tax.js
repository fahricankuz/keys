/* Kira geliri için tahmini vergi hesabı (konut ve işyeri).

   ORANLAR KODA GÖMÜLÜDÜR ve her yıl güncellenmelidir. Yeni yıl için:
   1. Aşağıdaki RATES tablosuna yılı ekleyin.
   2. istisna: GVK md. 21 konut kira geliri istisna tutarı (o yılın gelirleri için).
      Yalnızca KONUT gelirine uygulanır; işyeri kirasında istisna yoktur.
   3. brackets: GVK md. 103 ücret dışı gelir tarifesi — [dilim üst sınırı, oran].
   4. goturu: götürü gider oranı.
   5. stopaj: GVK md. 94/5-a kira stopajı. Kiracı şirket ya da esnafsa kiranın
      bu oranını keser ve vergi dairesine kendisi öder; mülk sahibine net tutar geçer.
   6. beyanSiniri: GVK md. 86/1-c — stopajı kesilmiş işyeri kira gelirinin
      toplamı bu tutarı aşmıyorsa beyana eklenmez (kesilen stopaj nihai vergidir).
   Kaynak: Gelir İdaresi Başkanlığı (gib.gov.tr) yıllık rehberleri.

   Bir yılın verisi yoksa en yakın önceki yıl kullanılır ve ekranda
   "yaklaşık" uyarısı gösterilir. Hesap bilgi amaçlıdır; beyan öncesi
   mali müşavire danışılmalıdır. */

export const RATES = {
  2023: {
    istisna: 21000,
    goturu: 0.15,
    stopaj: 0.20,
    beyanSiniri: 150000,
    brackets: [[70000, 0.15], [150000, 0.20], [370000, 0.27], [1900000, 0.35], [Infinity, 0.40]]
  },
  2024: {
    istisna: 33000,
    goturu: 0.15,
    stopaj: 0.20,
    beyanSiniri: 230000,
    brackets: [[110000, 0.15], [230000, 0.20], [580000, 0.27], [3000000, 0.35], [Infinity, 0.40]]
  },
  2025: {
    istisna: 47000,
    goturu: 0.15,
    stopaj: 0.20,
    beyanSiniri: 330000,
    brackets: [[158000, 0.15], [330000, 0.20], [800000, 0.27], [4300000, 0.35], [Infinity, 0.40]]
  }
};

/** Yılın oranları; yoksa en yakın önceki yıl (approx: true). */
export function ratesFor(year){
  const y = Number(year);
  if (RATES[y]) return { year:y, approx:false, ...RATES[y] };
  const known = Object.keys(RATES).map(Number).sort((a, b) => a - b);
  const prev = known.filter(k => k < y).pop() ?? known[0];
  return { year:prev, approx:true, ...RATES[prev] };
}

/** Artan oranlı tarifeye göre vergi. */
export function progressive(base, brackets){
  let tax = 0, lower = 0;
  for (const [upper, rate] of brackets){
    if (base <= lower) break;
    tax += (Math.min(base, upper) - lower) * rate;
    lower = upper;
  }
  return Math.max(0, Math.round(tax));
}

/** O yılın kira stopajı oranı. */
export function stopajRate(year){ return ratesFor(year).stopaj; }

/**
 * Yıllık tahmini vergi. Gelir üç gruba ayrılır:
 *   konut   — istisna uygulanır (kiracı stopaj kestiyse o stopaj mahsup edilir)
 *   stopajli — stopajı kesilmiş işyeri kirası; beyan sınırını aşmazsa beyana girmez
 *   diger   — stopajsız işyeri kirası (kiracı şahıs); ilk liradan beyana girer
 * Götürü ve gerçek gider yöntemleri karşılaştırılır; kesilen stopaj hesaplanan
 * vergiden düşülür, fazlası iade olarak görünür (payable < 0).
 *
 * @param {{konut?:G, stopajli?:G, diger?:G}} inc  G = { gross, withheld, exp }
 * @param {{year:number, noExemption?:boolean}} o
 */
export function estimate(inc, o){
  const r = ratesFor(o.year);
  const z = { gross:0, withheld:0, exp:0 };
  const K = Object.assign({}, z, inc.konut), W = Object.assign({}, z, inc.stopajli), N = Object.assign({}, z, inc.diger);

  const istisna = o.noExemption ? 0 : r.istisna;
  const konutTaxable = Math.max(0, K.gross - istisna);
  const includeW = W.gross > r.beyanSiniri;
  const needed = konutTaxable > 0 || N.gross > 0 || includeW;

  const declared = konutTaxable + N.gross + (includeW ? W.gross : 0);
  // İstisna uygulanınca konut giderlerinin yalnızca vergiye tabi kısma düşen payı indirilebilir.
  const konutAllowed = K.gross ? Math.round(K.exp * (konutTaxable / K.gross)) : 0;
  const allowed = konutAllowed + N.exp + (includeW ? W.exp : 0);
  const credit = (konutTaxable > 0 ? K.withheld : 0) + (includeW ? W.withheld : 0);

  const method = base => {
    const tax = progressive(base, r.brackets);
    return { base, tax, payable: needed ? tax - credit : 0 };
  };
  const goturu = method(Math.round(declared * (1 - r.goturu)));
  const gercek = Object.assign(method(Math.max(0, declared - allowed)), { allowed });

  return {
    rates:r, istisna, needed, belowExemption: !needed,
    konut:K, stopajli:W, diger:N, konutTaxable, includeW, declared, credit,
    goturu, gercek, best: gercek.payable < goturu.payable ? 'gercek' : 'goturu'
  };
}
