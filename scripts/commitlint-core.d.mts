export declare const COMMIT_TYPES: readonly string[]
export declare const MAX_SUBJECT_LENGTH: number
export interface CommitLintResult {
  readonly ok: boolean
  readonly problems: readonly string[]
}
export declare function lintCommitMessage(message: string): CommitLintResult
export declare function isConventional(subject: string): boolean
