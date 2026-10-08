\set ON_ERROR_STOP on
update public.scenario_snapshots set withdrawn_at=null;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000003","session_id":"10000000-0000-4000-8000-000000000003"}',false);
insert into public.scenario_comments(id,snapshot_id,public_entity_id,public_block_id,start_cp,end_cp,body)
 values('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','public-note','public-block',0,1,'正しいUnicode位置😀');
select public.fixture_assert(exists(select 1 from public.scenario_comments where id='60000000-0000-4000-8000-000000000003' and start_cp=0 and end_cp=1),'R9SQL02 valid zero-based Unicode comment is accepted');
do $$begin
 begin
  insert into public.scenario_comments(id,snapshot_id,public_entity_id,public_block_id,start_cp,end_cp,body)
   values('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','public-note','public-block',null,1,'未知の開始位置は拒否する');
 exception when check_violation then raise notice 'R9SQL02 expected CHECK refusal of unknown block start';
 end;
 perform public.fixture_assert(not exists(select 1 from public.scenario_comments where id='60000000-0000-4000-8000-000000000002'),'R9SQL02 unknown block start position is never inserted');
end $$;
