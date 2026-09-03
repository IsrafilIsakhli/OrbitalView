// New local writes are refused during the short install handoff; existing writes finish first.
const writes = new Set<Promise<unknown>>();
const pausers = new Set<() => (() => void)>();
let preparing = false;

export function trackLocalWrite<T>(action: () => Promise<T>): Promise<T> {
  if (preparing) return Promise.reject(new Error("update-in-progress"));
  const operation = action();
  writes.add(operation);
  void operation.then(() => writes.delete(operation), () => writes.delete(operation));
  return operation;
}

export function registerUpdatePause(pause: () => (() => void)): () => void {
  pausers.add(pause);
  return () => { pausers.delete(pause); };
}

export async function prepareUpdate(timeoutMs = 30_000): Promise<() => void> {
  if (preparing) throw new Error("update-already-preparing");
  preparing = true;
  const resumes: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resume = () => {
    preparing = false;
    resumes.reverse().forEach((action) => action());
  };
  try {
    for (const pause of pausers) resumes.push(pause());
    await Promise.race([
      Promise.allSettled([...writes]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("local-writes-busy")), timeoutMs); }),
    ]);
    return resume;
  } catch (error) {
    resume();
    throw error;
  } finally { clearTimeout(timer); }
}
