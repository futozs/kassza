import type { NavReceiptClient, NavReceiptData } from '../src/nav'
export interface RehearsalResult {
  readonly step: string
  readonly ok: boolean
  readonly durationMs: number
  readonly error?: string
}
export declare const REHEARSAL_STEPS: readonly string[]
export declare function rehearsalReport(
  applicableDate: string,
  serialNumber: string,
  total: number,
): NavReceiptData
export declare function runNavRehearsal(
  nav: Pick<
    NavReceiptClient,
    | 'environment'
    | 'canWrite'
    | 'authenticate'
    | 'registerSoftware'
    | 'vatCategories'
    | 'submitReport'
    | 'listReports'
    | 'getReport'
    | 'modifyReport'
    | 'invalidateReport'
  >,
  options: {
    readonly date: string
    readonly serialNumber: string
    readonly softwareName?: string
    readonly log?: (line: string) => void
  },
): Promise<RehearsalResult[]>
