begin;
-- Only the verified Edge engine calculates these dependent IDs from the canonical old/new images.
-- Authenticated clients cannot submit a native image, a derived ID list, or execute this RPC.
create function public.scenario_sync_commit_prepared(actor uuid,session uuid,project uuid,expected_revision bigint,operation jsonb,operation_hash text,ack jsonb,documents jsonb,image jsonb,derived_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p scenario_private.projects; role text; previous scenario_private.operations; target jsonb; old jsonb; merged jsonb; d jsonb; base jsonb; next_revision bigint; original scenario_private.operations; resolution_target jsonb;
begin
 if not scenario_private.session_valid(actor,session) then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into p from scenario_private.projects where id=project for update;role:=scenario_private.member_role(project,actor);
 if p.id is null or role not in('owner','editor') or role is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if derived_ids is null or cardinality(derived_ids)>100000 then raise exception 'PROTOCOL_INVALID';end if;
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
   if old is distinct from d and not exists(select 1 from jsonb_array_elements(operation->'targets')t where t->>'targetId'=d->>'id') and not((d->>'id')::uuid=any(derived_ids)) then raise exception 'PROTOCOL_INVALID';end if;
   if role='editor' and old is distinct from d and not((d->>'id')::uuid=any(derived_ids)) and ((old is not null and old->'fields'->>'visibility' is distinct from 'team')or d->'fields'->>'visibility' is distinct from 'team')then raise exception using errcode='42501',message='FORBIDDEN';end if;
   insert into scenario_private.documents(project_id,id,revision,document) values(project,(d->>'id')::uuid,(d->>'revision')::bigint,d) on conflict(project_id,id) do update set revision=excluded.revision,document=excluded.document;
  end loop;
  if exists(select 1 from jsonb_array_elements(p.documents)old where not exists(select 1 from jsonb_array_elements(documents)new where new->>'id'=old->>'id'))then raise exception 'TOMBSTONE_REQUIRED';end if;
  update scenario_private.projects set revision=next_revision,documents=scenario_sync_commit_prepared.documents,native_image=image where id=project;
  insert into scenario_private.revisions values(project,next_revision,documents) on conflict(project_id,revision) do nothing;
 else raise exception 'PROTOCOL_INVALID';end if;
 insert into scenario_private.operations(project_id,operation_id,actor_id,operation_hash,operation,ack)values(project,(operation->>'operationId')::uuid,actor,operation_hash,operation,ack);
 return ack;
end $$;
revoke all on function public.scenario_sync_commit_prepared(uuid,uuid,uuid,bigint,jsonb,text,jsonb,jsonb,jsonb,uuid[])from public,anon,authenticated;
grant execute on function public.scenario_sync_commit_prepared(uuid,uuid,uuid,bigint,jsonb,text,jsonb,jsonb,jsonb,uuid[])to service_role;
commit;
