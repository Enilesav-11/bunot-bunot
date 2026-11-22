import assert from 'node:assert/strict'
import test from 'node:test'
import { zonedDateTimeToIso } from './time-zone'

test('converts the entered event time in its selected zone', () => {
  assert.equal(zonedDateTimeToIso('2026-12-25T18:30', 'Asia/Manila'), '2026-12-25T10:30:00.000Z')
})

test('rejects invalid dates and nonexistent daylight-saving times', () => {
  assert.throws(() => zonedDateTimeToIso('2026-02-30T18:30', 'Asia/Manila'), /valid date and time/)
  assert.throws(() => zonedDateTimeToIso('2026-03-08T02:30', 'America/New_York'), /does not exist/)
})
