import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  HelpCircle,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { Fragment, useEffect, useMemo } from "react";
import { ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  ColumnFilter,
  FilterGroup,
  FilterOperator,
  SqlFilter,
  Table,
} from "@/data";

import { coerceToString, coerceToValue } from "../../../../lib/conversionUtils";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { useUiState } from "../../../hooks/use-ui-state";
import short from "../../../lib/short-uuid";
import { cn } from "../../../lib/utils";

const LeadingOperatorSelect = ({
  value,
  onValueChange,
  disabled,
  triggerClassName = "w-20 text-xs h-8",
}: {
  value?: "and" | "or";
  onValueChange: (value: "and" | "or") => void;
  disabled?: boolean;
  triggerClassName?: string;
}) => {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="Logic" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="and">
          <div className="font-semibold">AND</div>
        </SelectItem>
        <SelectItem value="or">
          <div className="font-semibold">OR</div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

type FilterTreeItem = ColumnFilter | FilterGroup | SqlFilter;

// Renders the preview of the item being dragged in the DragOverlay.
const DraggableFilterItemPreview = ({
  activeId,
  items,
  table,
}: {
  activeId: UniqueIdentifier;
  items: FilterTreeItem[];
  table: Table;
}) => {
  const activeItem = items.find((item) => item.id === activeId);
  if (!activeItem) return null;

  let leadingOperatorValue: "and" | "or" = "and"; // Default
  let showLeadingOpForOverlay = false;
  const activeItemIndex = items.findIndex((item) => item.id === activeId);

  if (activeItemIndex > 0) {
    const previousItem = items[activeItemIndex - 1];
    if (previousItem) {
      // 'after' from the previous item determines the operator leading into the current item
      leadingOperatorValue = previousItem.after;
      showLeadingOpForOverlay = true;
    }
  }

  if (activeItem.kind === "ColumnFilter") {
    return (
      <FilterCondition
        filter={activeItem}
        onUpdate={() => {}} // Overlay is non-interactive for updates
        onDelete={() => {}} // Overlay is non-interactive for deletes
        table={table}
        showLeadingOperator={showLeadingOpForOverlay}
        leadingOperatorValue={leadingOperatorValue}
        onLeadingOperatorChange={() => {}} // Non-interactive
      />
    );
  } else if (activeItem.kind === "SqlFilter") {
    return (
      <SqlFilterCondition
        filter={activeItem}
        onUpdate={() => {}}
        onDelete={() => {}}
        table={table}
        showLeadingOperator={showLeadingOpForOverlay}
        leadingOperatorValue={leadingOperatorValue}
        onLeadingOperatorChange={() => {}}
      />
    );
  } else {
    return (
      <FilterGroupComponent
        group={activeItem}
        onUpdate={() => {}}
        onDelete={() => {}}
        isRoot={false} // Dragged item in overlay is not the root
        table={table}
        showLeadingOperator={showLeadingOpForOverlay}
        leadingOperatorValue={leadingOperatorValue}
        onLeadingOperatorChange={() => {}}
        isLeadingOperatorTargetLast={false} // Non-interactive for preview
      />
    );
  }
};

// Manages DND context and rendering of sortable filter items for a group.
const FilterListItems = ({
  items,
  parentGroupId,
  table,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  activeDragId,
  onDragStart,
  onDragEndSignal,
}: {
  items: FilterTreeItem[];
  parentGroupId: UniqueIdentifier;
  table: Table;
  onUpdateItem: (index: number, updatedItem: FilterTreeItem) => void;
  onDeleteItem: (index: number) => void;
  onReorderItems: (oldIndex: number, newIndex: number) => void;
  activeDragId: UniqueIdentifier | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragEndSignal: () => void; // Callback to signal drag operation completion
}) => {
  const sortableItemIds = useMemo(() => items.map((item) => item.id), [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleInternalDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderItems(oldIndex, newIndex);
      }
    }
    onDragEndSignal(); // Signal to parent that drag has ended (e.g., to clear activeDragId)
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={handleInternalDragEnd}
      >
        <SortableContext
          items={sortableItemIds}
          strategy={verticalListSortingStrategy}
        >
          {items.map((currentFilterItem, index) => {
            let showLeadingOp = false;
            let leadingOpVal: "and" | "or" | undefined;
            let onLeadingOpChangeFn:
              | ((value: "and" | "or") => void)
              | undefined;
            let isLeadingOpTargetLast = false;

            if (index > 0) {
              showLeadingOp = true;
              const prevItem = items[index - 1]!;
              leadingOpVal = prevItem.after;
              onLeadingOpChangeFn = (newValue: "and" | "or") => {
                const updatedPrevItem = { ...prevItem, after: newValue };
                onUpdateItem(index - 1, updatedPrevItem);
              };
              isLeadingOpTargetLast = index - 1 === items.length - 1;
            }

            return (
              <SortableFilterItem
                key={currentFilterItem.id}
                filter={currentFilterItem}
                onUpdate={(updatedFilter) => onUpdateItem(index, updatedFilter)}
                onDelete={() => onDeleteItem(index)}
                parentDndId={parentGroupId}
                table={table}
                showLeadingOperator={showLeadingOp}
                leadingOperatorValue={leadingOpVal}
                onLeadingOperatorChange={onLeadingOpChangeFn}
                isLeadingOperatorTargetLast={isLeadingOpTargetLast}
              />
            );
          })}
        </SortableContext>
      </DndContext>
      {createPortal(
        <DragOverlay>
          {activeDragId ? (
            <div className="opacity-80">
              <DraggableFilterItemPreview
                activeId={activeDragId}
                items={items}
                table={table}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </>
  );
};

// Component for a sortable filter item
const SortableFilterItem = ({
  filter,
  onUpdate,
  onDelete,
  parentDndId,
  table,
  showLeadingOperator,
  leadingOperatorValue,
  onLeadingOperatorChange,
  isLeadingOperatorTargetLast,
}: {
  filter: FilterTreeItem;
  onUpdate: (updatedFilter: FilterTreeItem) => void;
  onDelete: () => void;
  parentDndId: UniqueIdentifier;
  table: Table;
  showLeadingOperator?: boolean;
  leadingOperatorValue?: "and" | "or";
  onLeadingOperatorChange?: (value: "and" | "or") => void;
  isLeadingOperatorTargetLast?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: filter.id,
    data: {
      type: filter.kind,
      parentId: parentDndId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-row justify-between gap-2"
    >
      {filter.kind === "ColumnFilter" ? (
        <FilterCondition
          filter={filter}
          onUpdate={onUpdate}
          onDelete={onDelete}
          dragHandleProps={{ ...attributes, ...listeners }}
          table={table}
          showLeadingOperator={showLeadingOperator}
          leadingOperatorValue={leadingOperatorValue}
          onLeadingOperatorChange={onLeadingOperatorChange}
          isLeadingOperatorTargetLast={isLeadingOperatorTargetLast}
        />
      ) : filter.kind === "SqlFilter" ? (
        <SqlFilterCondition
          filter={filter}
          onUpdate={onUpdate}
          onDelete={onDelete}
          dragHandleProps={{ ...attributes, ...listeners }}
          table={table}
          showLeadingOperator={showLeadingOperator}
          leadingOperatorValue={leadingOperatorValue}
          onLeadingOperatorChange={onLeadingOperatorChange}
          isLeadingOperatorTargetLast={isLeadingOperatorTargetLast}
        />
      ) : (
        <FilterGroupComponent
          group={filter}
          onUpdate={onUpdate}
          onDelete={onDelete}
          dragHandleProps={{ ...attributes, ...listeners }}
          table={table}
          showLeadingOperator={showLeadingOperator}
          leadingOperatorValue={leadingOperatorValue}
          onLeadingOperatorChange={onLeadingOperatorChange}
          isLeadingOperatorTargetLast={isLeadingOperatorTargetLast}
        />
      )}
    </div>
  );
};

// Component for a single filter condition
const FilterCondition = ({
  filter,
  onUpdate,
  onDelete,
  dragHandleProps,
  table,
  showLeadingOperator,
  leadingOperatorValue,
  onLeadingOperatorChange,
  isLeadingOperatorTargetLast,
}: {
  filter: ColumnFilter;
  onUpdate: (updatedFilter: ColumnFilter) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  table: Table;
  showLeadingOperator?: boolean;
  leadingOperatorValue?: "and" | "or";
  onLeadingOperatorChange?: (value: "and" | "or") => void;
  isLeadingOperatorTargetLast?: boolean;
}) => {
  const stateScope = `${table.schema}.${table.name}.${filter.id}`;
  const handleColumnChange = (value: string) => {
    const nextFilter = { ...filter, column: value };
    setEditedValue(
      coerceToString(
        table.columns[nextFilter.column],
        nextFilter.operator,
        nextFilter.value,
      ),
    );
    onUpdate(nextFilter);
  };

  const handleOperatorChange = (value: FilterOperator) => {
    const nextFilter = { ...filter, operator: value };
    setEditedValue(
      coerceToString(
        table.columns[nextFilter.column],
        nextFilter.operator,
        nextFilter.value,
      ),
    );
    onUpdate(nextFilter);
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const columnInfo = table.columns[filter.column];

    if (columnInfo !== undefined) {
      const newValue = coerceToValue(columnInfo, filter.operator, rawValue);

      onUpdate({ ...filter, value: newValue });
    }
  };

  const handleEnumValueChange = (value: string) => {
    const columnInfo = table.columns[filter.column];
    if (columnInfo !== undefined) {
      // For enums, the value is stored directly. Coercion might not be necessary
      // or might need specific handling if options are not just strings.
      // Assuming options are strings for now.
      onUpdate({ ...filter, value: value });
    }
  };

  const [editedValue, setEditedValue] = useUiState<string>(
    `filter-tree:${stateScope}:edited-value`,
    coerceToString(table.columns[filter.column], filter.operator, filter.value),
    { cleanupOnUnmount: true },
  );
  const [isInitialRender, setIsInitialRender] = useUiState<boolean>(
    `filter-tree:${stateScope}:initial-render`,
    true,
    { cleanupOnUnmount: true },
  );

  useEffect(() => {
    if (!isInitialRender) {
      return;
    }

    setIsInitialRender(false);
  }, [isInitialRender, setIsInitialRender]);

  const columnInfo = table.columns[filter.column];
  const isEnumColumn = columnInfo?.datatype.group === "enum";

  return (
    <motion.div
      className="flex items-center gap-2 w-full"
      initial={isInitialRender ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: { duration: 0.12 } }}
    >
      <div className="flex items-center gap-2 w-full">
        <div {...dragHandleProps} className="cursor-grab">
          <GripVertical className="text-gray-500" size={16} />
        </div>

        <div className="flex items-center gap-2">
          {showLeadingOperator && onLeadingOperatorChange ? (
            <LeadingOperatorSelect
              value={leadingOperatorValue}
              onValueChange={onLeadingOperatorChange}
              disabled={isLeadingOperatorTargetLast}
            />
          ) : null}

          <Select value={filter.column} onValueChange={handleColumnChange}>
            <SelectTrigger className="w-28 text-xs h-8">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(table.columns).map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filter.operator}
            onValueChange={(value) =>
              handleOperatorChange(value as FilterOperator)
            }
          >
            <SelectTrigger className="w-20 text-xs h-8">
              <SelectValue placeholder="Operator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="=">=</SelectItem>
              <SelectItem value="!=">!=</SelectItem>
              <SelectItem value=">">&gt;</SelectItem>
              <SelectItem value=">=">&gt;=</SelectItem>
              <SelectItem value="<">&lt;</SelectItem>
              <SelectItem value="<=">&lt;=</SelectItem>
              <SelectItem value="is">is</SelectItem>
              <SelectItem value="is not">is not</SelectItem>
              <SelectItem value="like">like</SelectItem>
              <SelectItem value="not like">not like</SelectItem>
              <SelectItem value="ilike">ilike</SelectItem>
              <SelectItem value="not ilike">not ilike</SelectItem>
            </SelectContent>
          </Select>

          {isEnumColumn && columnInfo?.datatype.options ? (
            <Select
              value={filter.value as string | undefined}
              onValueChange={handleEnumValueChange}
            >
              <SelectTrigger className="w-24 text-xs h-8 font-mono">
                <SelectValue placeholder="Select value" />
              </SelectTrigger>
              <SelectContent>
                {columnInfo.datatype.options.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className="font-mono text-xs"
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={editedValue}
              onChange={(e) => {
                setEditedValue(e.target.value);
                handleValueChange(e);
              }}
              placeholder="value"
              className="w-24 text-xs h-8"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <X size={14} />
        </Button>
      </div>
    </motion.div>
  );
};

const SqlFilterCondition = ({
  filter,
  onUpdate,
  onDelete,
  dragHandleProps,
  showLeadingOperator,
  leadingOperatorValue,
  onLeadingOperatorChange,
  isLeadingOperatorTargetLast,
}: {
  filter: SqlFilter;
  onUpdate: (updatedFilter: SqlFilter) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  table: Table;
  showLeadingOperator?: boolean;
  leadingOperatorValue?: "and" | "or";
  onLeadingOperatorChange?: (value: "and" | "or") => void;
  isLeadingOperatorTargetLast?: boolean;
}) => {
  return (
    <motion.div
      className="flex items-center gap-2 w-full"
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: { duration: 0.12 } }}
    >
      <div className="flex items-center gap-2 w-full">
        <div {...dragHandleProps} className="cursor-grab">
          <GripVertical className="text-gray-500" size={16} />
        </div>

        <div className="flex items-center gap-2">
          {showLeadingOperator && onLeadingOperatorChange ? (
            <LeadingOperatorSelect
              value={leadingOperatorValue}
              onValueChange={onLeadingOperatorChange}
              disabled={isLeadingOperatorTargetLast}
            />
          ) : null}

          <div className="flex h-8 items-center rounded-md border px-3 text-xs font-semibold">
            SQL
          </div>

          <Input
            value={filter.sql}
            onChange={(event) => {
              onUpdate({ ...filter, sql: event.target.value });
            }}
            placeholder="WHERE clause"
            className="w-64 text-xs h-8 font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <X size={14} />
        </Button>
      </div>
    </motion.div>
  );
};

// Component for a filter group (AND/OR)
const FilterGroupComponent = ({
  group,
  onUpdate,
  onDelete,
  dragHandleProps,
  isRoot = false,
  table,
  showLeadingOperator,
  leadingOperatorValue,
  onLeadingOperatorChange,
  isLeadingOperatorTargetLast,
}: {
  group: FilterGroup;
  onUpdate: (updatedGroup: FilterGroup) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isRoot?: boolean;
  table: Table;
  showLeadingOperator?: boolean;
  leadingOperatorValue?: "and" | "or";
  onLeadingOperatorChange?: (value: "and" | "or") => void;
  isLeadingOperatorTargetLast?: boolean;
}) => {
  const stateScope = `${table.schema}.${table.name}.${group.id}`;
  const [isExpanded, setIsExpanded] = useUiState<boolean>(
    `filter-tree:${stateScope}:expanded`,
    true,
    { cleanupOnUnmount: true },
  );
  const [activeDragId, setActiveDragId] = useUiState<UniqueIdentifier | null>(
    `filter-tree:${stateScope}:active-drag-id`,
    null,
    { cleanupOnUnmount: true },
  );

  const handleAddFilter = () => {
    const newFilter: ColumnFilter = {
      id: short.generate(),
      kind: "ColumnFilter",
      column: Object.keys(table.columns)[0] ?? "", // Always select first col
      operator: "=",
      value: undefined,
      after: "and",
    };

    onUpdate({ ...group, filters: [...group.filters, newFilter] });
  };

  const handleAddGroup = () => {
    const newGroup: FilterGroup = {
      id: short.generate(),
      kind: "FilterGroup",
      filters: [],
      after: "and",
    };

    onUpdate({ ...group, filters: [...group.filters, newGroup] });
  };

  const updateItemInGroup = (
    index: number,
    updatedFilterOrGroup: FilterTreeItem,
  ) => {
    const newFilters = [...group.filters];
    newFilters[index] = updatedFilterOrGroup;
    onUpdate({ ...group, filters: newFilters });
  };

  const deleteItemFromGroup = (index: number) => {
    const newFilters = [...group.filters];
    newFilters.splice(index, 1);
    onUpdate({ ...group, filters: newFilters });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEndSignal = () => {
    setActiveDragId(null);
  };

  const handleReorderItems = (oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex) return;
    const reorderedFilters = arrayMove(group.filters, oldIndex, newIndex);
    onUpdate({ ...group, filters: reorderedFilters });
  };

  const renderGroupContent = () => {
    if (!isExpanded) return null;
    if (!group.filters || group.filters.length === 0) {
      return (
        <div className="text-xs text-muted-foreground py-1">
          This group is empty. Add a filter or another group.
        </div>
      );
    }

    return (
      <motion.div transition={{ layout: { duration: 0.12 } }}>
        <div
          className={cn("flex flex-col relative gap-2", isRoot ? "" : "pb-2")}
        >
          <FilterListItems
            items={group.filters}
            parentGroupId={group.id}
            table={table}
            onUpdateItem={updateItemInGroup}
            onDeleteItem={deleteItemFromGroup}
            onReorderItems={handleReorderItems}
            activeDragId={activeDragId}
            onDragStart={handleDragStart}
            onDragEndSignal={handleDragEndSignal}
          />
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div className="w-full" transition={{ layout: { duration: 0.12 } }}>
      <div className={cn("flex flex-col w-full", isExpanded ? "gap-2" : "")}>
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {!isRoot && (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
              <div
                {...dragHandleProps}
                className="cursor-grab"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>
            )}

            {showLeadingOperator && onLeadingOperatorChange && !isRoot && (
              <div className="flex items-center">
                <LeadingOperatorSelect
                  value={leadingOperatorValue}
                  onValueChange={onLeadingOperatorChange}
                  disabled={isLeadingOperatorTargetLast}
                />
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddFilter}
              className={cn(
                "flex items-center gap-2 overflow-hidden transition-all",
              )}
            >
              Add Filter
              {group.filters.length > 0 && (
                <Badge className="transition-all">
                  <span className="tabular-nums">{group.filters.length}</span>
                </Badge>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddGroup}
              className="flex items-center gap-1"
            >
              Add Group
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {isRoot && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <HelpCircle className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-full">
                  {group.filters.length === 0 ? (
                    <div className="p-4 text-center text-sm text-neutral-600">
                      No filters applied yet. Add filters to preview your query.
                    </div>
                  ) : (
                    <div className="p-2 text-center text-sm bg-neutral-100 rounded-sm font-mono">
                      <QueryVisualizer filter={group} />
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isRoot && (
              <Button variant="ghost" size="icon" onClick={onDelete}>
                <X size={14} />
              </Button>
            )}
          </div>
        </div>
        <div className={cn(isRoot ? "" : "ml-6")}>{renderGroupContent()}</div>
      </div>
    </motion.div>
  );
};

// Component to visualize the query string
const QueryVisualizer = ({ filter }: { filter: FilterGroup }): ReactNode => {
  let isAndGroupOpen = 0;

  if (filter.filters.length === 0) return "( )";

  const group = filter.filters.map((f, i) => {
    let result: ReactNode;
    const isLast = filter.filters.length - 1 === i;

    if (isAndGroupOpen === -1) {
      isAndGroupOpen = 0;
    }

    if (f.after === "and" && !isLast) {
      isAndGroupOpen += 1;
    }
    if (isAndGroupOpen && (isLast || f.after === "or")) {
      isAndGroupOpen = -1;
    }

    if (f.kind === "ColumnFilter") {
      const { column, operator } = f;

      result = (
        <>
          <span> {column} </span>
          <span> {operator} </span>
          <span> ? </span>
        </>
      );
    } else if (f.kind === "SqlFilter") {
      result = (
        <>
          <span> SQL </span>
          <span> (</span>
          <span> {f.sql || "?"} </span>
          <span>) </span>
        </>
      );
    } else {
      result = <QueryVisualizer filter={f} />;
    }

    return (
      <Fragment key={f.id}>
        {isAndGroupOpen === 1 ? <span className="font-semibold">(</span> : ""}
        {result}
        {isAndGroupOpen === -1 ? <span className="font-semibold">)</span> : ""}
        {!isLast && (
          <span className="uppercase text-blue-500 font-semibold">
            {" "}
            {f.after}{" "}
          </span>
        )}
      </Fragment>
    );
  });

  return <span>{group}</span>;
};

// Main component
export function FilterTree({
  filter,
  setFilter,
  setAppliedFilter,
  table,
}: {
  filter: FilterGroup;
  setFilter: (updatedFilter: FilterGroup) => void;
  setAppliedFilter: (filter: FilterGroup) => void;
  table: Table;
}) {
  const handleApplyFilters = () => {
    setAppliedFilter(filter);
  };

  const handleClearFilters = () => {
    const clearedFilter = { ...filter, filters: [] };
    setFilter(clearedFilter); // Update the editing state
    setAppliedFilter(clearedFilter); // Update the applied state and URL params
  };

  return (
    <div className="flex flex-col gap-4 min-w-[368px]">
      <FilterGroupComponent
        group={filter}
        onUpdate={setFilter}
        onDelete={() => {}}
        isRoot={true}
        table={table}
      />
      <div className="flex self-end gap-2 items-center">
        {filter.filters.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear Filters
          </Button>
        )}
        <Button variant="default" size="sm" onClick={handleApplyFilters}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
