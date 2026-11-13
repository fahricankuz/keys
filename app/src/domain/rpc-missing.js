/* Sunucuda henüz olmayan işlev (RPC) için yedek yol.

   Yeni web sitesi migration'lardan ÖNCE yayına çıkar: o aralıkta istemci yeni işlevleri (post_system_message, site_resident_code, ...)
   çağırır ama sunucuda yoktur. PostgREST bunu 404 / PGRST202 / "Could not find the function" diye bildirir. O durumda istemci
   eski şemadaki yola düşer. İşlevin yok olduğu oturum boyunca hatırlanır (her çağrıda yeniden denenip 404 üretilmez). */

const missing = new Set();

/** Bir supabase-js yanıtı (rpc sonucu) "işlev sunucuda yok" mu diyor? Ağ hatası, yetki hatası ve işlevin kendi hataları buna girmez. */
export function isMissingRpc(res){
  const e = res && res.error;
  if (!e) return false;
  return res.status === 404 || e.code === 'PGRST202' || /could not find the function/i.test(String(e.message || ''));
}

export const rpcKnownMissing = (name) => missing.has(name);
export const markRpcMissing = (name) => { missing.add(name); };
/** Eski şemaya düşülen oturum sonradan migration görürse (yedek yol reddedilirse) işlev yeniden denenir. */
export const forgetMissingRpc = (name) => { missing.delete(name); };

/** İşlevi çağırır; sunucuda yoksa (bu oturumda daha önce anlaşılmışsa çağırmadan) fallback() sonucunu döner. Dönen: supabase-js yanıtı. */
export async function rpcOr(client, name, args, fallback){
  if (!missing.has(name)){
    const res = await client.rpc(name, args);
    if (!isMissingRpc(res)) return res;
    missing.add(name);
  }
  return fallback();
}
