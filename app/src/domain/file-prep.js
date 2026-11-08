/* Seçilen dosya hazırlanırken (fotoğraf küçültme, okuma) formun gönderme düğmesi beklesin: yoksa hızlı basan kişinin eki
   sessizce kaybolur (dosya henüz forma yazılmamıştır). Dosya alanı hazırlığı burada sayar; ana düğmeler (ui/kit → Button)
   sayaç sıfırdan büyükken basılamaz. Hazırlık birkaç saniye sürer. */
let count = 0;
const subs = new Set();
const emit = () => subs.forEach((f) => { try { f(); } catch { /* yok say */ } });

export const filesPreparing = () => count > 0;
export function onFilesPreparing(f){ subs.add(f); return () => { subs.delete(f); }; }

/** Dosya seçme ve hazırlama işini sarar: süresince "hazırlanıyor" sayılır (iptal ya da hatada da biter). */
export async function preparing(task){
  count++; emit();
  try { return await task(); } finally { count--; emit(); }
}
