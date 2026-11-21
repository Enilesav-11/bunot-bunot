'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { ParticipantRow } from './participant-row'

type Person = { id: string; display_name: string; status: string }

export function ParticipantList({ eventId, people, locked }: { eventId: string; people: Person[]; locked: boolean }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const person of people) counts.set(person.display_name.trim().toLocaleLowerCase(), (counts.get(person.display_name.trim().toLocaleLowerCase()) ?? 0) + 1)
    return counts
  }, [people])
  const visible = useMemo(() => people.filter((person) => (filter === 'all' || person.status === filter) && person.display_name.toLowerCase().includes(query.toLowerCase())), [people, filter, query])
  return <>
    <div className="roster-tools"><label className="search-field"><Search size={16} /><span className="sr-only">Search names</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a name" /></label><label className="sr-only" htmlFor="roster-filter">Filter participants</label><select id="roster-filter" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Active</option><option value="removed">Removed</option><option value="all">All names</option></select></div>
    {visible.length ? <ul className="participant-list">{visible.map((person) => <ParticipantRow key={person.id} eventId={eventId} id={person.id} name={person.display_name} active={person.status === 'active'} locked={locked} duplicate={(duplicates.get(person.display_name.trim().toLocaleLowerCase()) ?? 0) > 1} />)}</ul> : <p className="empty-inline">{people.length ? 'No names match that filter.' : 'No names yet. Add a few to begin.'}</p>}
  </>
}
