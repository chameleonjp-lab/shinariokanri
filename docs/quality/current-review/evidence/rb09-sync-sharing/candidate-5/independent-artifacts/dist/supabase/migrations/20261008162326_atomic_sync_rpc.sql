begin;
alter table scenario_private.projects add column documents jsonb not null default '[]';
alter table scenario_private.projects add column native_image jsonb;
create table scenario_private.world_images(project_id uuid not null references scenario_private.projects(id),snapshot_id uuid not null,image jsonb not null,content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),primary key(project_id,snapshot_id));
alter table scenario_private.world_images enable row level security;
create policy worlds_owner_read on scenario_private.world_images for select to authenticated using(scenario_private.can_author(project_id,'private'));
grant all on scenario_private.world_images to service_role;
create table scenario_private.snapshot_grants(snapshot_id uuid not null references public.scenario_snapshots(id),account_id uuid not null references auth.users(id),expires_at timestamptz,revoked_at timestamptz,primary key(snapshot_id,account_id));
alter table scenario_private.snapshot_grants enable row level security;
grant all on scenario_private.snapshot_grants to service_role;
create table scenario_private.snapshot_assets(snapshot_id uuid not null references public.scenario_snapshots(id),public_asset_id text not null,project_id uuid not null references scenario_private.projects(id),content_hash text not null,primary key(snapshot_id,public_asset_id),foreign key(project_id,content_hash) references scenario_private.assets(project_id,content_hash));
alter table scenario_private.snapshot_assets enable row level security;
grant all on scenario_private.snapshot_assets to service_role;
create or replace function scenario_private.can_snapshot(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select scenario_private.current_session_valid() and exists(select 1 from public.scenario_snapshots s join scenario_private.snapshot_bindings b on b.snapshot_id=s.id
 where s.id=target and s.withdrawn_at is null and (s.expires_at is null or s.expires_at>now()) and
 (scenario_private.member_role(b.project_id,auth.uid())='owner' or (scenario_private.member_role(b.project_id,auth.uid()) is not null and exists(select 1 from scenario_private.snapshot_grants g where g.snapshot_id=target and g.account_id=auth.uid() and g.revoked_at is null and(g.expires_at is null or g.expires_at>now())))))
$$;
-- Only service-role Edge code can call these RPCs. Every call rechecks the verified user's live session/membership.
create function public.scenario_sync_state(actor uuid,session uuid,project uuid,base_revision bigint default null,operation_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p scenario_private.projects; role text; base jsonb; previous jsonb;
begin
 if not scenario_private.session_valid(actor,session) then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 role:=scenario_private.member_role(project,actor);if role is distinct from 'owner' then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 select * into p from scenario_private.projects where id=project;if p.id is null then raise exception 'BASE_UNAVAILABLE';end if;
 if base_revision is not null then select documents into base from scenario_private.revisions r where r.project_id=project and r.revision=base_revision;if base is null then raise exception 'BASE_UNAVAILABLE';end if;end if;
 if operation_id is not null then select o.ack into previous from scenario_private.operations o where o.project_id=project and o.operation_id=scenario_sync_state.operation_id and o.actor_id=actor;end if;
 return jsonb_build_object('projectId',project,'serverRevision',p.revision::text,'documents',p.documents,'nativeImage',p.native_image,'baseDocuments',base,'role',role,'previousAck',previous,'worlds',coalesce((select jsonb_object_agg(w.snapshot_id::text,w.image) from scenario_private.world_images w where w.project_id=project),'{}'));
end $$;
create function public.scenario_sync_bootstrap(actor uuid,session uuid,project uuid,image jsonb,documents jsonb,worlds jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare d jsonb; w record;
begin
 if not scenario_private.session_valid(actor,session) then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if image->>'projectId'<>project::text or jsonb_typeof(documents)<>'array' or jsonb_array_length(documents)>100001 or jsonb_array_length(documents)<1 or octet_length(image::text)>134217728 then raise exception 'PROTOCOL_INVALID';end if;
 insert into scenario_private.projects(id,owner_id,revision,documents,native_image) values(project,actor,1,documents,image);
 insert into scenario_private.memberships(project_id,account_id,role) values(project,actor,'owner');
 for d in select value from jsonb_array_elements(documents) loop
  if d->>'projectId'<>project::text or d->>'revision'<>'1' then raise exception 'PROTOCOL_INVALID';end if;
  insert into scenario_private.documents(project_id,id,revision,document) values(project,(d->>'id')::uuid,1,d);
 end loop;
 insert into scenario_private.revisions values(project,1,documents);
 for w in select key,value from jsonb_each(worlds)loop insert into scenario_private.world_images values(project,w.key::uuid,w.value,w.value->'snapshots'->0->>'contentHash');end loop;
 return jsonb_build_object('projectId',project,'serverRevision','1','documents',documents);
end $$;
create function public.scenario_sync_commit(actor uuid,session uuid,project uuid,expected_revision bigint,operation jsonb,operation_hash text,ack jsonb,documents jsonb,image jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p scenario_private.projects; role text; previous scenario_private.operations; target jsonb; old jsonb; merged jsonb; d jsonb; base jsonb; next_revision bigint; original scenario_private.operations; resolution_target jsonb;
begin
 if not scenario_private.session_valid(actor,session) then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into p from scenario_private.projects where id=project for update;role:=scenario_private.member_role(project,actor);
 if p.id is null or role not in('owner','editor') or role is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if operation->'scope'->>'accountId'<>actor::text or operation->'scope'->>'projectId'<>project::text or ack->>'operationId'<>operation->>'operationId' or ack->>'operationHash'<>operation_hash or jsonb_typeof(operation->'targets')<>'array' or jsonb_array_length(operation->'targets') not between 1 and 10000 then raise exception 'PROTOCOL_INVALID';end if;
 -- Role and session were checked before idempotent replay.
 select * into previous from scenario_private.operations o where o.project_id=project and o.operation_id=(operation->>'operationId')::uuid;
 if previous.operation_id is not null then if previous.actor_id<>actor or previous.operation_hash<>operation_hash then raise exception 'OPERATION_REUSED';end if;return previous.ack;end if;
 if p.revision<>expected_revision then raise exception 'REVISION_CHANGED';end if;
 select r.documents into base from scenario_private.revisions r where r.project_id=project and r.revision=(operation->>'baseRevision')::bigint;if base is null then raise exception 'BASE_UNAVAILABLE';end if;
 if operation?'resolvesOperationId' then
  select * into original from scenario_private.operations o where o.project_id=project and o.operation_id=(operation->>'resolvesOperationId')::uuid and o.actor_id=actor;
  if original.operation_id is null then raise exception 'PROTOCOL_INVALID';end if;
  for resolution_target in select value from jsonb_array_elements(original.operation->'targets')loop if not exists(select 1 from jsonb_array_elements(operation->'targets')t where t->>'targetId'=resolution_target->>'targetId')then raise exception 'RESOLUTION_INCOMPLETE';end if;end loop;
 end if;
 for target in select value from jsonb_array_elements(operation->'targets')loop
  select value into old from jsonb_array_elements(base)where value->>'id'=target->>'targetId';if coalesce(old,'null')<>target->'base' then raise exception 'PROTOCOL_INVALID';end if;
  select value into merged from jsonb_array_elements(p.documents)where value->>'id'=target->>'targetId';
  if target->'local'->>'id'<>target->>'targetId' or target->'local'->>'projectId'<>project::text or(old is not null and old->'fields'->>'kind' is distinct from target->'local'->'fields'->>'kind')or(old->'fields'->>'createdAt' is not null and old->'fields'->>'createdAt' is distinct from target->'local'->'fields'->>'createdAt')then raise exception 'PROTOCOL_INVALID';end if;
  if role='editor' and ((old is not null and old->'fields'->>'visibility' is distinct from 'team') or(merged is not null and merged->'fields'->>'visibility' is distinct from 'team') or target->'local'->'fields'->>'visibility' is distinct from 'team')then raise exception using errcode='42501',message='FORBIDDEN';end if;
 end loop;
 if ack->>'status'='conflict' then if ack->>'serverRevision'<>p.revision::text or ack->'confirmedDocuments'<>p.documents then raise exception 'PROTOCOL_INVALID';end if;
 elsif ack->>'status'='applied' then
  next_revision:=(ack->>'serverRevision')::bigint;if next_revision<p.revision or next_revision>p.revision+1 or ack->'confirmedDocuments'<>documents or image->>'projectId'<>project::text or jsonb_typeof(documents)<>'array' or jsonb_array_length(documents)>100001 then raise exception 'PROTOCOL_INVALID';end if;
  for d in select value from jsonb_array_elements(documents)loop
   if d->>'projectId'<>project::text or(d->>'revision')::bigint>next_revision then raise exception 'PROTOCOL_INVALID';end if;
   select value into old from jsonb_array_elements(p.documents)where value->>'id'=d->>'id';
   if old is distinct from d and not exists(select 1 from jsonb_array_elements(operation->'targets')t where t->>'targetId'=d->>'id') then raise exception 'PROTOCOL_INVALID';end if;
   if role='editor' and old is distinct from d and ((old is not null and old->'fields'->>'visibility' is distinct from 'team')or d->'fields'->>'visibility' is distinct from 'team')then raise exception using errcode='42501',message='FORBIDDEN';end if;
   insert into scenario_private.documents(project_id,id,revision,document) values(project,(d->>'id')::uuid,(d->>'revision')::bigint,d) on conflict(project_id,id) do update set revision=excluded.revision,document=excluded.document;
  end loop;
  if exists(select 1 from jsonb_array_elements(p.documents)old where not exists(select 1 from jsonb_array_elements(documents)new where new->>'id'=old->>'id'))then raise exception 'TOMBSTONE_REQUIRED';end if;
  update scenario_private.projects set revision=next_revision,documents=scenario_sync_commit.documents,native_image=image where id=project;
  insert into scenario_private.revisions values(project,next_revision,documents) on conflict(project_id,revision) do nothing;
 else raise exception 'PROTOCOL_INVALID';end if;
 insert into scenario_private.operations(project_id,operation_id,actor_id,operation_hash,operation,ack)values(project,(operation->>'operationId')::uuid,actor,operation_hash,operation,ack);
 return ack;
end $$;
create function public.scenario_membership(actor uuid,session uuid,project uuid,account uuid,new_role text,expires_at timestamptz,revoked boolean,snapshots uuid[]) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare current_role text; target uuid;
begin
 perform 1 from scenario_private.projects p where p.id=project for update;
 if not scenario_private.session_valid(actor,session) or scenario_private.member_role(project,actor) is distinct from 'owner' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if new_role not in('owner','editor','reviewer','reader') or account is null or expires_at<=now()then raise exception 'PROTOCOL_INVALID';end if;
 select role into current_role from scenario_private.memberships where project_id=project and account_id=account for update;
 if current_role='owner' and(new_role<>'owner' or revoked or expires_at is not null) and(select count(*)from scenario_private.memberships m where m.project_id=project and m.role='owner' and m.revoked_at is null and(m.expires_at is null or m.expires_at>now()))<=1 then raise exception 'LAST_OWNER_REQUIRED';end if;
 insert into scenario_private.memberships values(project,account,new_role,expires_at,case when revoked then now()end)on conflict(project_id,account_id)do update set role=excluded.role,expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 update scenario_private.snapshot_grants g set revoked_at=now()where g.account_id=account and exists(select 1 from scenario_private.snapshot_bindings b where b.project_id=project and b.snapshot_id=g.snapshot_id);
 foreach target in array snapshots loop
  if not exists(select 1 from scenario_private.snapshot_bindings b where b.project_id=project and b.snapshot_id=target)then raise exception 'PROTOCOL_INVALID';end if;
  insert into scenario_private.snapshot_grants values(target,account,expires_at,case when revoked then now()end)on conflict(snapshot_id,account_id)do update set expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 end loop;
end $$;
revoke all on function public.scenario_sync_state(uuid,uuid,uuid,bigint,uuid),public.scenario_sync_bootstrap(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.scenario_sync_commit(uuid,uuid,uuid,bigint,jsonb,text,jsonb,jsonb,jsonb),public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.scenario_sync_state(uuid,uuid,uuid,bigint,uuid),public.scenario_sync_bootstrap(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.scenario_sync_commit(uuid,uuid,uuid,bigint,jsonb,text,jsonb,jsonb,jsonb),public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[]) to service_role;
commit;
