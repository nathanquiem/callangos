export function normalizeBrazilianPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const national = digits.startsWith('55') ? digits.slice(2) : digits

  if (national.length !== 10 && national.length !== 11) {
    throw new Error('Telefone deve conter DDD e 10 ou 11 dígitos.')
  }

  return `+55${national}`
}

export function formatBrazilianPhone(e164: string) {
  const digits = e164.replace(/^\+55/, '')
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
}
