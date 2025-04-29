/**
 * Converts an async generator into an array by awaiting and collecting all its values.
 *
 * @template T - The type of elements yielded by the generator
 * @param generator - The async generator to convert
 * @returns A promise that resolves to an array containing all elements from the generator
 *
 * @example
 * const asyncGen = async function* () {
 *   yield 1;
 *   yield 2;
 *   yield 3;
 * };
 * const array = await arrayFromAsyncGenerator(asyncGen());
 * // array = [1, 2, 3]
 */
export async function arrayFromAsyncGenerator<T>(
  generator: AsyncIterable<T>,
  stopPredicate: (items: T[]) => boolean = () => false,
): Promise<T[]> {
  const result: T[] = [];
  for await (const item of generator) {
    result.push(item);
    if (stopPredicate && stopPredicate(result)) {
      break;
    }
  }
  return result;
}
