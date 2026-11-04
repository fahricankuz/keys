/* Yakalanan hatalar: uygulama hatayı yakalayıp çalışmayı sürdürdüğünde (eşitleme, yükleme, okuma) kullanıcı bir şey görmeyebilir;
   bu dosya hatayı konsola ve hata kaydına (errors.js → report_error) iletir. Node testlerinde de yüklenebilsin diye bağımlılığı yok:
   sunucuya gönderimi errors.js açılışta bağlar. */

let sink = null;
export function setLogSink(fn){ sink = fn; }

/** Yakalanan hatayı kaydeder; asla hata fırlatmaz. context: hangi iş başarısız oldu (ör. 'Eşitleme hatası'). */
export function logCaught(context, err){
  try {
    console.warn(context, err);
    if (sink) sink(context, err);
  } catch(e){ /* kayıt asla yeni hata üretmez */ }
}
