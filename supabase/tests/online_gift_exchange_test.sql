begin;
select plan(36);

select ok((select bool_and(relrowsecurity) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('gift_assignment_rounds','gift_assignments','participant_wishlists')),
  'all private gift-exchange tables enable RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='private.rate_limits'::regclass),
  'approved rate-limit hardening enables RLS');
select ok(not has_table_privilege('anon','public.gift_assignments','SELECT') and not has_table_privilege('authenticated','public.participant_wishlists','SELECT'),
  'browser roles cannot read assignments or wishlists');
select ok(not has_function_privilege('anon','public.reveal_gift_assignment(text,text)','EXECUTE')
  and has_function_privilege('service_role','public.reveal_gift_assignment(text,text)','EXECUTE'),
  'only the server can call private assignment reveal');

select set_config('test.capability',repeat('a',64),true);
select set_config('test.rate_key',repeat('b',64),true);
select set_config('test.recovery',repeat('c',64),true);
select set_config('test.online_data',public.create_online_bunutan_session(
  'Remote Gift Exchange','Online test',pg_catalog.now()+interval '1 day',pg_catalog.now()+interval '1 day',null,'Asia/Manila',500,
  'Please keep your recipient secret.',true,
  replace(translate(pg_catalog.encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=',''),
  pg_catalog.encode(extensions.digest(current_setting('test.capability'),'sha256'),'hex'),
  pg_catalog.encode(extensions.digest(current_setting('test.recovery'),'sha256'),'hex'),current_setting('test.rate_key'))::text,true);
select set_config('test.session_id',current_setting('test.online_data')::jsonb->>'session_id',true);
select set_config('test.public_id',current_setting('test.online_data')::jsonb->>'public_id',true);

select is((public.get_online_event_dashboard(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key')) #>> '{session,event_status}'),
  'draft','event starts as a private draft');
select throws_ok($$select public.claim_gift_invitation(repeat('f',64),repeat('e',64),current_setting('test.rate_key'))$$,
  'P0002','invitation_not_found','unissued invitations cannot claim a participant slot');

do $$ declare n text[]; h text[]; begin
  select array_agg('Guest '||g order by g),array_agg(pg_catalog.encode(extensions.digest('invite-five-'||g,'sha256'),'hex') order by g)
    into n,h from generate_series(1,5) g;
  perform public.add_gift_exchange_invites(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),n,h);
end $$;
select is((public.get_online_event_dashboard(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key')) #>> '{counts,invited}')::int,
  5,'organizer dashboard counts the five individual invitations');
select public.open_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));

select set_config('test.invite_hash',(select participant_token_hash from public.participants where session_id=current_setting('test.session_id')::uuid order by created_at,id limit 1),true);
select set_config('test.participant_hash',pg_catalog.encode(extensions.digest('private-five-portal','sha256'),'hex'),true);
select public.claim_gift_invitation(current_setting('test.invite_hash'),current_setting('test.participant_hash'),current_setting('test.rate_key'));
select throws_ok($$select public.claim_gift_invitation(current_setting('test.invite_hash'),repeat('d',64),current_setting('test.rate_key'))$$,
  'P0002','invitation_not_found','a claimed invitation cannot claim another portal');
do $$ declare h text; begin
  for h in select participant_token_hash from public.participants where session_id=current_setting('test.session_id')::uuid loop
    perform public.confirm_gift_participation(h,current_setting('test.rate_key'),'confirm');
  end loop;
end $$;
select public.close_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));
select throws_ok($$select public.add_gift_exchange_invites(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),array['Late guest'],array[repeat('f',64)])$$,
  'P0001','roster_locked','closed registration rejects new invitations');
select is(public.open_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key')),true,
  'organizer can reopen registration before its deadline');
select public.close_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));
select public.lock_gift_roster(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));
select set_config('test.round_data',public.generate_gift_assignments(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'))::text,true);
select set_config('test.round_id',current_setting('test.round_data')::jsonb->>'round_id',true);

select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid),5,
  'assignment generation stores one mapping for every confirmed giver');
select is((select count(distinct recipient_participant_id)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid),5,
  'all five recipients are unique');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid and giver_participant_id=recipient_participant_id),0,
  'no participant is assigned to themselves');
select set_config('test.voided_round',current_setting('test.round_id'),true);
select public.void_gift_assignment_round(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),current_setting('test.voided_round')::uuid);
select is((select status from public.gift_assignment_rounds where id=current_setting('test.voided_round')::uuid),'voided',
  'voiding preserves the old round as history');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.voided_round')::uuid),5,
  'voiding preserves every old assignment');
select public.revoke_gift_invitation(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),
  (select id from public.participants where session_id=current_setting('test.session_id')::uuid and participant_token_hash=current_setting('test.participant_hash')));
select is((select registration_status from public.participants where session_id=current_setting('test.session_id')::uuid and status='removed'),'revoked',
  'organizer can remove a confirmed participant after voiding the unrevealed round');
select throws_ok($$select public.get_gift_invite_portal(current_setting('test.participant_hash'),current_setting('test.rate_key'))$$,
  'P0002','participant_not_found','removed participant link no longer works');
select is(public.open_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key')),true,
  'replacement roster can reopen before the registration deadline');
select public.add_gift_exchange_invites(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),
  array['Replacement guest'],array[pg_catalog.encode(extensions.digest('replacement-invite','sha256'),'hex')]);
select public.claim_gift_invitation(pg_catalog.encode(extensions.digest('replacement-invite','sha256'),'hex'),
  pg_catalog.encode(extensions.digest('replacement-portal','sha256'),'hex'),current_setting('test.rate_key'));
select public.confirm_gift_participation(pg_catalog.encode(extensions.digest('replacement-portal','sha256'),'hex'),current_setting('test.rate_key'),'confirm');
select public.close_bunutan_registration(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));
select public.lock_gift_roster(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'));
select set_config('test.round_data',public.generate_gift_assignments(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'))::text,true);
select set_config('test.round_id',current_setting('test.round_data')::jsonb->>'round_id',true);
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid),5,
  'replacement roster receives a complete new assignment round');
select is((select count(distinct recipient_participant_id)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid),5,
  'replacement round retains unique recipients');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid and giver_participant_id=recipient_participant_id),0,
  'replacement round has no self assignments');
select set_config('test.participant_hash',(select participant_token_hash from public.participants where session_id=current_setting('test.session_id')::uuid and registration_status='confirmed' order by id limit 1),true);
select ok(not (public.get_online_event_dashboard(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'))::text ilike '%recipient_participant_id%')
  and not (public.get_online_event_dashboard(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'))::text ilike '%recipient_name%'),
  'organizer dashboard never returns the assignment mapping');
select ok(not (public.get_public_online_event(current_setting('test.public_id'),current_setting('test.rate_key'))::text ilike '%participant_token%')
  and not (public.get_public_online_event(current_setting('test.public_id'),current_setting('test.rate_key'))::text ilike '%recipient_participant_id%'),
  'public event page returns neither capabilities nor assignment data');
select ok(not (public.get_gift_invite_portal(current_setting('test.participant_hash'),current_setting('test.rate_key'))::text ilike '%recipient_name%'),
  'participant waiting portal does not reveal an assignment early');
select throws_ok($$select public.reveal_gift_assignment(current_setting('test.participant_hash'),current_setting('test.rate_key'))$$,
  'P0001','assignment_not_available','assignments stay private until the release date');

update public.bunutan_sessions set assignment_release_at=pg_catalog.now()-interval '1 second' where id=current_setting('test.session_id')::uuid;
select set_config('test.reveal',public.reveal_gift_assignment(current_setting('test.participant_hash'),current_setting('test.rate_key'))::text,true);
select ok(current_setting('test.reveal')::jsonb ? 'recipient_name' and not current_setting('test.reveal')::jsonb ? 'assignments',
  'reveal returns only the current participant’s recipient');
select is(public.reveal_gift_assignment(current_setting('test.participant_hash'),current_setting('test.rate_key')) #>> '{recipient_name}',
  current_setting('test.reveal')::jsonb->>'recipient_name','revisiting a participant link preserves the same recipient');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.round_id')::uuid and revealed_at is not null),1,
  'repeated reveal requests record one private reveal');
select is(public.get_gift_invite_portal((select participant_token_hash from public.participants where session_id=current_setting('test.session_id')::uuid and registration_status='confirmed' and participant_token_hash<>current_setting('test.participant_hash') order by id limit 1),current_setting('test.rate_key'))->'my_assignment',
  'null'::jsonb,'another participant portal cannot see this revealed assignment');
select throws_ok($$select public.add_gift_exchange_invites(current_setting('test.session_id')::uuid,current_setting('test.capability'),current_setting('test.rate_key'),array['Late guest'],array[repeat('f',64)])$$,
  'P0001','roster_locked','assignments freeze the roster');

select set_config('test.twenty_capability',repeat('d',64),true);
select set_config('test.twenty_session',public.create_online_bunutan_session('Twenty person exchange',null,pg_catalog.now()+interval '1 day',
  pg_catalog.now()+interval '1 day',null,'Asia/Manila',null,null,false,
  replace(translate(pg_catalog.encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=',''),
  pg_catalog.encode(extensions.digest(current_setting('test.twenty_capability'),'sha256'),'hex'),pg_catalog.encode(extensions.digest('twenty-recovery','sha256'),'hex'),current_setting('test.rate_key'))->>'session_id',true);
select set_config('test.twenty_round','',true);
do $$ declare n text[]; v_hashes text[]; v_hash text; v_round jsonb; begin
  select array_agg('Remote guest '||g order by g),array_agg(pg_catalog.encode(extensions.digest('invite-twenty-'||g,'sha256'),'hex') order by g)
    into n,v_hashes from generate_series(1,20) g;
  perform public.add_gift_exchange_invites(current_setting('test.twenty_session')::uuid,
    current_setting('test.twenty_capability'),current_setting('test.rate_key'),n,v_hashes);
  perform public.open_bunutan_registration(current_setting('test.twenty_session')::uuid,
    current_setting('test.twenty_capability'),current_setting('test.rate_key'));
  for v_hash in select participant_token_hash from public.participants where session_id=current_setting('test.twenty_session')::uuid loop
    perform public.confirm_gift_participation(v_hash,current_setting('test.rate_key'),'confirm');
  end loop;
  perform public.close_bunutan_registration(current_setting('test.twenty_session')::uuid,
    current_setting('test.twenty_capability'),current_setting('test.rate_key'));
  perform public.lock_gift_roster(current_setting('test.twenty_session')::uuid,
    current_setting('test.twenty_capability'),current_setting('test.rate_key'));
  v_round:=public.generate_gift_assignments(current_setting('test.twenty_session')::uuid,
    current_setting('test.twenty_capability'),current_setting('test.rate_key'));
  perform set_config('test.twenty_round',v_round->>'round_id',true);
end $$;
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.twenty_round')::uuid),20,'twenty confirmed participants all receive an assignment');
select is((select count(distinct giver_participant_id)::int from public.gift_assignments where round_id=current_setting('test.twenty_round')::uuid),20,'twenty participant givers are unique');
select is((select count(distinct recipient_participant_id)::int from public.gift_assignments where round_id=current_setting('test.twenty_round')::uuid),20,'twenty recipients are unique');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.twenty_round')::uuid and giver_participant_id=recipient_participant_id),0,'twenty participant draw has no self assignments');

select set_config('test.two_capability',repeat('e',64),true);
select set_config('test.two_session',public.create_online_bunutan_session('Two person exchange',null,pg_catalog.now()+interval '1 day',
  pg_catalog.now()+interval '1 day',null,'Asia/Manila',null,null,false,
  replace(translate(pg_catalog.encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=',''),
  pg_catalog.encode(extensions.digest(current_setting('test.two_capability'),'sha256'),'hex'),pg_catalog.encode(extensions.digest('two-recovery','sha256'),'hex'),current_setting('test.rate_key'))->>'session_id',true);
select set_config('test.two_round','',true);
do $$ declare v_hashes text[]; v_hash text; n text[]:=array['Guest A','Guest B']; v_round jsonb; begin
  select array_agg(pg_catalog.encode(extensions.digest('invite-two-'||g,'sha256'),'hex') order by g) into v_hashes from generate_series(1,2) g;
  perform public.add_gift_exchange_invites(current_setting('test.two_session')::uuid,
    current_setting('test.two_capability'),current_setting('test.rate_key'),n,v_hashes);
  perform public.open_bunutan_registration(current_setting('test.two_session')::uuid,
    current_setting('test.two_capability'),current_setting('test.rate_key'));
  for v_hash in select participant_token_hash from public.participants where session_id=current_setting('test.two_session')::uuid loop
    perform public.confirm_gift_participation(v_hash,current_setting('test.rate_key'),'confirm');
  end loop;
  perform public.close_bunutan_registration(current_setting('test.two_session')::uuid,
    current_setting('test.two_capability'),current_setting('test.rate_key'));
  perform public.lock_gift_roster(current_setting('test.two_session')::uuid,
    current_setting('test.two_capability'),current_setting('test.rate_key'));
  v_round:=public.generate_gift_assignments(current_setting('test.two_session')::uuid,
    current_setting('test.two_capability'),current_setting('test.rate_key'));
  perform set_config('test.two_round',v_round->>'round_id',true);
end $$;
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.two_round')::uuid),2,'two participant event assigns both people');
select is((select count(*)::int from public.gift_assignments where round_id=current_setting('test.two_round')::uuid and giver_participant_id<>recipient_participant_id),2,'two participants receive each other');

select * from finish();
rollback;
