// analytics.ts
function getViewerId(): string {
  const key = 'mh_viewer_id';
  let v = localStorage.getItem(key);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(key, v);
  }
  return v;
}

type ViewEvent = {
  type: 'STORE_VIEW' | 'PRODUCT_VIEW' | 'PAGE_VIEW';
  storeId?: string;
  productId?: string;
  pageId?: string;
};

type QueuedViewEvent = ViewEvent & { viewerId: string };

const queue: QueuedViewEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let isFlushing = false;

const runFlush = () => {
  timer = undefined;
  void flush().catch((err) => {
    // log/telemetria; evita unhandled rejection
    console.error('analytics flush failed', err);
  });
};

const scheduleFlush = (delayMs = 5000) => {
  if (timer) return;
  timer = setTimeout(runFlush, delayMs);
};

export function trackView(e: ViewEvent) {
  queue.push({ ...e, viewerId: getViewerId() });
  scheduleFlush(5000);
}

async function flush(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    if (queue.length === 0) return;
    const batch = queue.splice(0, 50);

    try {
      await fetch('/api/v1/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true, // helps on unload
      });
    } catch {
      // If offline, requeue (optional)
      queue.unshift(...batch);
    }

    // if more events remain, schedule next flush quickly
    if (queue.length > 0) scheduleFlush(1500);
  } finally {
    isFlushing = false;
  }
}
