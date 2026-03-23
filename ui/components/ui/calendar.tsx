import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  captionLabelClassName?: string;
  dayClassName?: string;
  dayButtonClassName?: string;
  dropdownsClassName?: string;
  footerClassName?: string;
  monthClassName?: string;
  monthCaptionClassName?: string;
  monthGridClassName?: string;
  monthsClassName?: string;
  weekClassName?: string;
  weekdayClassName?: string;
  weekdaysClassName?: string;
  rangeEndClassName?: string;
  rangeMiddleClassName?: string;
  rangeStartClassName?: string;
  selectedClassName?: string;
  disabledClassName?: string;
  hiddenClassName?: string;
  outsideClassName?: string;
  todayClassName?: string;
  selectTriggerClassName?: string;
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  hideNavigation,
  ...props
}: CalendarProps) {
  const _monthsClassName = cn(
    "relative flex flex-col gap-4 sm:flex-row",
    props.monthsClassName,
  );
  const _monthCaptionClassName = cn("hidden", props.monthCaptionClassName);
  const _dropdownsClassName = cn(
    "flex items-center justify-center gap-2 w-full",
    hideNavigation ? "w-full" : "hidden",
    props.dropdownsClassName,
  );
  const _footerClassName = cn("pt-3 text-xs", props.footerClassName);
  const _weekdaysClassName = cn("flex", props.weekdaysClassName);
  const _weekdayClassName = cn(
    "w-9 text-xs font-normal text-muted-foreground",
    props.weekdayClassName,
  );
  const _captionLabelClassName = cn(
    "truncate text-xs font-medium",
    props.captionLabelClassName,
  );

  const _monthGridClassName = cn("mx-auto mt-4", props.monthGridClassName);
  const _weekClassName = cn("mt-0 flex w-max items-start", props.weekClassName);
  const _dayClassName = cn(
    "flex size-9 flex-1 items-center justify-center p-0 text-xs",
    props.dayClassName,
  );
  const _dayButtonClassName = cn(
    buttonVariants({ variant: "ghost" }),
    "size-8 rounded-md p-0 font-normal text-xs transition-none aria-selected:opacity-100",
    props.dayButtonClassName,
  );

  const buttonRangeClassName =
    "bg-accent [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground";
  const _rangeStartClassName = cn(
    buttonRangeClassName,
    "rounded-s-md",
    props.rangeStartClassName,
  );
  const _rangeEndClassName = cn(
    buttonRangeClassName,
    "rounded-e-md",
    props.rangeEndClassName,
  );
  const _rangeMiddleClassName = cn(
    "bg-accent text-foreground! [&>button]:bg-transparent [&>button]:text-foreground! [&>button]:hover:bg-transparent [&>button]:hover:text-foreground!",
    props.rangeMiddleClassName,
  );
  const _selectedClassName = cn(
    "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
    "[&[aria-selected]>button]:bg-primary [&[aria-selected]>button]:text-primary-foreground",
    props.selectedClassName,
  );
  const _todayClassName = cn(
    "[&>button]:font-bold [&>button]:text-accent-foreground",
    props.todayClassName,
  );
  const _outsideClassName = cn(
    "text-muted-foreground opacity-50 aria-selected:text-muted-foreground aria-selected:opacity-30",
    props.outsideClassName,
  );
  const _disabledClassName = cn(
    "text-muted-foreground opacity-50",
    props.disabledClassName,
  );
  const _hiddenClassName = cn("invisible flex-1", props.hiddenClassName);

  return (
    <DayPicker
      mode="single"
      captionLayout="label"
      hideNavigation
      showOutsideDays={showOutsideDays}
      className={cn("p-0 text-xs", className)}
      classNames={{
        caption_label: _captionLabelClassName,
        day: _dayClassName,
        day_button: _dayButtonClassName,
        dropdowns: _dropdownsClassName,
        footer: _footerClassName,
        month: props.monthClassName,
        month_caption: _monthCaptionClassName,
        month_grid: _monthGridClassName,
        months: _monthsClassName,
        week: _weekClassName,
        weekday: _weekdayClassName,
        weekdays: _weekdaysClassName,
        range_end: _rangeEndClassName,
        range_middle: _rangeMiddleClassName,
        range_start: _rangeStartClassName,
        disabled: _disabledClassName,
        hidden: _hiddenClassName,
        outside: _outsideClassName,
        today: _todayClassName,
        selected: _selectedClassName,
        nav: "hidden",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
