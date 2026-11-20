/** Share a refresh already in progress; always release the lock after success or failure. */
export function singleFlight<T>(action: () => Promise<T>) {
  let pending: Promise<T> | null = null;
  return () => {
    if (!pending)
      pending = Promise.resolve()
        .then(action)
        .finally(() => {
          pending = null;
        });
    return pending;
  };
}
