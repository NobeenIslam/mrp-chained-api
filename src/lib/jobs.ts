import { config } from '@/lib/config';

export type JobResult = {
  step: number;
  status: 'complete';
  duration: number;
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
  signal?: AbortSignal
): Promise<JobResult> {
  const duration = config.jobDurationMs;
  await sleep(duration, signal);
  return { step, status: 'complete', duration };
}
