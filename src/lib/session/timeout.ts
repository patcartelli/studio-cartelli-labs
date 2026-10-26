// Vendored verbatim from patcartelli/stc-screen-recorder, transform/src/timeout.ts.
// See src/lib/session/types.ts for why this directory exists at all.

/**
 * Puts a bound on a promise settled by someone else's callback.
 *
 * mp4box and VideoDecoder both signal trouble by simply never calling back —
 * a promise that never settles is the least debuggable failure available: no
 * error, no stack, just a study that sits there forever. Every wait needs a
 * bound and a reason; `what` is the reason and it goes in the message.
 */
export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not complete within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
