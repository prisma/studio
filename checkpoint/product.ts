export type Product =
  | MatureProduct
  | NewerProduct
  | DiscontinuedProduct
  | (string & {});

export const NEWER_PRODUCTS = [
  /** Prisma Studio (new embedded version) */
  "prisma-studio-embedded",
  /** Prisma Studio (new embedded version in the VS Code extension) */
  "prisma-studio-vscode",
] as const;
export type NewerProduct = (typeof NEWER_PRODUCTS)[number];

export const MATURE_PRODUCTS = [
  /** Prisma ORM */
  "prisma",
  /** Prvisma VS Code extension */
  "prisma.prisma",
  /** Prisma VS Code extension (insider version) */
  "prisma.prisma-insider",
] as const;
export type MatureProduct = (typeof MATURE_PRODUCTS)[number];

/**
 * @deprecated these are discontinued products. You probably don't want to track them.
 */
export const DISCONTINUED_PRODUCTS = [
  /** old studio (browser version) */
  "prisma-studio",
  /** old studio (electron version) */
  "prisma-studio-electron",
] as const;
/**
 * @deprecated these are discontinued products. You probably don't want to track them.
 */
export type DiscontinuedProduct = (typeof DISCONTINUED_PRODUCTS)[number];
