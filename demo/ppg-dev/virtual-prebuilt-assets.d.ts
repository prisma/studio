declare module "virtual:prebuilt-assets" {
  export interface BuiltAsset {
    bytes: ArrayBuffer;
    contentType: string;
  }

  export const appScript: string;
  export const appStyles: string;
  export const builtAssets: Map<string, BuiltAsset>;
}
