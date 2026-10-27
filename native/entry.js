// Yerel eklentileri tek pakette toplar; scripts/build.mjs esbuild ile
// www/native.js olarak derler. Uygulama bunlara window.EvimNative üzerinden
// ulaşır (assets/js/native.js). Web sürümünde bu paket yüklenmez.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { PushNotifications } from '@capacitor/push-notifications';
import { Keyboard } from '@capacitor/keyboard';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

window.EvimNative = {
  platform: Capacitor.getPlatform(),
  App, StatusBar, Style, SplashScreen, PushNotifications, Keyboard, Purchases, BiometricAuth, SecureStorage
};
