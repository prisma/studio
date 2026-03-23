import type { Product } from "./product";

/**
 * @see {@link https://github.com/prisma/checkpoint.prisma.io#response}
 */
export interface CheckResponseBody {
  /**
   * New security alerts or notices for this version.
   */
  alerts: Alert[];

  /**
   * CheckpointVersion is a hardcoded value sent by checkpoint-client
   */
  checkpoint_version?: number;

  /**
   * ClientEventID is a unique id sent by by checkpoint-client
   */
  client_event_id?: string;

  /**
   * URL to the latest version's changelog.
   */
  current_changelog_url: string;

  /**
   * URL to download the latest version.
   */
  current_download_url: string;

  /**
   * Release date of the latest version in Unix time.
   */
  current_release_date: number;

  /**
   * Latest version of the product.
   */
  current_version: string;

  /**
   * Install command
   * NOTE: this is not in the hashicorp spec
   *
   * @example "npm install --save-dev @prisma/cli"
   */
  install_command: string;

  /**
   * LocalTimestamp is a RFC3339 formatted string with timezone sent by the client.
   */
  local_timestamp_without_timezone?: string;

  /**
   * True if the our version is outdated.
   */
  outdated: boolean;

  /**
   * The npm package name
   */
  package: string;

  /**
   * PreviousClientEventID is a unique id sent by by checkpoint-client
   */
  previous_client_event_id?: string;

  /**
   * Previously installed version
   *
   * @example "0.11.0"
   */
  previous_version: string;

  /**
   * Product we're checking on.
   */
  product: Product;

  /**
   * Website for the project.
   */
  project_website: string;

  /**
   * The npm release channel/tag
   */
  release_tag: string;

  schema_generators_providers: string[];

  schema_preview_features: string[];

  schema_providers: string[];
}

export interface Alert {
  /**
   * Date of the alert in Unix time.
   */
  date: string;

  /**
   * ID of the alert.
   */
  id: string;

  /**
   * Severity of the alert.
   */
  level: string;

  /**
   * Alert message.
   */
  message: string;

  /**
   * URL for more information about the alert.
   */
  url?: string | null;
}
