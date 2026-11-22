export function zonedDateTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error('Choose a valid date and time.')
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  if (new Date(wallTime).toISOString().slice(0, 16) !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`)
    throw new Error('Choose a valid date and time.')
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  let instant = wallTime
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value: part }) => [type, part]))
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const next = instant + wallTime - represented
    if (next === instant) break
    instant = next
  }
  const roundTrip = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value: part }) => [type, part]))
  if (Number(roundTrip.year) !== year || Number(roundTrip.month) !== month || Number(roundTrip.day) !== day || Number(roundTrip.hour) !== hour || Number(roundTrip.minute) !== minute)
    throw new Error('That local time does not exist in the selected time zone. Choose another time.')
  return new Date(instant).toISOString()
}
