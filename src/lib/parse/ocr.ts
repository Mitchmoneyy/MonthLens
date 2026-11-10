/**
 * In-browser OCR with tesseract.js. The engine, worker and English data are
 * served from this app's own /ocr folder, so no image ever leaves the browser.
 *
 * One engine is kept warm and reused: loading it is the slow part (a few MB of
 * language data), so the second screenshot reads much faster than the first.
 */
type Progress = (p: number, status: string) => void;
let workerPromise: Promise<any> | null = null;
let onProgress: Progress | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL('ocr/', window.location.href).toString();
      return createWorker('eng', 1, {
        workerPath: base + 'worker-wrap.js',
        corePath: base,
        langPath: base.replace(/\/$/, ''),
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => onProgress?.(m.progress, m.status),
      } as any);
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

export function ocrImage(file: Blob, progress?: Progress): Promise<string> {
  // one image at a time through the shared engine
  const job = queue.then(async () => {
    clearTimeout(idle);
    onProgress = progress;
    const worker = await getWorker();
    try {
      const { data } = await worker.recognize(file);
      return data.text as string;
    } finally {
      onProgress = undefined;
      idle = setTimeout(() => {
        const w = workerPromise;
        workerPromise = null;
        void w?.then((x) => x.terminate()).catch(() => {});
      }, 60000);
    }
  });
  queue = job.catch(() => {});
  return job;
}
