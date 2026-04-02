// we're ensuring that keys are type-safe. there is no proper way to achieve it in `nuqs`.
// the `declare module` technique results in adding overloads, not overriding the existing functions.

// eslint-disable-next-line no-restricted-imports
import {
  type Options,
  type Parser,
  useQueryState as useQueryStateOriginal,
  type UseQueryStateOptions,
  type UseQueryStateReturn,
  useQueryStates as useQueryStatesOriginal,
  type UseQueryStatesOptions,
  type UseQueryStatesReturn,
} from "nuqs";

// eslint-disable-next-line no-restricted-imports
export * from "nuqs";

export type StateKey =
  | "aggregations"
  | "pageIndex"
  | "pageSize"
  | "pin"
  | "streamAggregationRange"
  | "streamFollow"
  | "stream"
  | "table"
  | "sort"
  | "schema"
  | "test"
  | "filter"
  | "view"
  | "search"
  | "searchScope";

// lifted from @prisma/client/runtime
type Exact<A, W> =
  | (A extends unknown
      ? W extends A
        ? {
            [K in keyof A]: Exact<A[K], W[K]>;
          }
        : W
      : never)
  | (A extends string | number | bigint | boolean | [] ? A : never);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function keyMap<const Map extends Partial<Record<StateKey, any>>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyMap: Exact<Map, Partial<Record<StateKey, any>>>,
): BrandedKeyMap<Map> {
  return keyMap as never;
}

export function urlKeys<const Map extends Partial<Record<StateKey, string>>>(
  urlKeys: Exact<Map, Partial<Record<StateKey, string>>>,
): BrandedKeyMap<Map> {
  return urlKeys as never;
}

const _BRAND_SYMBOL = Symbol("BRAND_SYMBOL");

type BrandedKeyMap<Map> = Map & {
  [K in typeof _BRAND_SYMBOL]: never;
};

/**
 * @see {@link useQueryStateOriginal}
 */
export function useQueryState<T>(
  key: StateKey,
  options: UseQueryStateOptions<T> & {
    defaultValue: T;
  },
): UseQueryStateReturn<
  NonNullable<ReturnType<typeof options.parse>>,
  typeof options.defaultValue
>;
export function useQueryState<T>(
  key: StateKey,
  options: UseQueryStateOptions<T>,
): UseQueryStateReturn<
  NonNullable<ReturnType<typeof options.parse>>,
  undefined
>;
export function useQueryState(
  key: StateKey,
  options: Options & {
    defaultValue: string;
  },
): UseQueryStateReturn<string, typeof options.defaultValue>;
export function useQueryState(
  key: StateKey,
  options: Pick<UseQueryStateOptions<string>, keyof Options>,
): UseQueryStateReturn<string, undefined>;
export function useQueryState(
  key: StateKey,
): UseQueryStateReturn<string, undefined>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useQueryState(key: StateKey, options?: any): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return useQueryStateOriginal(key, options);
}

type UseQueryStatesKeysMap<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Map extends Partial<Record<StateKey, any>> = Partial<Record<StateKey, any>>,
> = {
  [Key in keyof Map]: KeyMapValue<Map[Key]>;
};

type KeyMapValue<Type> = Parser<Type> &
  Options & {
    defaultValue?: Type;
  };

/**
 * @see {@link useQueryStatesOriginal}
 */
export function useQueryStates<KeyMap extends UseQueryStatesKeysMap>(
  keyMap: BrandedKeyMap<KeyMap>,
  options?: Partial<UseQueryStatesOptions<KeyMap>>,
): UseQueryStatesReturn<KeyMap> {
  return useQueryStatesOriginal(keyMap as never, options);
}
