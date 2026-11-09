const NATIONAL_NUMBER = /^[1-9]\d{9}$/

export function normalizeNigerianPhone(input: string): string {
  const compact = input.trim().replace(/[\s\-()]/g, '')
  const digits = compact.startsWith('+') ? compact.slice(1) : compact

  let national: string
  if (digits.startsWith('234') && digits.length === 13) {
    national = digits.slice(3)
  } else if (digits.startsWith('0') && digits.length === 11) {
    national = digits.slice(1)
  } else if (digits.length === 10) {
    national = digits
  } else {
    throw new Error(`Invalid Nigerian phone number: ${input}`)
  }

  if (!NATIONAL_NUMBER.test(national)) {
    throw new Error(`Invalid Nigerian phone number: ${input}`)
  }

  return `+234${national}`
}
