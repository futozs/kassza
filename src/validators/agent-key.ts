export function isValidAgentKey(value: string): boolean {
  if (typeof value !== 'string') return false
  const key = value.trim()
  return key !== '' && !/\s/.test(key) && key === key.toLowerCase()
}
