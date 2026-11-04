export declare const VENDOR_NAME_PATTERN: RegExp;
export interface VendorIdentifierFinding {
  readonly line: number;
  readonly text: string;
}
export declare function findVendorIdentifiers(
  filePath: string,
  content: string,
): VendorIdentifierFinding[];
