begin;
select plan(19);

select ok((select count(*) = 5 from pg_catalog.pg_tables where schemaname = 'public'
  and tablename in ('bunutan_sessions', 'participants', 'draw_rounds', 'draw_round_participants', 'draw_results')),
  'anonymous session tables exist');
select ok((select bool_and(c.relrowsecurity) from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('bunutan_sessions', 'participants', 'draw_rounds', 'draw_round_participants', 'draw_results')),
  'row level security is enabled on every application table');
select ok(not has_table_privilege('anon', 'public.participants', 'SELECT'), 'anonymous credentials have no roster table access');
select ok(not has_table_privilege('anon', 'public.draw_results', 'SELECT'), 'anonymous credentials have no result table access');
select ok(not has_function_privilege('anon', 'public.create_bunutan_session(text,text,text,text,text,text)', 'EXECUTE'), 'anonymous credentials cannot call management functions');

select set_config('test.capability', repeat('a', 64), true);
select set_config('test.rate_key', repeat('b', 64), true);
select set_config('test.recovery', 'ABCD-1234-EF56-7890-ABCD', true);
select set_config('test.session_data', public.create_bunutan_session(
  'Database test', null,
  replace(translate(pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=', ''),
  pg_catalog.encode(extensions.digest(current_setting('test.capability'), 'sha256'), 'hex'),
  pg_catalog.encode(extensions.digest(current_setting('test.recovery'), 'sha256'), 'hex'),
  current_setting('test.rate_key'))::text, true);
select set_config('test.session_id', current_setting('test.session_data')::jsonb ->> 'session_id', true);
select set_config('test.public_id', current_setting('test.session_data')::jsonb ->> 'public_id', true);

select throws_ok($$select public.get_bunutan_session(current_setting('test.session_id')::uuid, repeat('z', 64), current_setting('test.rate_key'))$$,
  'P0002', 'session_not_found', 'a different capability cannot read the session');
select is(public.add_bunutan_participants(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), array['Mika', 'Mika', 'Jose']), 3,
  'identical display names are stored as separate entries');
select set_config('test.round_id', public.start_bunutan_round(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'))::text, true);
select is((select count(*)::integer from public.draw_round_participants where round_id = current_setting('test.round_id')::uuid), 3, 'round snapshots the active roster');
select throws_ok($$select public.add_bunutan_participants(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), array['Late guest'])$$,
  'P0001', 'round_in_progress', 'roster is locked while a round is active');

select set_config('test.request_key', '30000000-0000-4000-8000-000000000001', true);
select set_config('test.draw_one', public.draw_bunutan_next(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), current_setting('test.round_id')::uuid, current_setting('test.request_key')::uuid)::text, true);
select set_config('test.replay', public.draw_bunutan_next(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), current_setting('test.round_id')::uuid, current_setting('test.request_key')::uuid)::text, true);
select is(current_setting('test.draw_one')::jsonb #>> '{result,id}', current_setting('test.replay')::jsonb #>> '{result,id}', 'retry returns the saved draw');
select set_config('test.draw_two', public.draw_bunutan_next(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), current_setting('test.round_id')::uuid, '30000000-0000-4000-8000-000000000002')::text, true);
select set_config('test.draw_three', public.draw_bunutan_next(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'), current_setting('test.round_id')::uuid, '30000000-0000-4000-8000-000000000003')::text, true);
select is((select count(distinct participant_id)::integer from public.draw_results where round_id = current_setting('test.round_id')::uuid), 3, 'a round selects each participant once');
select is((select status from public.draw_rounds where id = current_setting('test.round_id')::uuid), 'completed', 'last selection completes the round');

select set_config('test.manage_limit_key', repeat('d', 64), true);
do $$ begin
  for i in 1..240 loop perform private.enforce_rate_limit(current_setting('test.manage_limit_key'), 'manage:global', 240, 60); end loop;
end $$;
select throws_ok($$select private.authorize_session('00000000-0000-4000-8000-000000000001', repeat('z', 64), current_setting('test.manage_limit_key'))$$,
  'P0001', 'rate_limited', 'global management limit blocks session-id enumeration');
select set_config('test.recover_limit_key', repeat('e', 64), true);
do $$ begin
  for i in 1..20 loop perform private.enforce_rate_limit(current_setting('test.recover_limit_key'), 'recover:global', 20, 3600); end loop;
end $$;
select throws_ok($$select public.recover_bunutan_session('00000000-0000-4000-8000-000000000001', repeat('f', 64), repeat('a', 64), current_setting('test.recover_limit_key'))$$,
  'P0001', 'rate_limited', 'global recovery limit applies before session lookup');

select public.archive_bunutan_session(current_setting('test.session_id')::uuid, current_setting('test.capability'), current_setting('test.rate_key'));
select is(public.recover_bunutan_session(current_setting('test.session_id')::uuid,
  pg_catalog.encode(extensions.digest(current_setting('test.recovery'), 'sha256'), 'hex'),
  pg_catalog.encode(extensions.digest(repeat('c', 64), 'sha256'), 'hex'), current_setting('test.rate_key')),
  true, 'archived session recovery succeeds');
select is((select status from public.bunutan_sessions where id = current_setting('test.session_id')::uuid), 'archived', 'recovery preserves archived status');
update public.bunutan_sessions set expires_at = pg_catalog.now() - interval '1 day', recovery_expires_at = pg_catalog.now() - interval '1 day'
  where id = current_setting('test.session_id')::uuid;
select throws_ok($$select public.get_bunutan_session(current_setting('test.session_id')::uuid, repeat('c', 64), current_setting('test.rate_key'))$$,
  'P0002', 'session_not_found', 'expired sessions reject management reads');
select ok(public.purge_expired_bunutan_sessions() >= 1, 'purge removes expired sessions');
select ok(not exists(select 1 from public.bunutan_sessions where id = current_setting('test.session_id')::uuid), 'purge deletes expired session data');

select * from finish();
rollback;
