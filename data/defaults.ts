import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const DATE0_PER_FORMAT: Record<string, string> = {};

export function getDate0(format: string): string {
  return (DATE0_PER_FORMAT[format] ??= dayjs(0).utc().format(format));
}

export const DEFAULT_STRING = "";

export const DEFAULT_NUMERIC = 0;

export const DEFAULT_BOOLEAN = false;

export const DEFAULT_ARRAY_DISPLAY = "[]";
export const DEFAULT_JSON = "{}";
export const DEFAULT_ARRAY_VALUE = DEFAULT_JSON;
