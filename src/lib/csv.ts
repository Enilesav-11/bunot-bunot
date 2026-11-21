export function csvCell(value: string | number) {
  const raw = String(value)
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}
