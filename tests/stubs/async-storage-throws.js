// Test yedeği: statik derlemede (window yok) dokunulmaması gereken AsyncStorage. Kullanılırsa test kırılır.
const fail = () => { throw new Error('AsyncStorage statik derlemede kullanılmamalı'); };
export default { getItem: fail, setItem: fail, removeItem: fail };
