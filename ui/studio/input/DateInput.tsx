import dayjs from "dayjs";
import localeData from "dayjs/plugin/localeData";
import { useEffect, useMemo } from "react";

import type { Column } from "../../../data/adapter";
import { getDate0 } from "../../../data/defaults";
import { Calendar } from "../../components/ui/calendar";
import { Input } from "../../components/ui/input";
import { usePopoverActions } from "../../components/ui/popover-cell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useStableUiStateKey, useUiState } from "../../hooks/use-ui-state";
import type { CellEditNavigationDirection } from "./get-input";
import { InputActions } from "./InputActions";
import { useInput } from "./use-input";

dayjs.extend(localeData);

export interface DateInputProps {
  column: Column;
  context: "edit" | "insert";
  onNavigate?: (direction: CellEditNavigationDirection) => void;
  onSubmit: (value: string | null | undefined) => void;
  readonly: boolean;
  showSaveAction?: boolean;
  value: unknown;
}

const MONTHS = dayjs.months();

const MIN_JS_DATE = new Date(0);
// this is smaller than `Number.MAX_SAFE_INTEGER`, which produces 'invalid date'.
// TODO: use column.datatype limits dynamically when implemented and available.
const MAX_JS_DATE = new Date(8_640_000_000_000_000);

function getLocalUtcOffsetLabel(date: Date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");

  return `UTC${sign}${hours}:${minutes}`;
}

export function DateInput(props: DateInputProps) {
  const {
    column,
    context,
    onNavigate,
    onSubmit,
    readonly,
    showSaveAction,
    value,
  } = props;
  const { datatype, defaultValue, fkColumn, isRequired } = column;
  const { format, group } = datatype;

  if (!format) {
    throw new Error("DateInput requires a format in the datatype.");
  }

  const valueAsString =
    value == null
      ? isRequired && !fkColumn
        ? getDate0(format)
        : ""
      : String(value);

  const emptyValue =
    context === "insert" && defaultValue != null
      ? undefined
      : isRequired && !fkColumn
        ? getDate0(format)
        : null;

  const initialSelectedDate = useMemo(() => {
    const date = dayjs(valueAsString);

    return date.isValid() ? date.toDate() : new Date();
  }, [valueAsString]);
  const statePrefix = useStableUiStateKey("date-input");
  const [selectedDate, setSelectedDate] = useUiState<Date | undefined>(
    `${statePrefix}:selected-date`,
    initialSelectedDate,
    { cleanupOnUnmount: true },
  );
  const [currentMonth, setCurrentMonth] = useUiState<Date>(
    `${statePrefix}:current-month`,
    initialSelectedDate,
    { cleanupOnUnmount: true },
  );
  const [hourValue, setHourValue] = useUiState<string>(
    `${statePrefix}:hour`,
    dayjs(initialSelectedDate).format("HH"),
    { cleanupOnUnmount: true },
  );
  const [minuteValue, setMinuteValue] = useUiState<string>(
    `${statePrefix}:minute`,
    dayjs(initialSelectedDate).format("mm"),
    { cleanupOnUnmount: true },
  );
  const [secondValue, setSecondValue] = useUiState<string>(
    `${statePrefix}:second`,
    dayjs(initialSelectedDate).format("ss"),
    { cleanupOnUnmount: true },
  );

  const {
    handleOnChange: baseHandleOnChange,
    setValue,
    value: inputValue,
  } = useInput({
    initialValue: valueAsString,
    stateKey: `${statePrefix}:input`,
  });

  const hasTimePrecision = group === "time" || format.includes(":");
  const localTimezoneLabel = useMemo(() => getLocalUtcOffsetLabel(), []);

  const handleOnChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    baseHandleOnChange(event);

    try {
      const newValue = dayjs(event.target.value);

      if (!newValue.isValid()) {
        return;
      }

      const newDate = newValue.toDate();

      setSelectedDate(newDate);
      setCurrentMonth(newDate);

      if (hasTimePrecision) {
        setHourValue(newValue.format("HH"));
        setMinuteValue(newValue.format("mm"));
        setSecondValue(newValue.format("ss"));
      }
    } catch {
      // noop
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) {
      return;
    }

    let newSelectedDate = dayjs(date);

    if (hasTimePrecision) {
      const timeSourceNativeDate = selectedDate ?? new Date();
      const timeSourceDate = dayjs(timeSourceNativeDate);

      newSelectedDate = newSelectedDate
        .hour(timeSourceDate.hour())
        .minute(timeSourceDate.minute())
        .second(timeSourceDate.second())
        .millisecond(timeSourceDate.millisecond());

      if (selectedDate == null) {
        setHourValue(timeSourceDate.format("HH"));
        setMinuteValue(timeSourceDate.format("mm"));
        setSecondValue(timeSourceDate.format("ss"));
        // TODO: handle milliseconds.
      }
    }

    const newSelectedNativeDate = newSelectedDate.toDate();

    setSelectedDate(newSelectedNativeDate);
    setCurrentMonth(newSelectedNativeDate);
    setValue(newSelectedDate.format(format));
  };

  const { handleCancel, handleKeyDown, handleSave } = usePopoverActions({
    onNavigate,
    onSave: () => {
      const formattedInputValue =
        !inputValue && isRequired && !fkColumn
          ? getDate0(format)
          : dayjs(inputValue).format(format);
      const formattedValue = dayjs(valueAsString).format(format);

      if (formattedInputValue !== formattedValue) {
        onSubmit(!inputValue ? emptyValue : inputValue);

        return true;
      }

      return false;
    },
  });

  const currentMonthValue = currentMonth.getMonth().toString();

  const [yearValue, setYearValue] = useUiState<string>(
    `${statePrefix}:year`,
    currentMonth.getFullYear().toString(),
    { cleanupOnUnmount: true },
  );

  // TODO: simplify this function
  const updateDateFromInputs = (
    newDateParts: Partial<{
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
    }>,
  ) => {
    let baseDate = dayjs(selectedDate);

    if (
      selectedDate &&
      (newDateParts.hour !== undefined ||
        newDateParts.minute !== undefined ||
        newDateParts.second !== undefined) &&
      newDateParts.year === undefined &&
      newDateParts.month === undefined &&
      newDateParts.day === undefined
    ) {
      baseDate = dayjs(selectedDate);
    } else if (
      !selectedDate &&
      (newDateParts.hour !== undefined ||
        newDateParts.minute !== undefined ||
        newDateParts.second !== undefined)
    ) {
      // if no date is selected, but time is changed, use the current view of the calendar for date part
      baseDate = dayjs(currentMonth);
    }

    const newDate = baseDate
      .set("year", newDateParts.year ?? baseDate.year())
      .set("month", newDateParts.month ?? baseDate.month()) // month is 0-indexed for dayjs
      .set("date", newDateParts.day ?? baseDate.date())
      .set(
        "hour",
        newDateParts.hour ?? (hasTimePrecision ? baseDate.hour() : 0),
      )
      .set(
        "minute",
        newDateParts.minute ?? (hasTimePrecision ? baseDate.minute() : 0),
      )
      .set(
        "second",
        newDateParts.second ?? (hasTimePrecision ? baseDate.second() : 0),
      );

    setSelectedDate(newDate.toDate());
    // setCurrentMonth should only be updated if year or month changes, not just time
    if (newDateParts.year !== undefined || newDateParts.month !== undefined) {
      setCurrentMonth(newDate.toDate());
    }

    setValue(newDate.format(format));

    if (newDateParts.year !== undefined)
      setYearValue(String(newDateParts.year));
    if (hasTimePrecision) {
      if (newDateParts.hour !== undefined)
        setHourValue(String(newDateParts.hour).padStart(2, "0"));
      if (newDateParts.minute !== undefined)
        setMinuteValue(String(newDateParts.minute).padStart(2, "0"));
      if (newDateParts.second !== undefined)
        setSecondValue(String(newDateParts.second).padStart(2, "0"));
    }
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newYearStr = e.target.value;

    setYearValue(newYearStr);

    const newYear = Number(newYearStr);

    if (
      newYear >= MIN_JS_DATE.getFullYear() &&
      newYear <= MAX_JS_DATE.getFullYear()
    ) {
      updateDateFromInputs({ year: newYear });
    }
  };

  // TODO: simplify this function
  const handleTimeChange = (
    part: "hour" | "minute" | "second",
    value: string,
  ) => {
    const numericValue = parseInt(value);
    if (isNaN(numericValue)) return;

    const newHour = part === "hour" ? numericValue : parseInt(hourValue);
    const newMinute = part === "minute" ? numericValue : parseInt(minuteValue);
    const newSecond = part === "second" ? numericValue : parseInt(secondValue);

    if (part === "hour") setHourValue(value.padStart(2, "0"));
    if (part === "minute") setMinuteValue(value.padStart(2, "0"));
    if (part === "second") setSecondValue(value.padStart(2, "0"));

    // Update only if the value is a complete number for that part
    const isCompleteHour =
      part === "hour" &&
      value.length >= 1 &&
      numericValue >= 0 &&
      numericValue <= 23;
    const isCompleteMinute =
      part === "minute" &&
      value.length >= 1 &&
      numericValue >= 0 &&
      numericValue <= 59;
    const isCompleteSecond =
      part === "second" &&
      value.length >= 1 &&
      numericValue >= 0 &&
      numericValue <= 59;

    if (
      (part === "hour" && isCompleteHour) ||
      (part === "minute" && isCompleteMinute) ||
      (part === "second" && isCompleteSecond)
    ) {
      updateDateFromInputs({
        hour: newHour,
        minute: newMinute,
        second: newSecond,
      });
    }
  };

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    const date = dayjs(selectedDate);

    setYearValue(date.year().toString());

    if (hasTimePrecision) {
      setHourValue(date.format("HH"));
      setMinuteValue(date.format("mm"));
      setSecondValue(date.format("ss"));
    }
  }, [hasTimePrecision, selectedDate]);

  useEffect(() => {
    if (!currentMonth || selectedDate) {
      return;
    }

    setYearValue(currentMonth.getFullYear().toString());
  }, [currentMonth, selectedDate]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleKeyDown}>
      <div className="flex items-center pr-(--studio-cell-spacing)">
        <Input
          aria-required={isRequired}
          className="cell-input-leading border-none shadow-none focus-visible:ring-0 resize-none px-(--studio-cell-spacing)"
          onChange={handleOnChange}
          placeholder={format}
          required={isRequired}
          type="text"
          value={inputValue}
        />
      </div>
      <div className="flex flex-col gap-0 p-2 border-t border-table-border">
        <div className="flex items-center justify-between mb-1 gap-2">
          <Select
            onValueChange={(value) =>
              updateDateFromInputs({ month: parseInt(value) })
            }
            value={currentMonthValue}
          >
            <SelectTrigger className="text-xs data-[state=open]:border-primary shadow-none">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={index} value={String(index)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="text-xs w-20 text-right shadow-none"
            max={MAX_JS_DATE.getFullYear()}
            min={MIN_JS_DATE.getFullYear()}
            onChange={handleYearChange}
            placeholder="YYYY"
            type="number"
            value={yearValue}
          />
        </div>
        <Calendar
          captionLayout="dropdown"
          className="w-full"
          disabled={readonly}
          endMonth={MAX_JS_DATE}
          mode="single"
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          onSelect={handleCalendarSelect}
          selected={selectedDate}
          startMonth={MIN_JS_DATE}
        />
        {hasTimePrecision && (
          <div className="mt-1">
            <div className="flex items-center justify-start gap-1">
              <Input
                className="text-xs w-16 text-right shadow-none"
                type="number"
                value={hourValue}
                onChange={(e) => handleTimeChange("hour", e.target.value)}
                placeholder="HH"
                min={0}
                max={23}
                maxLength={2}
                disabled={readonly}
              />
              <span className="text-xs text-muted-foreground">:</span>
              <Input
                className="text-xs w-16 text-right shadow-none"
                type="number"
                value={minuteValue}
                onChange={(e) => handleTimeChange("minute", e.target.value)}
                placeholder="mm"
                min={0}
                max={59}
                maxLength={2}
                disabled={readonly}
              />
              <span className="text-xs text-muted-foreground">:</span>
              <Input
                className="text-xs w-16 text-right shadow-none "
                type="number"
                value={secondValue}
                onChange={(e) => handleTimeChange("second", e.target.value)}
                placeholder="ss"
                min={0}
                max={59}
                maxLength={2}
                disabled={readonly}
              />
              {/* TODO: milliseconds. */}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Editing in local time ({localTimezoneLabel})
            </p>
          </div>
        )}
      </div>
      <InputActions
        disabled={readonly}
        onCancel={handleCancel}
        onSave={handleSave}
        saveText={
          !inputValue
            ? `Set to ${emptyValue === null ? "NULL" : emptyValue === undefined ? "default value" : "Date(0)"}`
            : undefined
        }
        showSave={showSaveAction}
      />
    </div>
  );
}
