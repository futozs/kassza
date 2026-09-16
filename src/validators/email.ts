const MAX_EMAIL_LENGTH = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  if (typeof value !== 'string') return false
  const email = value.trim()
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email)
}
