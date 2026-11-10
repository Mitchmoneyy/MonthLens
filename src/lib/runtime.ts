/** Bridges to the claude.ai artifact runtime when present; plain-browser fallbacks otherwise. */
declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<any> };
  }
}

async function use(name: string): Promise<any | null> {
  try {
    if (!window.claude?.use) return null;
    return await window.claude.use(name);
  } catch {
    return null;
  }
}

export type SaveResult = 'saved' | 'declined' | 'failed';

export async function saveFile(filename: string, data: Blob | string, mime: string): Promise<SaveResult> {
  const downloads = await use('downloads');
  if (downloads) {
    try {
      await downloads.save({ filename, data });
      return 'saved';
    } catch (e: any) {
      if (e?.code === 'declined') return 'declined';
      if (e?.code !== 'unavailable' && e?.code !== 'not_granted') return 'failed';
    }
  }
  try {
    const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'failed';
  }
}

let samplePromise: Promise<any | null> | null = null;
/** Claude, when the page runs inside claude.ai. Null elsewhere. */
export function getSampler(): Promise<any | null> {
  if (!samplePromise) samplePromise = use('sample');
  return samplePromise;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
