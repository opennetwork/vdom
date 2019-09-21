type OpaqueToken<T, K> = { __type__: T, __opaque__: K };
export type Opaque<T, K> = T & OpaqueToken<T, K>;

// This value is a list of values to be used
export type ListAsyncIterable<T = any, I extends AsyncIterable<T> = AsyncIterable<T>> = Opaque<I, { list: true }>;
// This value produces a new list each iteration
export type ListUpdaterAsyncIterable<T extends AsyncIterable<any> = AsyncIterable<any>, I extends AsyncIterable<T> = AsyncIterable<T>> = Opaque<I, { listUpdater: true }>;

export function getListAsyncIterable<T = any, I extends AsyncIterable<T> = AsyncIterable<T>>(input: I): ListAsyncIterable<T, I> {
  return input as ListAsyncIterable<T, I>;
}

export function getListUpdaterAsyncIterable<T extends AsyncIterable<any> = AsyncIterable<any>, I extends AsyncIterable<T> = AsyncIterable<T>>(input: I): ListUpdaterAsyncIterable<T, I> {
  return input as ListUpdaterAsyncIterable<T, I>;
}
