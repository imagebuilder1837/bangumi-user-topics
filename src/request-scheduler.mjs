import { RateLimitError, RetryableError } from "./search-encore.mjs";

// One scheduler per application document; feeds retain their own user data.
export function createRequestScheduler({
  now = Date.now,
  delay = setTimeout,
} = {}) {
  let inFlight = 0,
    cooldown = 0,
    paused = false,
    scheduled = false;
  const queue = [];
  function wake() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      dispatch();
    });
  }
  function dispatch() {
    if (paused) return;
    while (inFlight < 3 && queue.length) {
      const front = queue.findIndex((job) => job.isForeground());
      const job = queue.splice(front < 0 ? 0 : front, 1)[0];
      inFlight++;
      job.attempts++;
      job
        .run()
        .then(job.resolve, (error) => {
          if (error instanceof RateLimitError) {
            paused = true;
            cooldown = Math.max(cooldown, error.retryAfter);
            for (const waiting of queue.splice(0)) waiting.reject(error);
          }
          if (error instanceof RetryableError && job.attempts < 3) {
            delay(() => {
              if (paused) job.reject(new Error("请求已暂停，请稍后重试"));
              else {
                queue.push(job);
                wake();
              }
            }, job.attempts * 1000);
          } else job.reject(error);
        })
        .finally(() => {
          inFlight--;
          wake();
        });
    }
  }
  function submit(run, isForeground) {
    if (paused) return Promise.reject(new Error("请求已暂停，请稍后重试"));
    const result = new Promise((resolve, reject) => {
      queue.push({ run, isForeground, resolve, reject, attempts: 0 });
    });
    wake();
    return result;
  }
  function retry() {
    if (paused && now() < cooldown) return false;
    paused = false;
    wake();
    return true;
  }
  return {
    submit,
    wake,
    retry,
    get paused() {
      return paused;
    },
  };
}
