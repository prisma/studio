/**
 * Returns an rfc3339 compliant local date string with timezone.
 * This function is unfortunately necessary because Date.toISOString() always returns the time in UTC.
 * This function return an RFC3339 formatted string in the user's local time zone.
 */
export function rfc3339(date: Date = new Date()): string {
  return `${shortDate(date)}T${time(date)}${timezoneOffset(date)}`;
}

function shortDate(date: Date): string {
  return [
    date.getFullYear(),
    doubleDigits(date.getMonth() + 1),
    doubleDigits(date.getDate()),
  ].join("-");
}

function time(date: Date): string {
  return [
    doubleDigits(date.getHours()),
    doubleDigits(date.getMinutes()),
    doubleDigits(date.getSeconds()),
  ].join(":");
}

function timezoneOffset(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();

  if (!offsetMinutes) {
    return "Z";
  }

  const absoluteOffsetMinutes = Math.abs(offsetMinutes);

  const absoluteOffsetHours = Math.floor(absoluteOffsetMinutes / 60);

  const absoluteOffsetMinutesInHour = absoluteOffsetMinutes % 60;

  return `${offsetMinutes > 0 ? "-" : "+"}${doubleDigits(absoluteOffsetHours)}:${doubleDigits(absoluteOffsetMinutesInHour)}`;
}

function doubleDigits(value: number): string {
  return String(value).padStart(2, "0");
}
