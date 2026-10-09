export interface ChangelogCommit {
  readonly hash: string
  readonly type: string
  readonly breaking: boolean
  readonly text: string
}
export declare const CHANGELOG_HEADER: string
export declare const UNRELEASED_HEADING: string
export declare const SECTIONS: readonly (readonly [string, string])[]
export declare function splitChangelog(content: string | undefined): {
  unreleased: string
  rest: string
}
export declare function renderChangelogEntry(
  version: string,
  commits: readonly ChangelogCommit[],
  unreleased: string,
  date: string,
): string
export declare function nextVersion(version: string, bump: 'patch' | 'minor' | 'major'): string
export declare function detectBump(
  commits: readonly ChangelogCommit[],
  currentVersion: string,
  requested?: 'patch' | 'minor' | 'major',
): 'patch' | 'minor' | 'major'
export declare function isStableJump(current: string, next: string): boolean
export declare function prependEntry(content: string | undefined, entry: string): string
