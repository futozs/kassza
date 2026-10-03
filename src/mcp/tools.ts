import type { McpTool } from './tool-kit'
import { INVOICE_TOOLS } from './tools-invoice'
import { LOOKUP_TOOLS } from './tools-lookup'
import { RECEIPT_TOOLS } from './tools-receipt'
import { REVERSAL_TOOLS } from './tools-reversal'

export const KASSZA_MCP_TOOLS: readonly McpTool[] = [
  ...INVOICE_TOOLS,
  ...RECEIPT_TOOLS,
  ...REVERSAL_TOOLS,
  ...LOOKUP_TOOLS,
]
