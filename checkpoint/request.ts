/**
 * @see {@link https://github.com/prisma/checkpoint.prisma.io#query-parameters}
 */
export interface CheckRequestQueryParameters {
  /**
   * Architecture of the client (e.g. amd64)
   */
  arch: NodeJS.Architecture | (string & {});

  /**
   * Defaults to `true`.
   */
  check_if_update_available?: `${boolean}`;

  /**
   * An integer.
   *
   * @see {@link https://github.com/prisma/checkpoint.prisma.io/blob/main/src/internals/api/check.ts#L168-L189}
   */
  checkpoint_version?: number;

  /**
   * ???
   */
  ci?: `${boolean}`;

  /**
   * Holds the name of the CI system.
   */
  ci_name?: string;

  /**
   * ???
   */
  cli_install_type?: "global" | "local";

  /**
   * ???
   */
  cli_path_hash?: string;

  /**
   * ???
   */
  client_event_id?: string;

  /**
   * ???
   */
  command?: string;

  /**
   * ???
   */
  information?: string;

  /**
   * ???
   */
  local_timestamp?: string;

  /**
   * Node version of the client (e.g. 12.0.1)
   */
  node_version: string;

  /**
   * Operating system of the client (e.g. darwin)
   */
  os: NodeJS.Platform | (string & {});

  /**
   * ???
   */
  previous_client_event_id?: string;

  /**
   * ???
   */
  project_hash?: string;

  /**
   * ???
   */
  schema_generators_providers?: string[];

  /**
   * ???
   */
  schema_preview_features?: string[];

  /**
   * ???
   */
  schema_providers?: string[];

  /**
   * Anonymous persistent UUID (v4) on the client
   */
  signature: string;

  /**
   * Current version of the client's product (e.g. 2.0.0-preview018)
   */
  version: string;
}

export type MultiValueQueryParameterName<T> = NonNullable<
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [K in keyof T & string]: any[] extends T[K] ? K : never;
  }[keyof T & string]
>;

export interface CheckRequestHeaders extends Partial<Record<string, string>> {
  "User-Agent"?: string;
}
