export function parseParticipantNames(input: string, csv = false): string[] {
  input = input.replace(/^\uFEFF/, '')
  if (!csv) return input.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
        closedQuote = true
      } else if (char === '\r' || char === '\n') {
        throw new Error('CSV names cannot contain line breaks.')
      } else field += char
    } else if (char === ',' || char === '\r' || char === '\n') {
      row.push(field.trim())
      field = ''
      closedQuote = false
      if (char !== ',') {
        if (char === '\r' && input[i + 1] === '\n') i++
        if (row.some(Boolean)) rows.push(row)
        row = []
      }
    } else if (char === '"') {
      if (field.trim() || closedQuote) throw new Error('Check the quotation marks in your CSV.')
      quoted = true
    } else if (closedQuote) {
      if (!/\s/.test(char)) throw new Error('Check the text after a quoted CSV value.')
    } else field += char
  }

  if (quoted) throw new Error('A quoted CSV value is missing its closing quote.')
  row.push(field.trim())
  if (row.some(Boolean)) rows.push(row)
  if (rows[0]?.[0] && /^(name|display\s*name|participant(?:\s*name)?)$/i.test(rows[0][0])) rows.shift()
  return rows.map(([name]) => name?.trim() ?? '').filter(Boolean)
}
