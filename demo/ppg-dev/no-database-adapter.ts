import {
  type Adapter,
  type AdapterDeleteDetails,
  type AdapterDeleteOptions,
  type AdapterInsertDetails,
  type AdapterInsertOptions,
  type AdapterIntrospectOptions,
  type AdapterIntrospectResult,
  type AdapterQueryDetails,
  type AdapterQueryOptions,
  type AdapterRawDetails,
  type AdapterRawOptions,
  type AdapterUpdateDetails,
  type AdapterUpdateOptions,
  createAdapterError,
} from "../../data/adapter";

function createUnavailableDatabaseError() {
  return createAdapterError({
    adapterSource: "streams-only-demo",
    error: new Error("This Studio session was started without a database URL."),
    query: {
      parameters: [],
      sql: "",
    },
  });
}

const EMPTY_INTROSPECTION_RESULT = {
  filterOperators: [],
  query: {
    parameters: [],
    sql: "",
  },
  schemas: {
    public: {
      name: "public",
      tables: {},
    },
  },
  timezone: "UTC",
} satisfies AdapterIntrospectResult;

export function createNoDatabaseAdapter(): Adapter {
  return {
    capabilities: {
      fullTableSearch: false,
      sqlDialect: "postgresql",
      sqlEditorAutocomplete: false,
      sqlEditorLint: false,
    },
    defaultSchema: "public",
    delete(_details: AdapterDeleteDetails, _options: AdapterDeleteOptions) {
      return Promise.resolve(createUnavailableDatabaseError());
    },
    insert(_details: AdapterInsertDetails, _options: AdapterInsertOptions) {
      return Promise.resolve(createUnavailableDatabaseError());
    },
    introspect(_options: AdapterIntrospectOptions) {
      return Promise.resolve([null, EMPTY_INTROSPECTION_RESULT]);
    },
    query(_details: AdapterQueryDetails, _options: AdapterQueryOptions) {
      return Promise.resolve(createUnavailableDatabaseError());
    },
    raw(_details: AdapterRawDetails, _options: AdapterRawOptions) {
      return Promise.resolve(createUnavailableDatabaseError());
    },
    update(_details: AdapterUpdateDetails, _options: AdapterUpdateOptions) {
      return Promise.resolve(createUnavailableDatabaseError());
    },
  };
}
