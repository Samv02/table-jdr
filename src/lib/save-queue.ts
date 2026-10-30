// Serialize writes so a slow, older request cannot overwrite newer changes.
export function createSaveQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  return {
    get pending() {
      return pending > 0;
    },
    async flush(): Promise<void> {
      while (pending > 0) await tail;
    },
    enqueue<T>(save: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(save);
      tail = result
        .catch(() => {})
        .finally(() => {
          pending -= 1;
        });
      return result;
    },
  };
}
