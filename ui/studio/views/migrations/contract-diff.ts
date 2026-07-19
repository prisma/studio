/**
 * Model-level diff engine for Prisma Next contract snapshots.
 *
 * A Prisma Next migration ledger row carries the full contract JSON
 * before and after the migration (`contract_json_before` /
 * `contract_json_after`). This module normalizes those documents into
 * flat snapshots and diffs them into the structure the Migrations view
 * renders: models added/removed/changed, per-field change details,
 * enums, relations and index changes.
 */

export interface SnapshotField {
  name: string;
  column: string | null;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  enumName: string | null;
  isPrimaryKey: boolean;
}

export interface SnapshotRelation {
  name: string;
  toModel: string;
  cardinality: string;
}

export interface SnapshotModel {
  name: string;
  table: string | null;
  fields: SnapshotField[];
  relations: SnapshotRelation[];
  indexes: string[];
}

export interface SnapshotEnum {
  name: string;
  members: string[];
}

export interface ContractSnapshot {
  models: Map<string, SnapshotModel>;
  enums: Map<string, SnapshotEnum>;
}

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface FieldChangeDetail {
  aspect: "type" | "nullable" | "default" | "key";
  before: string;
  after: string;
}

export interface FieldDiff {
  name: string;
  status: DiffStatus;
  field: SnapshotField;
  details: FieldChangeDetail[];
}

export interface ModelDiff {
  name: string;
  status: DiffStatus;
  table: string | null;
  fields: FieldDiff[];
  addedIndexes: string[];
  removedIndexes: string[];
  addedRelations: SnapshotRelation[];
  removedRelations: SnapshotRelation[];
  relations: SnapshotRelation[];
}

export interface EnumDiff {
  name: string;
  status: DiffStatus;
  members: Array<{ name: string; status: DiffStatus }>;
}

export interface MigrationDiffStats {
  modelsAdded: number;
  modelsRemoved: number;
  modelsChanged: number;
  fieldsAdded: number;
  fieldsRemoved: number;
  fieldsChanged: number;
  enumsAdded: number;
  enumsRemoved: number;
  indexesAdded: number;
  indexesRemoved: number;
}

export interface MigrationDiff {
  models: ModelDiff[];
  enums: EnumDiff[];
  stats: MigrationDiffStats;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function codecToFriendlyType(codecId: string | null): string {
  if (!codecId) {
    return "unknown";
  }

  const match = /^[^/]+\/([^@]+)@/.exec(codecId);

  return match?.[1] ?? codecId;
}

function renderDefault(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "function") {
    return asString(value.expression);
  }

  if (value.kind === "literal") {
    if (typeof value.value === "string") {
      return `"${value.value}"`;
    }

    return JSON.stringify(value.value ?? null);
  }

  return null;
}

interface StorageColumn {
  nativeType: string | null;
  nullable: boolean;
  defaultValue: string | null;
  codecId: string | null;
}

interface StorageTable {
  columns: Map<string, StorageColumn>;
  primaryKeyColumns: Set<string>;
  indexes: string[];
}

function renderIndexSignature(prefix: string, value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.columns)) {
    return null;
  }

  const columns = value.columns.filter(
    (column): column is string => typeof column === "string",
  );

  if (columns.length === 0) {
    return null;
  }

  return `${prefix}(${columns.join(", ")})`;
}

function parseStorageTables(contract: unknown): Map<string, StorageTable> {
  const tables = new Map<string, StorageTable>();

  if (!isRecord(contract)) {
    return tables;
  }

  const storage = contract.storage;

  if (!isRecord(storage) || !isRecord(storage.namespaces)) {
    return tables;
  }

  for (const namespace of Object.values(storage.namespaces)) {
    if (!isRecord(namespace) || !isRecord(namespace.entries)) {
      continue;
    }

    const tableEntries = namespace.entries.table;

    if (!isRecord(tableEntries)) {
      continue;
    }

    for (const [tableName, table] of Object.entries(tableEntries)) {
      if (!isRecord(table)) {
        continue;
      }

      const columns = new Map<string, StorageColumn>();

      if (isRecord(table.columns)) {
        for (const [columnName, column] of Object.entries(table.columns)) {
          if (!isRecord(column)) {
            continue;
          }

          columns.set(columnName, {
            nativeType: asString(column.nativeType),
            nullable: column.nullable === true,
            defaultValue: renderDefault(column.default),
            codecId: asString(column.codecId),
          });
        }
      }

      const primaryKeyColumns = new Set<string>();

      if (
        isRecord(table.primaryKey) &&
        Array.isArray(table.primaryKey.columns)
      ) {
        for (const column of table.primaryKey.columns) {
          if (typeof column === "string") {
            primaryKeyColumns.add(column);
          }
        }
      }

      const indexes: string[] = [];

      if (Array.isArray(table.indexes)) {
        for (const index of table.indexes) {
          const signature = renderIndexSignature("index", index);

          if (signature) {
            indexes.push(signature);
          }
        }
      }

      if (Array.isArray(table.uniques)) {
        for (const unique of table.uniques) {
          const signature = renderIndexSignature("unique", unique);

          if (signature) {
            indexes.push(signature);
          }
        }
      }

      tables.set(tableName, { columns, primaryKeyColumns, indexes });
    }
  }

  return tables;
}

/**
 * Normalizes a Prisma Next contract JSON document into a flat snapshot
 * of models and enums. Unknown or malformed documents produce an empty
 * snapshot rather than throwing.
 */
export function parseContractSnapshot(contract: unknown): ContractSnapshot {
  const models = new Map<string, SnapshotModel>();
  const enums = new Map<string, SnapshotEnum>();

  if (!isRecord(contract)) {
    return { models, enums };
  }

  const storageTables = parseStorageTables(contract);
  const domain = contract.domain;

  if (!isRecord(domain) || !isRecord(domain.namespaces)) {
    return { models, enums };
  }

  for (const namespace of Object.values(domain.namespaces)) {
    if (!isRecord(namespace)) {
      continue;
    }

    if (isRecord(namespace.enum)) {
      for (const [enumName, enumValue] of Object.entries(namespace.enum)) {
        if (!isRecord(enumValue) || !Array.isArray(enumValue.members)) {
          continue;
        }

        const members = enumValue.members
          .map((member) => (isRecord(member) ? asString(member.name) : null))
          .filter((member): member is string => member !== null);

        enums.set(enumName, { name: enumName, members });
      }
    }

    if (!isRecord(namespace.models)) {
      continue;
    }

    for (const [modelName, model] of Object.entries(namespace.models)) {
      if (!isRecord(model)) {
        continue;
      }

      const modelStorage = isRecord(model.storage) ? model.storage : {};
      const table = asString(modelStorage.table);
      const storageTable = table ? storageTables.get(table) : undefined;
      const fieldColumns = isRecord(modelStorage.fields)
        ? modelStorage.fields
        : {};

      const fields: SnapshotField[] = [];

      if (isRecord(model.fields)) {
        for (const [fieldName, field] of Object.entries(model.fields)) {
          if (!isRecord(field)) {
            continue;
          }

          const columnMapping = fieldColumns[fieldName];
          const column = isRecord(columnMapping)
            ? asString(columnMapping.column)
            : null;
          const storageColumn = column
            ? storageTable?.columns.get(column)
            : undefined;
          const fieldType = isRecord(field.type) ? field.type : {};
          const valueSet = isRecord(field.valueSet) ? field.valueSet : null;
          const enumName = valueSet ? asString(valueSet.entityName) : null;

          fields.push({
            name: fieldName,
            column,
            type:
              enumName ??
              storageColumn?.nativeType ??
              codecToFriendlyType(asString(fieldType.codecId)),
            nullable: storageColumn?.nullable ?? field.nullable === true,
            defaultValue: storageColumn?.defaultValue ?? null,
            enumName,
            isPrimaryKey:
              column !== null &&
              (storageTable?.primaryKeyColumns.has(column) ?? false),
          });
        }
      }

      fields.sort((left, right) => {
        if (left.isPrimaryKey !== right.isPrimaryKey) {
          return left.isPrimaryKey ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

      const relations: SnapshotRelation[] = [];

      if (isRecord(model.relations)) {
        for (const [relationName, relation] of Object.entries(
          model.relations,
        )) {
          if (!isRecord(relation)) {
            continue;
          }

          const to = isRecord(relation.to) ? relation.to : null;
          const toModel = to ? asString(to.model) : null;

          if (!toModel) {
            continue;
          }

          relations.push({
            name: relationName,
            toModel,
            cardinality: asString(relation.cardinality) ?? "1:N",
          });
        }
      }

      relations.sort((left, right) => left.name.localeCompare(right.name));

      models.set(modelName, {
        name: modelName,
        table,
        fields,
        relations,
        indexes: storageTable ? [...storageTable.indexes].sort() : [],
      });
    }
  }

  return { models, enums };
}

function describeNullable(nullable: boolean): string {
  return nullable ? "optional" : "required";
}

function diffFields(
  before: SnapshotModel | undefined,
  after: SnapshotModel | undefined,
): FieldDiff[] {
  const beforeFields = new Map(
    (before?.fields ?? []).map((field) => [field.name, field]),
  );
  const afterFields = new Map(
    (after?.fields ?? []).map((field) => [field.name, field]),
  );
  const names = [...new Set([...beforeFields.keys(), ...afterFields.keys()])];
  const diffs: FieldDiff[] = [];

  for (const name of names) {
    const fieldBefore = beforeFields.get(name);
    const fieldAfter = afterFields.get(name);

    if (fieldBefore && !fieldAfter) {
      diffs.push({ name, status: "removed", field: fieldBefore, details: [] });
      continue;
    }

    if (!fieldBefore && fieldAfter) {
      diffs.push({ name, status: "added", field: fieldAfter, details: [] });
      continue;
    }

    if (!fieldBefore || !fieldAfter) {
      continue;
    }

    const details: FieldChangeDetail[] = [];

    if (fieldBefore.type !== fieldAfter.type) {
      details.push({
        aspect: "type",
        before: fieldBefore.type,
        after: fieldAfter.type,
      });
    }

    if (fieldBefore.nullable !== fieldAfter.nullable) {
      details.push({
        aspect: "nullable",
        before: describeNullable(fieldBefore.nullable),
        after: describeNullable(fieldAfter.nullable),
      });
    }

    if (fieldBefore.defaultValue !== fieldAfter.defaultValue) {
      details.push({
        aspect: "default",
        before: fieldBefore.defaultValue ?? "none",
        after: fieldAfter.defaultValue ?? "none",
      });
    }

    if (fieldBefore.isPrimaryKey !== fieldAfter.isPrimaryKey) {
      details.push({
        aspect: "key",
        before: fieldBefore.isPrimaryKey ? "@id" : "plain",
        after: fieldAfter.isPrimaryKey ? "@id" : "plain",
      });
    }

    diffs.push({
      name,
      status: details.length > 0 ? "changed" : "unchanged",
      field: fieldAfter,
      details,
    });
  }

  const order = (status: DiffStatus): number =>
    status === "added"
      ? 0
      : status === "changed"
        ? 1
        : status === "removed"
          ? 2
          : 3;

  return diffs.sort((left, right) => {
    const statusDelta = order(left.status) - order(right.status);

    if (statusDelta !== 0) {
      return statusDelta;
    }

    if (left.field.isPrimaryKey !== right.field.isPrimaryKey) {
      return left.field.isPrimaryKey ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function relationKey(relation: SnapshotRelation): string {
  return `${relation.name}→${relation.toModel}:${relation.cardinality}`;
}

/**
 * Diffs two contract snapshots into the render model for the visual
 * migration diff. Passing `null` for the before document treats every
 * model and enum as newly added (a baseline migration).
 */
export function diffContracts(
  contractBefore: unknown,
  contractAfter: unknown,
): MigrationDiff {
  const before = parseContractSnapshot(contractBefore);
  const after = parseContractSnapshot(contractAfter);

  const modelNames = [
    ...new Set([...before.models.keys(), ...after.models.keys()]),
  ].sort();
  const models: ModelDiff[] = [];

  for (const name of modelNames) {
    const modelBefore = before.models.get(name);
    const modelAfter = after.models.get(name);
    const fields = diffFields(modelBefore, modelAfter);
    const beforeIndexes = new Set(modelBefore?.indexes ?? []);
    const afterIndexes = new Set(modelAfter?.indexes ?? []);
    const addedIndexes = [...afterIndexes].filter(
      (index) => !beforeIndexes.has(index),
    );
    const removedIndexes = [...beforeIndexes].filter(
      (index) => !afterIndexes.has(index),
    );
    const beforeRelations = new Map(
      (modelBefore?.relations ?? []).map((relation) => [
        relationKey(relation),
        relation,
      ]),
    );
    const afterRelations = new Map(
      (modelAfter?.relations ?? []).map((relation) => [
        relationKey(relation),
        relation,
      ]),
    );
    const addedRelations = [...afterRelations.entries()]
      .filter(([key]) => !beforeRelations.has(key))
      .map(([, relation]) => relation);
    const removedRelations = [...beforeRelations.entries()]
      .filter(([key]) => !afterRelations.has(key))
      .map(([, relation]) => relation);

    let status: DiffStatus;

    if (modelBefore && !modelAfter) {
      status = "removed";
    } else if (!modelBefore && modelAfter) {
      status = "added";
    } else {
      const hasFieldChanges = fields.some(
        (field) => field.status !== "unchanged",
      );
      // Relation changes alone don't flip a model to "changed": a
      // back-relation is stored via the other table's foreign key, so
      // the model's own table is untouched. Relation additions still
      // surface through emphasized edges on the canvas.
      const hasStorageChanges =
        addedIndexes.length > 0 || removedIndexes.length > 0;

      status = hasFieldChanges || hasStorageChanges ? "changed" : "unchanged";
    }

    models.push({
      name,
      status,
      table: modelAfter?.table ?? modelBefore?.table ?? null,
      fields,
      addedIndexes,
      removedIndexes,
      addedRelations,
      removedRelations,
      relations: modelAfter?.relations ?? modelBefore?.relations ?? [],
    });
  }

  const enumNames = [
    ...new Set([...before.enums.keys(), ...after.enums.keys()]),
  ].sort();
  const enums: EnumDiff[] = [];

  for (const name of enumNames) {
    const enumBefore = before.enums.get(name);
    const enumAfter = after.enums.get(name);
    const beforeMembers = new Set(enumBefore?.members ?? []);
    const afterMembers = new Set(enumAfter?.members ?? []);
    const memberNames = [...new Set([...beforeMembers, ...afterMembers])];
    const members = memberNames.map((member) => ({
      name: member,
      status:
        beforeMembers.has(member) && afterMembers.has(member)
          ? ("unchanged" as const)
          : afterMembers.has(member)
            ? ("added" as const)
            : ("removed" as const),
    }));

    const status: DiffStatus =
      enumBefore && !enumAfter
        ? "removed"
        : !enumBefore && enumAfter
          ? "added"
          : members.some((member) => member.status !== "unchanged")
            ? "changed"
            : "unchanged";

    enums.push({ name, status, members });
  }

  const stats: MigrationDiffStats = {
    modelsAdded: models.filter((model) => model.status === "added").length,
    modelsRemoved: models.filter((model) => model.status === "removed").length,
    modelsChanged: models.filter((model) => model.status === "changed").length,
    fieldsAdded: models
      .filter((model) => model.status !== "added")
      .reduce(
        (sum, model) =>
          sum + model.fields.filter((field) => field.status === "added").length,
        0,
      ),
    fieldsRemoved: models
      .filter((model) => model.status !== "removed")
      .reduce(
        (sum, model) =>
          sum +
          model.fields.filter((field) => field.status === "removed").length,
        0,
      ),
    fieldsChanged: models.reduce(
      (sum, model) =>
        sum + model.fields.filter((field) => field.status === "changed").length,
      0,
    ),
    enumsAdded: enums.filter((value) => value.status === "added").length,
    enumsRemoved: enums.filter((value) => value.status === "removed").length,
    indexesAdded: models.reduce(
      (sum, model) => sum + model.addedIndexes.length,
      0,
    ),
    indexesRemoved: models.reduce(
      (sum, model) => sum + model.removedIndexes.length,
      0,
    ),
  };

  return { models, enums, stats };
}

/**
 * Summarizes a diff into short human chips, e.g. `["+2 models", "~1 model"]`.
 */
export function summarizeDiff(stats: MigrationDiffStats): string[] {
  const chips: string[] = [];
  const pluralize = (count: number, noun: string) =>
    count === 1
      ? `${count} ${noun}`
      : `${count} ${noun === "index" ? "indexes" : `${noun}s`}`;

  if (stats.modelsAdded > 0) {
    chips.push(`+${pluralize(stats.modelsAdded, "model")}`);
  }

  if (stats.modelsRemoved > 0) {
    chips.push(`−${pluralize(stats.modelsRemoved, "model")}`);
  }

  if (stats.modelsChanged > 0) {
    chips.push(`~${pluralize(stats.modelsChanged, "model")}`);
  }

  if (stats.fieldsAdded > 0) {
    chips.push(`+${pluralize(stats.fieldsAdded, "field")}`);
  }

  if (stats.fieldsRemoved > 0) {
    chips.push(`−${pluralize(stats.fieldsRemoved, "field")}`);
  }

  if (stats.fieldsChanged > 0) {
    chips.push(`~${pluralize(stats.fieldsChanged, "field")}`);
  }

  if (stats.enumsAdded > 0) {
    chips.push(`+${pluralize(stats.enumsAdded, "enum")}`);
  }

  if (stats.enumsRemoved > 0) {
    chips.push(`−${pluralize(stats.enumsRemoved, "enum")}`);
  }

  if (stats.indexesAdded > 0) {
    chips.push(`+${pluralize(stats.indexesAdded, "index")}`);
  }

  if (stats.indexesRemoved > 0) {
    chips.push(`−${pluralize(stats.indexesRemoved, "index")}`);
  }

  return chips;
}
