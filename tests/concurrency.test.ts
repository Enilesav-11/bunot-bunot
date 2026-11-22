import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

test('anonymous sessions isolate data and concurrent draws select each participant once', async () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  assert.ok(url && serviceKey && anonKey, 'Start local Supabase and provide its URL, service role key, and publishable key.')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const rateKey = hash(randomUUID())
  const tokenA = randomBytes(32).toString('base64url')
  const tokenB = randomBytes(32).toString('base64url')
  const recoveryCode = 'ABCD-1234-EF56-7890-ABCD'
  const createdIds: string[] = []

  async function create(name: string, token: string) {
    const { data, error } = await admin.rpc('create_bunutan_session', {
      p_session_name: name, p_description: null, p_public_id: randomBytes(32).toString('base64url'),
      p_management_hash: hash(token), p_recovery_hash: hash(recoveryCode), p_rate_key: rateKey,
    })
    if (error || !data) throw error ?? new Error('Session creation failed.')
    createdIds.push(data.session_id)
    return data
  }

  try {
    const first = await create('Concurrency check', tokenA)
    const second = await create('Isolation check', tokenB)
    const { error: isolationError } = await admin.rpc('get_bunutan_session', {
      p_session_id: second.session_id, p_capability: tokenA, p_rate_key: rateKey,
    })
    assert.ok(isolationError, 'A capability from another session must not read this session.')

    const names = ['Same name', 'Same name', ...Array.from({ length: 18 }, (_, i) => `Guest ${i + 1}`)]
    const { data: added, error: addError } = await admin.rpc('add_bunutan_participants', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey, p_names: names,
    })
    if (addError) throw addError
    assert.equal(added, 20, 'Repeated display names remain separate participant IDs.')

    const { data: roundId, error: startError } = await admin.rpc('start_bunutan_round', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey,
    })
    if (startError || !roundId) throw startError ?? new Error('Round start failed.')
    const replayKey = randomUUID()
    const firstDraw = await admin.rpc('draw_bunutan_next', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey, p_round_id: roundId, p_request_key: replayKey,
    })
    if (firstDraw.error || !firstDraw.data) throw firstDraw.error ?? new Error('First draw failed.')
    const replay = await admin.rpc('draw_bunutan_next', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey, p_round_id: roundId, p_request_key: replayKey,
    })
    if (replay.error || !replay.data) throw replay.error ?? new Error('Draw retry failed.')
    assert.equal(replay.data.result.id, firstDraw.data.result.id, 'Retry returns the already saved draw.')

    const draws = await Promise.all(Array.from({ length: 19 }, () => admin.rpc('draw_bunutan_next', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey,
      p_round_id: roundId, p_request_key: randomUUID(),
    })))
    const results = [firstDraw, ...draws]
    for (const draw of results) if (draw.error || !draw.data) throw draw.error ?? new Error('Concurrent draw failed.')
    const participantIds = results.map((draw) => draw.data!.result.participant_id)
    assert.equal(new Set(participantIds).size, 20)
    assert.ok(results.every((draw) => draw.data!.remaining_count >= 0))

    const { data: saved, error: savedError } = await admin.rpc('get_bunutan_session', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey,
    })
    if (savedError || !saved) throw savedError ?? new Error('Saved session could not be read.')
    assert.equal(saved.rounds[0].results.length, 20)
    assert.equal(saved.rounds[0].status, 'completed')
    assert.equal('management_token_hash' in saved.session, false)

    const { data: publicView, error: publicError } = await admin.rpc('get_public_bunutan', { p_public_id: first.public_id, p_rate_key: rateKey })
    if (publicError || !publicView) throw publicError ?? new Error('Public view failed.')
    assert.equal(publicView.remaining_count, 0)
    assert.equal('participants' in publicView, false)
    assert.equal('rounds' in publicView, false)
    const { error: directReadError } = await anonymous.from('participants').select('display_name').limit(1)
    assert.ok(directReadError, 'Public browser credentials cannot read participant tables directly.')

    const newToken = randomBytes(32).toString('base64url')
    const { error: recoveryError } = await admin.rpc('recover_bunutan_session', {
      p_session_id: first.session_id, p_recovery_hash: hash(recoveryCode), p_management_hash: hash(newToken), p_rate_key: rateKey,
    })
    if (recoveryError) throw recoveryError
    const { error: oldCapabilityError } = await admin.rpc('get_bunutan_session', {
      p_session_id: first.session_id, p_capability: tokenA, p_rate_key: rateKey,
    })
    assert.ok(oldCapabilityError, 'Recovery rotates the old management capability.')
    const { data: recovered, error: recoveredError } = await admin.rpc('get_bunutan_session', {
      p_session_id: first.session_id, p_capability: newToken, p_rate_key: rateKey,
    })
    if (recoveredError || !recovered) throw recoveredError ?? new Error('Recovered session could not be read.')

    const nextRecoveryCode = 'FEDC-BA98-7654-3210-ABCD'
    const { error: rotateError } = await admin.rpc('rotate_bunutan_recovery_code', {
      p_session_id: first.session_id, p_capability: newToken, p_rate_key: rateKey, p_recovery_hash: hash(nextRecoveryCode),
    })
    if (rotateError) throw rotateError
    const { error: spentCodeError } = await admin.rpc('recover_bunutan_session', {
      p_session_id: first.session_id, p_recovery_hash: hash(recoveryCode), p_management_hash: hash(randomBytes(32).toString('base64url')), p_rate_key: rateKey,
    })
    assert.ok(spentCodeError, 'Rotating a recovery code invalidates the prior code.')
    const replacementToken = randomBytes(32).toString('base64url')
    const { error: replacementError } = await admin.rpc('recover_bunutan_session', {
      p_session_id: first.session_id, p_recovery_hash: hash(nextRecoveryCode), p_management_hash: hash(replacementToken), p_rate_key: rateKey,
    })
    if (replacementError) throw replacementError
    const { error: rotatedTokenError } = await admin.rpc('get_bunutan_session', {
      p_session_id: first.session_id, p_capability: newToken, p_rate_key: rateKey,
    })
    assert.ok(rotatedTokenError, 'A recovered token is invalidated by the next recovery.')
    const { data: replacementSession, error: replacementReadError } = await admin.rpc('get_bunutan_session', {
      p_session_id: first.session_id, p_capability: replacementToken, p_rate_key: rateKey,
    })
    if (replacementReadError || !replacementSession) throw replacementReadError ?? new Error('Replacement recovery could not read the session.')
  } finally {
    for (const id of createdIds) {
      await admin.from('draw_results').delete().eq('session_id', id)
      await admin.from('draw_round_participants').delete().eq('session_id', id)
      await admin.from('draw_rounds').delete().eq('session_id', id)
      await admin.from('participants').delete().eq('session_id', id)
      await admin.from('bunutan_sessions').delete().eq('id', id)
    }
  }
})

test('online exchanges serialize invitation claims and keep concurrent reveals private', async () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.ok(url && serviceKey, 'Start local Supabase and provide its URL and service role key.')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const rateKey = hash(randomUUID())
  const management = randomBytes(32).toString('base64url')
  const recovery = randomBytes(16).toString('hex')
  const createdIds: string[] = []
  const expired = await admin.from('bunutan_sessions').select('id', { count: 'exact', head: true }).lte('recovery_expires_at', new Date().toISOString())
  if (expired.error) throw expired.error
  assert.equal(expired.count, 0, 'Run against a clean local database so test cleanup cannot purge unrelated expired sessions.')

  async function create(name: string, capability: string) {
    const { data, error } = await admin.rpc('create_online_bunutan_session', {
      p_session_name: name, p_description: null, p_registration_deadline: new Date(Date.now() + 60_000).toISOString(),
      p_assignment_release_at: new Date(Date.now() + 120_000).toISOString(), p_event_date: null, p_event_timezone: 'Asia/Manila',
      p_gift_budget: null, p_instructions: null, p_wishlists_enabled: false,
      p_public_id: randomBytes(32).toString('base64url'), p_management_hash: hash(capability), p_recovery_hash: hash(recovery), p_rate_key: rateKey,
    })
    if (error || !data) throw error ?? new Error('Online event creation failed.')
    createdIds.push(data.session_id)
    return data.session_id as string
  }

  try {
    const sessionId = await create('Concurrent online exchange', management)
    const otherSessionId = await create('Isolated online exchange', randomBytes(32).toString('base64url'))
    const isolated = await admin.rpc('get_online_event_dashboard', {
      p_session_id: otherSessionId, p_capability: management, p_rate_key: rateKey,
    })
    assert.ok(isolated.error, 'One organizer capability cannot read another online event.')

    const invitationTokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')]
    const inviteHashes = invitationTokens.map(hash)
    const { error: addError } = await admin.rpc('add_gift_exchange_invites', {
      p_session_id: sessionId, p_capability: management, p_rate_key: rateKey,
      p_names: ['Guest A', 'Guest B'], p_token_hashes: inviteHashes,
    })
    if (addError) throw addError
    const { error: openError } = await admin.rpc('open_bunutan_registration', { p_session_id: sessionId, p_capability: management, p_rate_key: rateKey })
    if (openError) throw openError

    const portalTokens = [randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url'), randomBytes(32).toString('base64url')]
    const claimInputs = [
      { invitation: inviteHashes[0], portal: portalTokens[0] },
      { invitation: inviteHashes[0], portal: portalTokens[1] },
      { invitation: inviteHashes[1], portal: portalTokens[2] },
    ]
    const claims = await Promise.all(claimInputs.map(({ invitation, portal }) => admin.rpc('claim_gift_invitation', {
      p_invitation_hash: invitation, p_participant_hash: hash(portal), p_rate_key: rateKey,
    })))
    const winners = new Map<string, string>()
    claims.forEach((claim, index) => { if (!claim.error && claim.data) winners.set(claim.data.participant_id, hash(claimInputs[index].portal)) })
    assert.equal(winners.size, 2, 'Concurrent duplicate claim has exactly one winner, and the other invitation is independently claimed.')
    assert.equal(claims.slice(0, 2).filter(claim => !claim.error).length, 1, 'One participant slot cannot be claimed twice.')

    const confirms = await Promise.all([...winners.values()].map(tokenHash => admin.rpc('confirm_gift_participation', {
      p_token_hash: tokenHash, p_rate_key: rateKey, p_response: 'confirm',
    })))
    for (const confirmation of confirms) if (confirmation.error) throw confirmation.error
    const { error: closeError } = await admin.rpc('close_bunutan_registration', { p_session_id: sessionId, p_capability: management, p_rate_key: rateKey })
    if (closeError) throw closeError
    const { error: lockError } = await admin.rpc('lock_gift_roster', { p_session_id: sessionId, p_capability: management, p_rate_key: rateKey })
    if (lockError) throw lockError
    const { data: round, error: drawError } = await admin.rpc('generate_gift_assignments', {
      p_session_id: sessionId, p_capability: management, p_rate_key: rateKey,
    })
    if (drawError || !round) throw drawError ?? new Error('Assignment generation failed.')
    const { error: releaseError } = await admin.from('bunutan_sessions').update({ assignment_release_at: new Date(Date.now() - 1000).toISOString() }).eq('id', sessionId)
    if (releaseError) throw releaseError

    const reveals = await Promise.all([...winners.values()].map(tokenHash => admin.rpc('reveal_gift_assignment', {
      p_token_hash: tokenHash, p_rate_key: rateKey,
    })))
    for (const reveal of reveals) if (reveal.error || !reveal.data) throw reveal.error ?? new Error('Assignment reveal failed.')
    assert.equal(reveals.length, 2)
    assert.ok(reveals.every(reveal => typeof reveal.data.recipient_name === 'string'))
    assert.ok(reveals.every(reveal => !('assignments' in reveal.data)), 'Reveal responses never include the complete assignment list.')
    const repeated = await Promise.all([0, 1].map(() => admin.rpc('reveal_gift_assignment', {
      p_token_hash: [...winners.values()][0], p_rate_key: rateKey,
    })))
    for (const reveal of repeated) if (reveal.error || !reveal.data) throw reveal.error ?? new Error('Repeated reveal failed.')
    assert.equal(repeated[0].data.recipient_name, repeated[1].data.recipient_name, 'Concurrent repeat reveals preserve the saved recipient.')
  } finally {
    for (const id of createdIds) {
      const { error } = await admin.from('bunutan_sessions').update({ expires_at: new Date(0).toISOString(), recovery_expires_at: new Date(0).toISOString() }).eq('id', id)
      if (error) throw error
    }
    if (createdIds.length) {
      const { error } = await admin.rpc('purge_expired_bunutan_sessions')
      if (error) throw error
    }
  }
})
