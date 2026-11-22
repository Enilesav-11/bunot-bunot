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
