import type { AgentErrorCodeInfo } from '../src/core/errors'
export declare const ERROR_PAGES_DIR: string
export declare function hungarianSuffix(number: number): string
export declare function renderCodePage(
  code: number,
  info: AgentErrorCodeInfo,
  related: readonly number[],
): string
export declare function renderIndex(
  codes: readonly number[],
  table: Readonly<Record<number, AgentErrorCodeInfo>>,
): string
export declare function renderErrorPages(
  table: Readonly<Record<number, AgentErrorCodeInfo>>,
): Map<string, string>
