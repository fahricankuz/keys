/* anahtar: telefon uygulamasındaki bot doğrulaması (Cloudflare Turnstile) için köprü.
   Adres: /turnstile/?k=<site anahtarı>&lang=<tr|en>. Jeton window.ReactNativeWebView.postMessage ile uygulamaya gider:
   { type: 'ready' | 'token' | 'expired' | 'error', token }. Uygulama window.resetTurnstile() ile yeni jeton ister. */
(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  var key = params.get('k') || '';
  var lang = params.get('lang') === 'en' ? 'en' : 'tr';
  var bridge = window.ReactNativeWebView;
  var widget = null;
  var loaded = false;

  function send(type, token) {
    if (bridge && typeof bridge.postMessage === 'function') bridge.postMessage(JSON.stringify({ type: type, token: token || '' }));
  }

  function mount() {
    loaded = true;
    if (!window.turnstile) return send('error');
    try {
      widget = window.turnstile.render('#w', {
        sitekey: key, theme: 'auto', language: lang, retry: 'auto',
        callback: function (t) { send('token', t); },
        'expired-callback': function () { send('expired'); },
        'error-callback': function () { send('error'); return true; },
        'timeout-callback': function () { send('expired'); },
        'unsupported-callback': function () { send('error'); }
      });
      send('ready');
    } catch (e) { send('error'); }
  }

  window.resetTurnstile = function () {
    try { if (widget !== null && window.turnstile) window.turnstile.reset(widget); else send('error'); }
    catch (e) { send('error'); }
  };

  if (!/^[0-9A-Za-z_-]{8,64}$/.test(key)) { send('error'); return; }
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = mount;
  s.onerror = function () { send('error'); };
  document.head.appendChild(s);
  // Betik yüklenmeden (çevrimdışı, engelli) 15 saniye geçerse uygulama hata gösterip yeniden denetsin.
  setTimeout(function () { if (!loaded) send('error'); }, 15000);
})();
