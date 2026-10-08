begin;
create table scenario_private.editor_scopes(
 project_id uuid not null references scenario_private.projects(id),account_id uuid not null references auth.users(id),document_id uuid not null,
 fields text[] not null check(cardinality(fields)>0),expires_at timestamptz,revoked_at timestamptz,primary key(project_id,account_id,document_id)
);
alter table scenario_private.editor_scopes enable row level security;
grant all on scenario_private.editor_scopes to service_role;
drop policy assets_author_read on scenario_private.assets;
create policy assets_author_read on scenario_private.assets for select to authenticated using(complete and scenario_private.can_author(project_id,'private'));
drop policy scenario_assets_read on storage.objects;
create policy scenario_assets_read on storage.objects for select to authenticated using(bucket_id='scenario-private'and exists(select 1 from scenario_private.assets a where a.storage_path=name and a.complete and scenario_private.can_author(a.project_id,'private')));
drop policy if exists documents_author_read on scenario_private.documents;
create policy documents_author_read on scenario_private.documents for select to authenticated using(scenario_private.can_author(project_id,'private'));
-- Service-only validation admits computed review flags in the same source-edit transaction.
create function scenario_private.derived_review_update(old jsonb,new_doc jsonb)returns boolean language sql immutable set search_path='' as $$
 select (old is null and new_doc->'fields'->>'kind'='review'and new_doc->'fields'->>'visibility'='private'and new_doc->'fields'->>'status'='needs_review'and new_doc->'fields'->'customValues'->>'changeReview.generatedBy'='semantic-change-review/v1')or
 (old is not null and old-'revision'-'fields'=new_doc-'revision'-'fields'and (
  (old->'fields'->>'kind'in('localization','recording')and (old->'fields')-'data.stage'=(new_doc->'fields')-'data.stage'and new_doc->'fields'->>'data.stage'='needs_review')or
  (old->'fields'->>'kind'='media_variant'and(old->'fields')-'data.needsReview'=(new_doc->'fields')-'data.needsReview'and new_doc->'fields'->'data.needsReview'='true')or
  (old->'fields'->>'kind'='production_task'and(old->'fields')-'data.progress'=(new_doc->'fields')-'data.progress'and new_doc->'fields'->>'data.progress'='needs_review')or
  (old->'fields'->>'kind'='storyboard_frame'and(old->'fields')-'status'=(new_doc->'fields')-'status'and new_doc->'fields'->>'status'='needs_review')or
  (old->'fields'->>'kind'='project'and(old->'fields')-'entityIds'=(new_doc->'fields')-'entityIds'and jsonb_typeof(new_doc->'fields'->'entityIds')='array'and(new_doc->'fields'->'entityIds') @> (old->'fields'->'entityIds'))
 ))
$$;
revoke all on function scenario_private.derived_review_update(jsonb,jsonb)from public,anon,authenticated;
grant execute on function scenario_private.derived_review_update(jsonb,jsonb)to service_role;
create or replace function public.scenario_sync_commit(actor uuid,session uuid,project uuid,expected_revision bigint,operation jsonb,operation_hash text,ack jsonb,documents jsonb,image jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if role='editor' and not exists(select 1 from scenario_private.editor_scopes s where s.project_id=project and s.account_id=actor and s.document_id=(target->>'targetId')::uuid and s.revoked_at is null and(s.expires_at is null or s.expires_at>clock_timestamp()) and not exists(select 1 from jsonb_array_elements(target->'changes')c where c->>'field'<> '$tombstone' and not(c->>'field'=any(s.fields))))then raise exception using errcode='42501',message='FORBIDDEN';end if;
  if role='editor' and ((old is not null and old->'fields'->>'visibility' is distinct from 'team') or(merged is not null and merged->'fields'->>'visibility' is distinct from 'team') or target->'local'->'fields'->>'visibility' is distinct from 'team')then raise exception using errcode='42501',message='FORBIDDEN';end if;
 end loop;
 if ack->>'status'='conflict' then if ack->>'serverRevision'<>p.revision::text or ack->'confirmedDocuments'<>p.documents then raise exception 'PROTOCOL_INVALID';end if;
 elsif ack->>'status'='applied' then
  next_revision:=(ack->>'serverRevision')::bigint;if next_revision<p.revision or next_revision>p.revision+1 or ack->'confirmedDocuments'<>documents or image->>'projectId'<>project::text or jsonb_typeof(documents)<>'array' or jsonb_array_length(documents)>100001 then raise exception 'PROTOCOL_INVALID';end if;
  for d in select value from jsonb_array_elements(documents)loop
   if d->>'projectId'<>project::text or(d->>'revision')::bigint>next_revision then raise exception 'PROTOCOL_INVALID';end if;
   select value into old from jsonb_array_elements(p.documents)where value->>'id'=d->>'id';
   if old is distinct from d and not exists(select 1 from jsonb_array_elements(operation->'targets')t where t->>'targetId'=d->>'id') and not coalesce(scenario_private.derived_review_update(old,d),false) then raise exception 'PROTOCOL_INVALID';end if;
   if role='editor' and old is distinct from d and not coalesce(scenario_private.derived_review_update(old,d),false) and ((old is not null and old->'fields'->>'visibility' is distinct from 'team')or d->'fields'->>'visibility' is distinct from 'team')then raise exception using errcode='42501',message='FORBIDDEN';end if;
   insert into scenario_private.documents(project_id,id,revision,document) values(project,(d->>'id')::uuid,(d->>'revision')::bigint,d) on conflict(project_id,id) do update set revision=excluded.revision,document=excluded.document;
  end loop;
  if exists(select 1 from jsonb_array_elements(p.documents)old where not exists(select 1 from jsonb_array_elements(documents)new where new->>'id'=old->>'id'))then raise exception 'TOMBSTONE_REQUIRED';end if;
  update scenario_private.projects set revision=next_revision,documents=scenario_sync_commit.documents,native_image=image where id=project;
  insert into scenario_private.revisions values(project,next_revision,documents) on conflict(project_id,revision) do nothing;
 else raise exception 'PROTOCOL_INVALID';end if;
 insert into scenario_private.operations(project_id,operation_id,actor_id,operation_hash,operation,ack)values(project,(operation->>'operationId')::uuid,actor,operation_hash,operation,ack);
 return ack;
end $$;
-- This internal context is service-only. The Edge engine never returns it to an editor.
create function public.scenario_sync_engine_context(p_actor uuid,p_session uuid,p_project uuid,p_base bigint,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p scenario_private.projects; member text; common jsonb; previous jsonb;
begin
 if not scenario_private.session_valid(p_actor,p_session) then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 member:=scenario_private.member_role(p_project,p_actor);if member not in('owner','editor') or member is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into p from scenario_private.projects x where x.id=p_project;
 if p_base is not null then select x.documents into common from scenario_private.revisions x where x.project_id=p_project and x.revision=p_base;end if;
 if p_operation is not null then select x.ack into previous from scenario_private.operations x where x.project_id=p_project and x.operation_id=p_operation and x.actor_id=p_actor;end if;
 return jsonb_build_object('projectId',p_project,'serverRevision',p.revision::text,'documents',p.documents,'nativeImage',p.native_image,'baseDocuments',common,'role',member,'previousAck',previous,'worlds',coalesce((select jsonb_object_agg(w.snapshot_id::text,w.image)from scenario_private.world_images w where w.project_id=p_project),'{}'),'scopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.document_id,'fields',s.fields))from scenario_private.editor_scopes s where s.project_id=p_project and s.account_id=p_actor and s.revoked_at is null and(s.expires_at is null or s.expires_at>now())),'[]'));
end $$;
create function public.scenario_editor_grants(p_actor uuid,p_session uuid,p_project uuid,p_account uuid,p_scopes jsonb,p_expected bigint,p_membership bigint) returns void language plpgsql security definer set search_path='' as $$
declare p scenario_private.projects; entry jsonb; field text; doc jsonb;
begin
 select * into p from scenario_private.projects x where x.id=p_project for update;
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor) is distinct from 'owner' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p.revision<>p_expected or p.membership_revision is distinct from p_membership then raise exception 'REVISION_CHANGED';end if;
 if scenario_private.member_role(p_project,p_account)is distinct from 'editor' or jsonb_typeof(p_scopes)<>'array' or jsonb_array_length(p_scopes)>100000 then raise exception 'PROTOCOL_INVALID';end if;
 update scenario_private.editor_scopes x set revoked_at=now()where x.project_id=p_project and x.account_id=p_account;
 for entry in select value from jsonb_array_elements(p_scopes)loop
  select value into doc from jsonb_array_elements(p.documents)where value->>'id'=entry->>'id';
  if doc is null or doc->'fields'->>'visibility'is distinct from 'team' or doc->'fields'->>'kind'='project' or jsonb_typeof(entry->'fields')<>'array' then raise exception 'PROTOCOL_INVALID';end if;
  for field in select jsonb_array_elements_text(entry->'fields')loop if not(doc->'fields'?field)or field in('kind','visibility','createdAt')then raise exception 'PROTOCOL_INVALID';end if;end loop;
  insert into scenario_private.editor_scopes(project_id,account_id,document_id,fields)values(p_project,p_account,(entry->>'id')::uuid,array(select jsonb_array_elements_text(entry->'fields')))on conflict(project_id,account_id,document_id)do update set fields=excluded.fields,revoked_at=null,expires_at=null;
 end loop;
 update scenario_private.projects set membership_revision=membership_revision+1 where id=p_project;
end $$;
create function public.scenario_project_members(p_actor uuid,p_session uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('accountId',m.account_id,'role',m.role,'expiresAt',m.expires_at,'revokedAt',m.revoked_at))from scenario_private.memberships m where m.project_id=p_project),'[]');
end $$;
create function public.scenario_owned_projects(p_actor uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not scenario_private.session_valid(p_actor,p_session)then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('projectId',p.id,'serverRevision',p.revision::text,'role',m.role,'name',case when m.role='owner'then p.native_image->>'name'else null end))from scenario_private.projects p join scenario_private.memberships m on m.project_id=p.id where m.account_id=p_actor and m.revoked_at is null and(m.expires_at is null or m.expires_at>now())and m.role in('owner','editor')),'[]');
end $$;
create function public.scenario_publish(p_actor uuid,p_session uuid,p_project uuid,p_expected bigint,p_snapshot uuid,p_public_project text,p_source uuid,p_source_hash text,p_projection jsonb,p_hash text,p_expires timestamptz,p_assets jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p scenario_private.projects; asset jsonb;
begin
 select * into p from scenario_private.projects x where x.id=p_project for update;
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p.revision<>p_expected then raise exception 'REVISION_CHANGED';end if;
 if p_expires<=now()or jsonb_typeof(p_projection)<>'object'or p_hash!~'^[0-9a-f]{64}$'or p_source_hash!~'^[0-9a-f]{64}$'then raise exception 'PROTOCOL_INVALID';end if;
 insert into public.scenario_snapshots(id,public_project_id,projection,content_hash,expires_at)values(p_snapshot,p_public_project,p_projection,p_hash,p_expires);
 insert into scenario_private.snapshot_bindings values(p_snapshot,p_project,p_source,p_source_hash);
 for asset in select value from jsonb_array_elements(p_assets)loop
  if not exists(select 1 from scenario_private.assets a where a.project_id=p_project and a.content_hash=asset->>'hash'and a.complete)then raise exception 'ASSET_BYTES_REQUIRED';end if;
  insert into scenario_private.snapshot_assets values(p_snapshot,asset->>'publicId',p_project,asset->>'hash');
 end loop;
 return jsonb_build_object('id',p_snapshot,'contentHash',p_hash,'sourceVersionId',p_source);
end $$;
create function public.scenario_withdraw(p_actor uuid,p_session uuid,p_project uuid,p_snapshot uuid)returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from scenario_private.projects p where p.id=p_project for update;
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'or not exists(select 1 from scenario_private.snapshot_bindings b where b.project_id=p_project and b.snapshot_id=p_snapshot)then raise exception using errcode='42501',message='FORBIDDEN';end if;
 update public.scenario_snapshots s set withdrawn_at=now()where s.id=p_snapshot;
end $$;
-- Private bytes remain behind current-session checks. No signed URL survives revocation.
create function public.scenario_asset_access(p_actor uuid,p_session uuid,p_project uuid,p_hash text,p_snapshot uuid default null,p_public_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare asset scenario_private.assets; allowed boolean:=false;
begin
 if not scenario_private.session_valid(p_actor,p_session)then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into asset from scenario_private.assets a where a.project_id=p_project and a.content_hash=p_hash and a.complete;
 if p_snapshot is null then allowed:=scenario_private.member_role(p_project,p_actor)='owner';
 else allowed:=exists(select 1 from public.scenario_snapshots s join scenario_private.snapshot_bindings b on b.snapshot_id=s.id join scenario_private.snapshot_assets a on a.snapshot_id=s.id where s.id=p_snapshot and b.project_id=p_project and a.content_hash=p_hash and a.public_asset_id=p_public_id and s.withdrawn_at is null and(s.expires_at is null or s.expires_at>now())and(scenario_private.member_role(p_project,p_actor)='owner'or(scenario_private.member_role(p_project,p_actor)is not null and exists(select 1 from scenario_private.snapshot_grants g where g.snapshot_id=s.id and g.account_id=p_actor and g.revoked_at is null and(g.expires_at is null or g.expires_at>now())))));end if;
 if asset.content_hash is null or not coalesce(allowed,false)then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return jsonb_build_object('path',asset.storage_path,'mediaType',asset.media_type,'byteSize',asset.byte_size,'contentHash',asset.content_hash);
end $$;
create function public.scenario_asset_complete(p_actor uuid,p_session uuid,p_project uuid,p_hash text,p_size bigint,p_type text,p_path text,p_visibility text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from scenario_private.projects p where p.id=p_project for update;
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p_path<>p_project::text||'/'||p_hash or p_hash!~'^[0-9a-f]{64}$'or p_size not between 0 and 33554432 or p_visibility not in('private','team')then raise exception 'PROTOCOL_INVALID';end if;
 insert into scenario_private.assets(project_id,content_hash,byte_size,media_type,visibility,storage_path,complete)values(p_project,p_hash,p_size,p_type,p_visibility,p_path,true)on conflict(project_id,content_hash)do update set complete=true;
end $$;
revoke all on function public.scenario_sync_engine_context(uuid,uuid,uuid,bigint,uuid),public.scenario_editor_grants(uuid,uuid,uuid,uuid,jsonb,bigint,bigint),public.scenario_project_members(uuid,uuid,uuid),public.scenario_owned_projects(uuid,uuid),public.scenario_publish(uuid,uuid,uuid,bigint,uuid,text,uuid,text,jsonb,text,timestamptz,jsonb),public.scenario_withdraw(uuid,uuid,uuid,uuid),public.scenario_asset_access(uuid,uuid,uuid,text,uuid,text),public.scenario_asset_complete(uuid,uuid,uuid,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.scenario_sync_state(uuid,uuid,uuid,bigint,uuid),public.scenario_sync_bootstrap(uuid,uuid,uuid,jsonb,jsonb,jsonb),public.scenario_sync_commit(uuid,uuid,uuid,bigint,jsonb,text,jsonb,jsonb,jsonb),public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[]) to service_role;
grant execute on function public.scenario_sync_engine_context(uuid,uuid,uuid,bigint,uuid),public.scenario_editor_grants(uuid,uuid,uuid,uuid,jsonb,bigint,bigint),public.scenario_project_members(uuid,uuid,uuid),public.scenario_owned_projects(uuid,uuid),public.scenario_publish(uuid,uuid,uuid,bigint,uuid,text,uuid,text,jsonb,text,timestamptz,jsonb),public.scenario_withdraw(uuid,uuid,uuid,uuid),public.scenario_asset_access(uuid,uuid,uuid,text,uuid,text),public.scenario_asset_complete(uuid,uuid,uuid,text,bigint,text,text,text) to service_role;
commit;
