/**
 * iPhone/iPad app (Capacitor) integration. Everything here is a no-op on the website.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();

/** Status bar text colour follows the top bar (black bar in light mode, light bar in dark mode). */
export async function syncStatusBar(dark: boolean) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
  } catch {
    /* plugin unavailable */
  }
}

let haptics: typeof import('@capacitor/haptics') | null = null;
export function tap() {
  if (!isNative()) return;
  if (haptics) return void haptics.Haptics.impact({ style: haptics.ImpactStyle.Light }).catch(() => {});
  import('@capacitor/haptics').then((h) => {
    haptics = h;
    void h.Haptics.impact({ style: h.ImpactStyle.Light }).catch(() => {});
  });
}

/** Save a generated file through the iOS share sheet (Save to Files, AirDrop, Mail…). */
export async function shareFile(filename: string, data: Blob | string): Promise<'saved' | 'declined' | 'failed'> {
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const blob = typeof data === 'string' ? new Blob([data]) : data;
    const base64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] ?? '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
    await Share.share({ title: filename, files: [uri] });
    return 'saved';
  } catch (e: any) {
    return /cancel/i.test(String(e?.message ?? e)) ? 'declined' : 'failed';
  }
}
