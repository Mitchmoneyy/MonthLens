import type { CapacitorConfig } from '@capacitor/cli';

/** The iPhone/iPad app wraps the same build as the website (dist/). */
const config: CapacitorConfig = {
  appId: 'io.github.mitchmoneyy.monthlens',
  appName: 'MonthLens',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // the app handles safe areas itself
    backgroundColor: '#0b0b0b',
    scheme: 'MonthLens',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0b0b0b', showSpinner: false, launchAutoHide: true },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
};

export default config;
