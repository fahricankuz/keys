/* Yönetici paneli: para birimi seçimi (₺ / $ / €) ve tutar biçimi. Tüm tutarlar sunucuda TL'dir; seçilen dövize TCMB döviz satış
   kuruyla çevrilir (domain/fx.js kuralı: günün kuru, hafta sonu ve tatilde son iş günü). Aylık değerler o ayın son gününün
   (bu ay için bugünün) kuruyla, dönem toplamları dönemin son gününün kuruyla çevrilir. Kur yoksa tutar uydurulmaz: "—".
   Seçim bu tarayıcıda hatırlanır (yalnız görünüm; veri değişmez). */
import { createContext, ReactNode, useContext, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { fromTl, rateDay } from '../domain/fx';
import { fmtMoney, fmtShort } from '../domain/money';
import { fmtFull } from '../domain/util';
import { CurrencySwitch, useFx, type Cur } from './fx-ui';
import { Muted } from './blocks';

const KEY = 'adminCur';
const OK = ['TRY', 'USD', 'EUR'];
const read = (): Cur => { try { const v = globalThis.localStorage?.getItem(KEY); return (OK.includes(v as string) ? v : 'TRY') as Cur; } catch { return 'TRY'; } };

type Ctx = { cur: Cur; setCur: (c: Cur) => void; table: any; ready: boolean };
const AdminMoneyCtx = createContext<Ctx>({ cur: 'TRY', setCur: () => {}, table: {}, ready: true });

/** Yönetici paneli kapsayıcısı: seçili para birimi ve kur tablosu (geçen yılın başından bugüne). */
export function AdminMoneyProvider({ children }: { children: ReactNode }) {
  const [cur, set] = useState<Cur>(read);
  const { table, ready } = useFx((new Date().getFullYear() - 1) + '-01-01', cur !== 'TRY');
  const setCur = (c: Cur) => { set(c); try { globalThis.localStorage?.setItem(KEY, c); } catch { /* yok say */ } };
  return <AdminMoneyCtx.Provider value={{ cur, setCur, table, ready: cur === 'TRY' || ready }}>{children}</AdminMoneyCtx.Provider>;
}

const today = () => new Date().toISOString().slice(0, 10);
/** 'YYYY-AA' → o ayın son günü; bu ay ya da gelecek için bugün. */
export function monthEnd(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  return d > today() ? today() : d;
}

/** Tutar biçimleyici: money(v) kısa değil tam ("₺1.234", "$29"), short(v) eksen için ("$1,2 bin"). day: 'YYYY-AA-GG' ya da 'YYYY-AA'. */
export function useMoney() {
  const { cur, table, ready } = useContext(AdminMoneyCtx);
  const dayOf = (day?: string) => (!day ? today() : day.length === 7 ? monthEnd(day) : day);
  const conv = (v: number, day?: string) => (cur === 'TRY' ? Number(v || 0) : ready ? fromTl(table, v, cur, dayOf(day)) : null);
  return {
    cur,
    conv,
    money: (v: number, day?: string) => fmtMoney(conv(v, day), cur),
    short: (v: number, day?: string) => fmtShort(conv(v, day), cur),
    /** Eksen etiketi: zaten çevrilmiş değeri kısa biçimler. */
    axis: (v: number) => fmtShort(v, cur),
    /** Zaten çevrilmiş değeri tam biçimler. */
    fmtc: (v: number) => fmtMoney(v, cur),
    rateNote: () => {
      if (cur === 'TRY') return '';
      const d = rateDay(table, cur, today());
      return d ? t('TCMB döviz satış kuru; aylık değerler ayın son gününün, bu ay bugünün kuruyla ({d}).', { d: fmtFull(d) }) : t('Kur henüz yüklenmedi; tutarlar kur gelince görünür.');
    },
  };
}

/** Sayfa başlığındaki ₺ / $ / € seçici. */
export function CurrencyPick() {
  const { cur, setCur } = useContext(AdminMoneyCtx);
  return <CurrencySwitch value={cur} onChange={setCur} />;
}

/** Döviz seçiliyken kur dip notu. */
export function CurrencyNote() {
  const m = useMoney();
  const n = m.rateNote();
  return n ? <View><Muted>{n}</Muted></View> : null;
}
