export interface NavVatCategoryAmounts {
  readonly vat: string
  readonly saleDocument: number
  readonly modifyingDocument: number
}

export interface NavReceiptData {
  readonly applicableDate: string
  readonly serialNumber: string
  readonly currency: string
  readonly exchangeRate: number | null
  readonly vatCategories: readonly NavVatCategoryAmounts[]
  readonly total: number
  readonly numberOfSaleDocument: number
  readonly numberOfModifyingDocument: number
}

export type NavReportStatus = 'RECORDED' | 'INVALIDATED'

export interface NavReportListItem {
  readonly id: string
  readonly applicableDate: string
  readonly serialNumber: string
  readonly numberOfSaleDocument: number
  readonly numberOfModifyingDocument: number
  readonly totalAmount: number
  readonly totalAmountInForint: number
  readonly status: NavReportStatus
  readonly softwareName: string
}

export interface NavReportPage {
  readonly items: readonly NavReportListItem[]
  readonly page: number
  readonly pageSize: number
  readonly totalRowCount: number
}

export interface NavReportDetail extends NavReceiptData {
  readonly id: string
  readonly status: NavReportStatus
  readonly softwareName: string
  readonly totalAmountInForint: number
}

export interface NavVatCategoryInfo {
  readonly name: string
  readonly validFrom: string
  readonly validTo?: string | undefined
}

export interface NavCurrencyInfo {
  readonly code: string
  readonly name: string
}

export interface NavAuthToken {
  readonly token: string
  readonly validTo: string
}

export type NavReportOrderProperty =
  | 'ID'
  | 'APPLICABLE_DATE'
  | 'CREATED_DATE'
  | 'SERIAL_NUMBER'
  | 'NUM_SALE_DOC'
  | 'NUM_MODIFY_DOC'
  | 'TOTAL'
  | 'TOTAL_IN_FT'
  | 'STATE'
  | 'SOFTWARE'

export type NavOrderDirection = 'ASC' | 'DESC'

export interface NavReportQuery {
  readonly from: string
  readonly to: string
  readonly page?: number | undefined
  readonly pageSize?: number | undefined
  readonly orderBy?: NavReportOrderProperty | undefined
  readonly direction?: NavOrderDirection | undefined
}
