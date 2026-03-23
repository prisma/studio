import { isCI, nodeVersion, platform, process, provider } from "std-env";

import type { Product } from "./product";
import type {
  CheckRequestHeaders,
  CheckRequestQueryParameters,
  MultiValueQueryParameterName,
} from "./request";
import type { CheckResponseBody } from "./response";
import { rfc3339 } from "./rfc3339";

export interface CheckOptions {
  additionalData?: unknown;

  /**
   * By default, resolves from `process.arch` if exists, and falls back to `'unknown'`.
   */
  architecture?: NodeJS.Architecture | (string & {});

  /**
   * The URL to use for the check.
   *
   * @default "https://checkpoint.prisma.io"
   */
  baseURL?: string | URL;

  cliInstallType?: "global" | "local";

  cliPathHash?: string;

  command?: string;

  debug?: boolean;

  eventId?: string;

  localTimestamp?: Date;

  ormDatasourceProvider?: string;

  ormGeneratorProviders?: string[];

  ormPreviewFeatures?: string[];

  /**
   * By default, resolves from `process.platform` if exists, and falls back to `'unknown'`.
   */
  platform?: NodeJS.Platform | (string & {});

  previousEventId?: string;

  /**
   * The product to check for updates.
   */
  product: Product;

  projectHash?: string;

  /**
   * A consistent user signature, ideally across products.
   */
  signature: string;

  /**
   * If `true`, will not check for updates.
   *
   * @default false
   */
  skipUpdateCheck?: boolean;

  timestamp?: Date;

  /**
   * The version of the product to check.
   */
  version: string;
}

export const BASE_PATH_PROD = "https://checkpoint.prisma.io/v1";
export const BASE_PATH_STAGING = "https://checkpoint-staging.prisma.io";

export const CHECK_PATHNAME = "check/:product";

export async function check(options: CheckOptions): Promise<CheckResponseBody> {
  const url = new URL(CHECK_PATHNAME, options.baseURL || BASE_PATH_PROD);

  url.pathname = url.pathname.replace(":product", options.product);

  const { additionalData } = options;

  url.search = new URLSearchParams([
    ...Object.entries({
      arch: options.architecture || process.arch || "unknown",
      check_if_update_available: `${options.skipUpdateCheck !== true}`,
      ci: `${isCI}`,
      ci_name: provider,
      cli_install_type: options.cliInstallType || ("" as never),
      cli_path_hash: options.cliPathHash || "",
      client_event_id: options.eventId || "",
      command: options.command || "",
      information:
        typeof additionalData === "string"
          ? additionalData
          : additionalData
            ? JSON.stringify(additionalData)
            : "",
      local_timestamp: rfc3339(options.timestamp),
      node_version: nodeVersion || "0.0.0",
      os: options.platform || platform || "unknown",
      previous_client_event_id: options.previousEventId || "",
      project_hash: options.projectHash || "",
      signature: options.signature,
      version: options.version,
    } satisfies Omit<
      CheckRequestQueryParameters,
      MultiValueQueryParameterName<CheckRequestQueryParameters>
    >),
    ...getQueryParameterListPairs(
      "schema_generators_providers",
      options.ormGeneratorProviders,
    ),
    ...getQueryParameterListPairs(
      "schema_preview_features",
      options.ormPreviewFeatures,
    ),
    ...getQueryParameterListPairs("schema_providers", [
      options.ormDatasourceProvider,
    ]),
  ]).toString();

  if (options.debug) {
    console.debug("Sending request to:", url.toString());
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "prisma/js-checkpoint",
    } satisfies CheckRequestHeaders,
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      `checkpoint response error: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as never;
}

function getQueryParameterListPairs(
  parameterName: MultiValueQueryParameterName<CheckRequestQueryParameters>,
  values: (string | undefined)[] | undefined,
): [string, string][] {
  return (
    values
      ?.filter(Boolean)
      .map(
        (value) =>
          [parameterName, value!] satisfies [
            MultiValueQueryParameterName<CheckRequestQueryParameters>,
            string,
          ],
      ) || []
  );
}
