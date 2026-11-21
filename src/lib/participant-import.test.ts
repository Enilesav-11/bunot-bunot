import assert from 'node:assert/strict'
import test from 'node:test'
import { parseParticipantNames } from './participant-import'

test('multiline names trim whitespace and ignore blank lines', () => {
  assert.deepEqual(parseParticipantNames(' Ana Cruz \r\n\n Jose Reyes\n'), ['Ana Cruz', 'Jose Reyes'])
})

test('CSV reads first column, optional header, commas, and escaped quotes', () => {
  assert.deepEqual(parseParticipantNames('\uFEFFName,Email\n"Santos, Ana",a@example.com\n"Jo ""Pepe"" Reyes",b@example.com', true), [
    'Santos, Ana', 'Jo "Pepe" Reyes',
  ])
})

test('CSV rejects malformed quoting and line breaks inside a name', () => {
  assert.throws(() => parseParticipantNames('"Ana Cruz', true), /closing quote/)
  assert.throws(() => parseParticipantNames('"Ana"oops', true), /text after/)
  assert.throws(() => parseParticipantNames('"Ana\nCruz"', true), /line breaks/)
})
