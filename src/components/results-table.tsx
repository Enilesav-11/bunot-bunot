'use client'

import { useMemo, useState } from 'react'
import { Printer, Search } from 'lucide-react'

export type ResultRow = { round: number; name: string; order: number; drawnAt: string }

export function ResultsTable({ rows, exportHref }: { rows: ResultRow[]; exportHref: string }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => rows.filter((row) => `${row.name} ${row.round} ${row.order}`.toLowerCase().includes(query.toLowerCase())), [rows, query])
  return <>
    <div className="results-toolbar"><label className="search-field"><Search size={17} /><span className="sr-only">Search results</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or rounds" /></label><div><a className="button button-outline" href={exportHref}>Download CSV</a><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Print</button></div></div>
    {filtered.length ? <div className="table-wrap"><table className="results-table"><thead><tr><th>Round</th><th>Pick</th><th>Name</th><th>Drawn at</th></tr></thead><tbody>{filtered.map((row, index) => <tr key={`${row.round}-${row.order}-${index}`}><td>{row.round}</td><td>#{row.order}</td><td>{row.name}</td><td>{new Date(row.drawnAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td></tr>)}</tbody></table></div> : <p className="empty-inline">{rows.length ? 'No results match that search.' : 'No draws yet.'}</p>}
  </>
}
