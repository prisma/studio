import type { DataType } from "../adapter";

export const MYSQL_DATA_TYPES_TO_METADATA: Record<
  string,
  Pick<DataType, "format" | "group">
> = {
  bigint: {
    group: "numeric",
  },
  binary: {
    group: "string",
  },
  bit: {
    group: "raw",
  },
  blob: {
    group: "string",
  },
  char: {
    group: "string",
  },
  "char binary": {
    group: "string",
  },
  date: {
    format: "YYYY-MM-DD",
    group: "datetime",
  },
  datetime: {
    format: "YYYY-MM-DD HH:mm:ss.SSS",
    group: "datetime",
  },
  dec: {
    group: "numeric",
  },
  decimal: {
    group: "numeric",
  },
  double: {
    group: "numeric",
  },
  "double precision": {
    group: "numeric",
  },
  enum: {
    group: "enum",
  },
  fixed: {
    group: "numeric",
  },
  float: {
    group: "numeric",
  },
  geometry: {
    group: "raw",
  },
  geometrycollection: {
    group: "raw",
  },
  int: {
    group: "numeric",
  },
  integer: {
    group: "numeric",
  },
  json: {
    group: "json",
  },
  linestring: {
    group: "raw",
  },
  long: {
    group: "string",
  },
  "long varchar": {
    group: "string",
  },
  longblob: {
    group: "string",
  },
  longtext: {
    group: "string",
  },
  longvarbinary: {
    group: "string",
  },
  longvarchar: {
    group: "string",
  },
  mediumblob: {
    group: "string",
  },
  mediumint: {
    group: "numeric",
  },
  mediumtext: {
    group: "string",
  },
  multilinestring: {
    group: "raw",
  },
  multipoint: {
    group: "raw",
  },
  multipolygon: {
    group: "raw",
  },
  numeric: {
    group: "numeric",
  },
  point: {
    group: "raw",
  },
  polygon: {
    group: "raw",
  },
  real: {
    group: "numeric",
  },
  /**
   * https://dev.mysql.com/doc/refman/9.5/en/set.html
   */
  set: {
    group: "raw",
  },
  smallint: {
    group: "numeric",
  },
  text: {
    group: "string",
  },
  time: {
    format: "HH:mm:ss.SSS",
    group: "time",
  },
  timestamp: {
    format: "YYYY-MM-DD HH:mm:ss.SSS",
    group: "datetime",
  },
  tinyblob: {
    group: "string",
  },
  tinyint: {
    group: "numeric",
  },
  tinytext: {
    group: "string",
  },
  varbinary: {
    group: "string",
  },
  varchar: {
    group: "string",
  },
  "varchar binary": {
    group: "string",
  },
  /**
   * https://dev.mysql.com/doc/refman/9.5/en/vector.html
   */
  vector: {
    group: "raw",
  },
  year: {
    format: "YYYY",
    group: "numeric",
  },
};
