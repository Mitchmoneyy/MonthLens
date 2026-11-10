/**
 * In-browser OCR with tesseract.js. The engine, worker and English data are
 * served from this app's own /ocr folder, so no image ever leaves the browser.
 */
export async function ocrImage(file: Blob, onProgress?: (p: number, status: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL('ocr/', window.location.href).toString();
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker-wrap.js',
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => onProgress?.(m.progress, m.status),
  } as any);
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
