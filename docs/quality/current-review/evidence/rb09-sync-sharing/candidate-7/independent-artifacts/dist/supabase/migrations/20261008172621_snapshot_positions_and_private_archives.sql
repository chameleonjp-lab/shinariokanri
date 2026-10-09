begin;
alter table public.scenario_comments add column public_version_id text not null default 'public-project';
create or replace function scenario_private.guard_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb; e jsonb; block jsonb; found boolean:=false;
begin
 if not scenario_private.can_comment(new.snapshot_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
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
create function public.scenario_shared_snapshot(p_actor uuid,p_session uuid,p_snapshot uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare snap public.scenario_snapshots; binding scenario_private.snapshot_bindings; member scenario_private.memberships; permission scenario_private.snapshot_grants; expiry timestamptz;
begin
 if not scenario_private.session_valid(p_actor,p_session)then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into snap from public.scenario_snapshots s where s.id=p_snapshot;
 select * into binding from scenario_private.snapshot_bindings b where b.snapshot_id=p_snapshot;
 select * into member from scenario_private.memberships m where m.project_id=binding.project_id and m.account_id=p_actor and m.revoked_at is null and(m.expires_at is null or m.expires_at>clock_timestamp());
 select * into permission from scenario_private.snapshot_grants g where g.snapshot_id=p_snapshot and g.account_id=p_actor and g.revoked_at is null and(g.expires_at is null or g.expires_at>clock_timestamp());
 if snap.id is null or snap.withdrawn_at is not null or snap.expires_at<=clock_timestamp()or member.role is null or(member.role<>'owner'and permission.snapshot_id is null)then raise exception using errcode='42501',message='FORBIDDEN';end if;
 expiry:=least(snap.expires_at,member.expires_at,case when member.role<>'owner'then permission.expires_at else null end);
 return jsonb_build_object('id',snap.id,'projection',snap.projection,'contentHash',snap.content_hash,'createdAt',snap.created_at,'accessExpiresAt',expiry,'role',member.role);
end $$;
create function public.scenario_public_asset_access(p_actor uuid,p_session uuid,p_snapshot uuid,p_public_id text)returns jsonb language plpgsql security definer set search_path='' as $$
declare asset scenario_private.snapshot_assets;
begin
 perform public.scenario_shared_snapshot(p_actor,p_session,p_snapshot);
 select * into asset from scenario_private.snapshot_assets a where a.snapshot_id=p_snapshot and a.public_asset_id=p_public_id;
 if asset.snapshot_id is null then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return public.scenario_asset_access(p_actor,p_session,asset.project_id,asset.content_hash,p_snapshot,p_public_id);
end $$;
create table scenario_private.backup_archives(project_id uuid not null references scenario_private.projects(id),server_revision bigint not null,content_hash text not null check(content_hash~'^[0-9a-f]{64}$'),byte_size integer not null check(byte_size between 1 and 67108864),storage_path text not null unique,primary key(project_id,server_revision));
alter table scenario_private.backup_archives enable row level security;
grant all on scenario_private.backup_archives to service_role;
grant select on scenario_private.backup_archives to authenticated;
create policy backups_owner_metadata on scenario_private.backup_archives for select to authenticated using(scenario_private.can_author(project_id,'private'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('scenario-backups','scenario-backups',false,67108864,array['application/octet-stream','application/zip'])on conflict(id)do nothing;
create function public.scenario_archive_complete(p_actor uuid,p_session uuid,p_project uuid,p_revision bigint,p_hash text,p_size integer,p_path text)returns void language plpgsql security definer set search_path='' as $$
declare p scenario_private.projects; previous scenario_private.backup_archives;
begin
 select * into p from scenario_private.projects x where x.id=p_project for update;
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p.revision<>p_revision then raise exception 'REVISION_CHANGED';end if;
 if p_path<>p_project::text||'/'||p_revision::text||'/'||p_hash then raise exception 'PROTOCOL_INVALID';end if;
 select * into previous from scenario_private.backup_archives a where a.project_id=p_project and a.server_revision=p_revision;
 if previous.content_hash is not null and previous.content_hash<>p_hash then raise exception 'IMMUTABLE_ARCHIVE';end if;
 insert into scenario_private.backup_archives values(p_project,p_revision,p_hash,p_size,p_path)on conflict(project_id,server_revision)do nothing;
end $$;
create function public.scenario_archive_access(p_actor uuid,p_session uuid,p_project uuid,p_revision bigint default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare archive scenario_private.backup_archives;
begin
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 select * into archive from scenario_private.backup_archives a where a.project_id=p_project and a.server_revision=coalesce(p_revision,(select p.revision from scenario_private.projects p where p.id=p_project));
 if archive.content_hash is null then raise exception 'COMPLETE_ARCHIVE_REQUIRED';end if;
 return jsonb_build_object('path',archive.storage_path,'contentHash',archive.content_hash,'byteSize',archive.byte_size,'serverRevision',archive.server_revision::text);
end $$;
create policy backups_owner_read on storage.objects for select to authenticated using(bucket_id='scenario-backups'and exists(select 1 from scenario_private.backup_archives a where a.storage_path=name and scenario_private.can_author(a.project_id,'private')));
revoke all on function public.scenario_shared_snapshot(uuid,uuid,uuid),public.scenario_public_asset_access(uuid,uuid,uuid,text),public.scenario_archive_complete(uuid,uuid,uuid,bigint,text,integer,text),public.scenario_archive_access(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.scenario_shared_snapshot(uuid,uuid,uuid),public.scenario_public_asset_access(uuid,uuid,uuid,text),public.scenario_archive_complete(uuid,uuid,uuid,bigint,text,integer,text),public.scenario_archive_access(uuid,uuid,uuid,bigint) to service_role;
commit;
