export type JobResult = {
  step: number;
  status: 'complete';
  durationMs: number;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

export async function simulateJob(
  step: number,
  durationSeconds: number,
  signal?: AbortSignal
): Promise<JobResult> {
  const durationMs = durationSeconds * 1000;
  await sleep(durationMs, signal);
  return { step, status: 'complete', durationMs };
}
