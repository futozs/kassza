export const SZAMLAZZ_AGENT_URL = 'https://www.szamlazz.hu/szamla/'

export const AGENT_ACTIONS = {
  createInvoice: 'action-xmlagentxmlfile',
  reverseInvoice: 'action-szamla_agent_st',
  registerPayment: 'action-szamla_agent_kifiz',
  getInvoicePdf: 'action-szamla_agent_pdf',
  getInvoiceXml: 'action-szamla_agent_xml',
  deleteProforma: 'action-szamla_agent_dijbekero_torlese',
  createReceipt: 'action-szamla_agent_nyugta_create',
  reverseReceipt: 'action-szamla_agent_nyugta_storno',
  getReceipt: 'action-szamla_agent_nyugta_get',
  sendReceipt: 'action-szamla_agent_nyugta_send',
  queryTaxpayer: 'action-szamla_agent_taxpayer',
} as const

export type AgentAction = keyof typeof AGENT_ACTIONS
export type AgentActionField = (typeof AGENT_ACTIONS)[AgentAction]

export const MAX_INVOICE_ATTACHMENTS = 5
