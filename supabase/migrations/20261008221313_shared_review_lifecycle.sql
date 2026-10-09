begin;
-- Recheck expiry at the actual operation time, including a long-lived transaction.
create or replace function scenario_private.session_valid(actor uuid, session uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select actor is not null and session is not null and exists(select 1 from auth.sessions s where s.id=session and s.user_id=actor and (s.not_after is null or s.not_after>clock_timestamp()))
$$;
create or replace function scenario_private.current_session_valid() returns boolean language sql volatile security definer set search_path='' as $$
 select scenario_private.session_valid(auth.uid(),case when auth.jwt()->>'session_id' ~ '^[0-9a-f-]{36}$' then (auth.jwt()->>'session_id')::uuid else null end)
$$;
create or replace function scenario_private.member_role(target uuid,actor uuid) returns text language sql volatile security definer set search_path='' as $$
 select m.role from scenario_private.memberships m where m.project_id=target and m.account_id=actor and m.revoked_at is null and (m.expires_at is null or m.expires_at>clock_timestamp())
$$;
create or replace function scenario_private.can_snapshot(target uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select scenario_private.current_session_valid() and exists(select 1 from public.scenario_snapshots s join scenario_private.snapshot_bindings b on b.snapshot_id=s.id
 where s.id=target and s.withdrawn_at is null and (s.expires_at is null or s.expires_at>clock_timestamp()) and
 (scenario_private.member_role(b.project_id,auth.uid())='owner' or (scenario_private.member_role(b.project_id,auth.uid()) is not null and exists(select 1 from scenario_private.snapshot_grants g where g.snapshot_id=target and g.account_id=auth.uid() and g.revoked_at is null and(g.expires_at is null or g.expires_at>clock_timestamp())))))
$$;
create or replace function scenario_private.can_comment(target uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select scenario_private.can_snapshot(target) and exists(select 1 from scenario_private.snapshot_bindings b where b.snapshot_id=target and scenario_private.member_role(b.project_id,auth.uid()) in('owner','editor','reviewer'))
$$;
alter table public.scenario_comments add column review_stage text not null default 'open'check(review_stage in('open','fixed','verified'));
-- No historical boolean is promoted to verified. The DDL lock and transaction
-- protect the compatibility migration; original targets and bodies are untouched.
alter table public.scenario_comments disable trigger comment_guard;
update public.scenario_comments set review_stage='fixed'where resolved;
alter table public.scenario_comments enable trigger comment_guard;
create function scenario_private.manages_comment(target uuid)returns boolean language sql volatile security definer set search_path=''as $$
 select scenario_private.current_session_valid()and exists(select 1 from public.scenario_comments c join scenario_private.snapshot_bindings b on b.snapshot_id=c.snapshot_id join scenario_private.memberships m on m.project_id=b.project_id and m.account_id=auth.uid()where c.id=target and m.role='owner'and m.revoked_at is null and(m.expires_at is null or m.expires_at>clock_timestamp()))
$$;
drop policy comments_own_update on public.scenario_comments;
create policy comments_own_or_author_stage on public.scenario_comments for update to authenticated using(scenario_private.can_comment(snapshot_id)and(scenario_private.owns_comment(id)or scenario_private.manages_comment(id)))with check(scenario_private.can_comment(snapshot_id)and(scenario_private.owns_comment(id)or scenario_private.manages_comment(id)));
grant execute on function scenario_private.manages_comment(uuid)to authenticated;
create or replace function scenario_private.guard_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb; e jsonb; block jsonb; found boolean:=false;
begin
 if not scenario_private.can_comment(new.snapshot_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if tg_op='INSERT' and (new.review_stage<>'open' or new.resolved) then raise exception 'REVIEW_STAGE_INVALID';end if;
 if tg_op='UPDATE' then
  if new.body is distinct from old.body and not scenario_private.owns_comment(old.id)then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if new.review_stage is distinct from old.review_stage then
   if old.review_stage='open'and new.review_stage='verified'then raise exception 'REVIEW_STAGE_ORDER';end if;
   new.resolved:=new.review_stage<>'open';
  elsif new.resolved is distinct from old.resolved then new.review_stage:=case when new.resolved then 'fixed'else 'open'end;
  end if;
 end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.snapshot_id<>old.snapshot_id or new.public_entity_id is distinct from old.public_entity_id or new.public_block_id is distinct from old.public_block_id or new.start_cp is distinct from old.start_cp or new.end_cp is distinct from old.end_cp or new.public_relation_id is distinct from old.public_relation_id or new.created_at<>old.created_at or new.public_version_id is distinct from old.public_version_id) then raise exception 'TARGET_IMMUTABLE'; end if;
 select projection into payload from public.scenario_snapshots where id=new.snapshot_id;
 if new.public_version_id<>'public-project'then select v->'projection' into payload from jsonb_array_elements(coalesce(payload->'versions','[]'))v where v->>'id'=new.public_version_id;end if;
 if new.public_relation_id is not null then
  select exists(select 1 from jsonb_array_elements(coalesce(payload->'relations','[]')) r where r->>'id'=new.public_relation_id) into found;
 else
  select value into e from jsonb_array_elements(coalesce(payload->'entities','[]')) where value->>'id'=new.public_entity_id;
  if e is not null then
   if new.public_block_id is null then found:=true;
   else
    for block in select b from jsonb_each(coalesce(e->'data','{}')) f cross join lateral jsonb_array_elements(case when jsonb_typeof(f.value)='array' then f.value else '[]'::jsonb end) b loop
     if block->>'id'=new.public_block_id and jsonb_typeof(block->'text')='string' and new.end_cp<=char_length(block->>'text') then found:=true; exit; end if;
    end loop;
   end if;
  end if;
 end if;
 if not found then raise exception 'PUBLIC_TARGET_UNKNOWN'; end if;
 return new;
end $$;

create table scenario_private.review_sources(snapshot_id uuid primary key references public.scenario_snapshots(id),projection_hash text not null check(projection_hash~'^[0-9a-f]{64}$'),source_map jsonb not null check(jsonb_typeof(source_map)='object'));
alter table scenario_private.review_sources enable row level security;
grant all on scenario_private.review_sources to service_role;
create function public.scenario_publish_with_review_sources(p_actor uuid,p_session uuid,p_project uuid,p_expected bigint,p_snapshot uuid,p_public_project text,p_source uuid,p_source_hash text,p_projection jsonb,p_hash text,p_expires timestamptz,p_assets jsonb,p_review_sources jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare receipt jsonb;
begin
 if p_review_sources is null or jsonb_typeof(p_review_sources)<>'object'or not(p_review_sources?'public-project')or octet_length(p_review_sources::text)>67108864 then raise exception 'PROTOCOL_INVALID';end if;
 receipt:=public.scenario_publish(p_actor,p_session,p_project,p_expected,p_snapshot,p_public_project,p_source,p_source_hash,p_projection,p_hash,p_expires,p_assets);
 insert into scenario_private.review_sources values(p_snapshot,p_hash,p_review_sources);
 return receipt;
end $$;
create function public.scenario_review_source(p_actor uuid,p_session uuid,p_project uuid,p_snapshot uuid)returns jsonb language plpgsql security definer set search_path=''as $$
declare s public.scenario_snapshots;b scenario_private.snapshot_bindings;origin scenario_private.review_sources;
begin
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select *into b from scenario_private.snapshot_bindings x where x.snapshot_id=p_snapshot and x.project_id=p_project;
 select *into s from public.scenario_snapshots x where x.id=p_snapshot;
 select *into origin from scenario_private.review_sources x where x.snapshot_id=p_snapshot;
 if b.snapshot_id is null or s.withdrawn_at is not null or s.expires_at<=clock_timestamp()then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if origin.projection_hash is null or origin.projection_hash<>s.content_hash then raise exception 'REVIEW_SOURCE_UNKNOWN';end if;
 return jsonb_build_object('snapshotId',s.id,'projectionHash',s.content_hash,'sourceVersionId',b.source_version_id,'sourceHash',b.source_hash,'sourceMap',origin.source_map,'projection',s.projection);
end $$;
revoke all on function public.scenario_publish_with_review_sources(uuid,uuid,uuid,bigint,uuid,text,uuid,text,jsonb,text,timestamptz,jsonb,jsonb),public.scenario_review_source(uuid,uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.scenario_publish_with_review_sources(uuid,uuid,uuid,bigint,uuid,text,uuid,text,jsonb,text,timestamptz,jsonb,jsonb),public.scenario_review_source(uuid,uuid,uuid,uuid)to service_role;
commit;
