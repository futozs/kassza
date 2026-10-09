export interface DriftChange {
  readonly name: string
  readonly kind: 'new' | 'changed' | 'missing'
  readonly detail: string
}
export declare function decodeEntities(text: string): string
export declare function mainText(html: string): string
export declare function sha256(content: string): string
export declare function tableCodes(html: string): number[]
export declare function ipv4Addresses(text: string): string[]
export declare function sourceErrorCodes(errorsSource: string): number[]
export declare function sourceIps(ipSource: string): string[]
export declare function compareSnapshots(
  locked: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
): DriftChange[]
export declare function consistencyProblems(input: {
  readonly documentedCodes: readonly number[]
  readonly knownCodes: readonly number[]
  readonly pageIps: readonly string[]
  readonly knownIps: readonly string[]
}): string[]
export declare function renderReport(
  changes: readonly DriftChange[],
  problems: readonly string[],
): string
