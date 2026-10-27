// Testler için sahte Capacitor eklentileri (window.EvimNative).
// Gerçek iOS/Android köprüsü yerine çağrıları kaydeder; testler olayları
// __native.fire('backButton') gibi tetikler.
(function(){
  const cfg = window.__nativeCfg || {};
  const calls = [];
  const listeners = {};
  const rec = (name, ret) => (...args) => { calls.push({ name, args }); return Promise.resolve(typeof ret === 'function' ? ret(...args) : ret); };
  const on = plugin => (evt, fn) => { (listeners[plugin + ':' + evt] = listeners[plugin + ':' + evt] || []).push(fn); return Promise.resolve({ remove(){} }); };
  const secure = new Map();
  let perm = cfg.perm || 'prompt';
  let authOverride = null;
  const authOk = () => authOverride !== null ? authOverride : (window.__nativeCfg || {}).authOk !== false;

  window.__native = {
    calls, secure,
    fire(key, data){ (listeners[key] || []).forEach(fn => fn(data)); },
    setAuth(ok){ authOverride = ok; },
    called(name){ return calls.filter(c => c.name === name); }
  };

  window.EvimNative = {
    platform: cfg.platform || 'android',
    Style: { Dark:'DARK', Light:'LIGHT' },
    App: {
      addListener: on('App'),
      minimizeApp: rec('App.minimizeApp'),
      exitApp: rec('App.exitApp'),
      getLaunchUrl: rec('App.getLaunchUrl', cfg.launchUrl ? { url: cfg.launchUrl } : undefined)
    },
    StatusBar: { setStyle: rec('StatusBar.setStyle'), setBackgroundColor: rec('StatusBar.setBackgroundColor') },
    SplashScreen: { hide: rec('SplashScreen.hide') },
    Keyboard: {},
    PushNotifications: {
      addListener: on('Push'),
      checkPermissions: rec('Push.checkPermissions', () => ({ receive: perm })),
      requestPermissions: rec('Push.requestPermissions', () => { perm = 'granted'; return { receive: perm }; }),
      register: rec('Push.register', () => { setTimeout(() => window.__native.fire('Push:registration', { value:'cihaz-anahtari-1' }), 10); }),
      unregister: rec('Push.unregister'),
      createChannel: rec('Push.createChannel')
    },
    BiometricAuth: {
      checkBiometry: rec('Bio.checkBiometry', { isAvailable:true, deviceIsSecure:true }),
      authenticate: (...a) => { calls.push({ name:'Bio.authenticate', args:a }); return authOk() ? Promise.resolve() : Promise.reject(new Error('iptal')); }
    },
    SecureStorage: {
      getItem: k => Promise.resolve(secure.has(k) ? secure.get(k) : null),
      setItem: (k, v) => { secure.set(k, v); return Promise.resolve(); },
      removeItem: k => { secure.delete(k); return Promise.resolve(); }
    },
    Purchases: {
      isConfigured: rec('RC.isConfigured', () => ({ isConfigured: calls.some(c => c.name === 'RC.configure') })),
      configure: rec('RC.configure'),
      logIn: rec('RC.logIn'),
      getOfferings: rec('RC.getOfferings', { current: { availablePackages: [
        { identifier:'$rc_monthly', product:{ priceString:'₺199,99' } },
        { identifier:'$rc_annual', product:{ priceString:'₺1.999,99' } }
      ] } }),
      purchasePackage: rec('RC.purchasePackage', { customerInfo:{} }),
      restorePurchases: rec('RC.restorePurchases', { customerInfo:{} })
    }
  };
})();
