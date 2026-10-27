const m = new Map();
export default {
  getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => { m.set(k, String(v)); },
  removeItem: async (k) => { m.delete(k); }, getAllKeys: async () => [...m.keys()], multiGet: async (ks) => ks.map((k) => [k, m.get(k) ?? null])
};
