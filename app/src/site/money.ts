/* Tanıtım sitesindeki örnek tutarlar: Türkçede TL, İngilizcede dolar (uygulamadaki gerçek veri değil). */
import { getLang } from '../domain/i18n';

/** Örnek tutar: Türkçe sitede `tr`, İngilizce sitede `en` metni. */
export const demo = (tr: string, en: string) => (getLang() === 'en' ? en : tr);
