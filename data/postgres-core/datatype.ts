import type { DataType } from "../adapter";

export const POSTGRESQL_DATA_TYPES_TO_METADATA: Record<
  string,
  Pick<DataType, "format" | "group">
> = {
  bool: {
    group: "boolean",
  },
  boolean: {
    group: "boolean",
  },
  bytea: {
    group: "string",
  },
  char: {
    group: "string",
  },
  citext: {
    group: "string",
  },
  /**
   * @example '2025-04-14'
   */
  date: {
    format: "YYYY-MM-DD",
    group: "datetime",
  },
  /**
   * @example '1 day 2 hours'
   */
  interval: {
    group: "string",
  },
  name: {
    group: "string",
  },
  varchar: {
    group: "string",
  },
  text: {
    group: "string",
  },
  /**
   * short form of `time without time zone`.
   *
   * @example '14:30:00'
   */
  time: {
    format: "HH:mm:ss.SSS",
    group: "time",
  },
  /**
   * short form of `timestamp without time zone`.
   *
   * @example '2025-04-14 14:30:00'
   */
  timestamp: {
    format: "YYYY-MM-DD HH:mm:ss.SSS",
    group: "datetime",
  },
  /**
   * short form of `timestamp with time zone`.
   *
   * @example '2025-04-14 14:30:00+00'
   */
  timestamptz: {
    format: "YYYY-MM-DD HH:mm:ss.SSSZZ",
    group: "datetime",
  },
  /**
   * long form of `timestamp`.
   *
   * @example '2025-04-14 14:30:00'
   */
  "timestamp without time zone": {
    format: "YYYY-MM-DD HH:mm:ss.SSS",
    group: "datetime",
  },
  /**
   * long form of `timestamptz`.
   *
   * @example '2025-04-14 14:30:00+00'
   */
  "timestamp with time zone": {
    format: "YYYY-MM-DD HH:mm:ss.SSSZZ",
    group: "datetime",
  },
  /**
   * short form of `time with time zone`.
   *
   * @example '14:30:00+00'
   */
  timetz: {
    format: "HH:mm:ss.SSSZZ",
    group: "time",
  },
  /**
   * long form of `time`.
   *
   * @example '14:30:00'
   */
  "time without time zone": {
    format: "HH:mm:ss.SSS",
    group: "time",
  },
  /**
   * long form of `timetz`.
   *
   * @example '14:30:00+00'
   */
  "time with time zone": {
    format: "HH:mm:ss.SSSZZ",
    group: "time",
  },
  uuid: {
    format: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    group: "raw",
  },
  int2: {
    group: "numeric",
  },
  int4: {
    group: "numeric",
  },
  int8: {
    group: "numeric",
  },
  smallint: {
    group: "numeric",
  },
  integer: {
    group: "numeric",
  },
  bigint: {
    group: "numeric",
  },
  decimal: {
    group: "numeric",
  },
  numeric: {
    group: "numeric",
  },
  real: {
    group: "numeric",
  },
  float4: {
    group: "numeric",
  },
  float8: {
    group: "numeric",
  },
  "double precision": {
    group: "numeric",
  },
  json: {
    group: "json",
  },
  jsonb: {
    group: "json",
  },
};
