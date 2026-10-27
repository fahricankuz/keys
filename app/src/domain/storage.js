/* Eşzamanlı anahtar-değer deposu.
   Web: localStorage. iOS/Android: AsyncStorage; açılışta hydrate() ile belleğe
   alınır, yazmalar arka planda diske gider. Böylece alan mantığı (state.js)
   eşzamanlı okuma/yazma varsayımını koruyabilir. */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mem = new Map();
const web = Platform.OS === 'web';
let loading = null;

/** Tek seferlik: depo belleğe alınır; birden çok çağıran aynı sözü bekler. */
export function hydrate(){
  if (!loading) loading = load();
  return loading;
}

async function load(){
  if (web){
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); mem.set(k, localStorage.getItem(k)); } } catch(e){}
    return;
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(keys);
    pairs.forEach(([k, v]) => { if (v != null) mem.set(k, v); });
  } catch(e){}
}

export const storage = {
  getItem(k){ return mem.has(k) ? mem.get(k) : null; },
  setItem(k, v){
    mem.set(k, String(v));
    if (web){ localStorage.setItem(k, String(v)); return; }
    AsyncStorage.setItem(k, String(v)).catch(() => {});
  },
  removeItem(k){
    mem.delete(k);
    if (web){ try { localStorage.removeItem(k); } catch(e){} return; }
    AsyncStorage.removeItem(k).catch(() => {});
  }
};
