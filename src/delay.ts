/**
 * Returns a promise that resolves after the specified number of milliseconds.
 *
 * @param ms - The delay duration in milliseconds.
 * @returns A promise that resolves with `undefined` after {@link ms} milliseconds.
 *
 * @example
 * ```ts
 * await delay(1000); // wait 1 second
 * ```
 */
export async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
