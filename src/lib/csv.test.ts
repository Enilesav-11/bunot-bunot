import assert from 'node:assert/strict'
import test from 'node:test'
import { csvCell } from './csv'

test('CSV cells quote text and neutralize spreadsheet formulas', () => {
  assert.equal(csvCell('Ana "Pepe" Cruz'), '"Ana ""Pepe"" Cruz"')
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1:A2)', '\t=1+1']) assert.equal(csvCell(value), `"'${value}"`)
})
