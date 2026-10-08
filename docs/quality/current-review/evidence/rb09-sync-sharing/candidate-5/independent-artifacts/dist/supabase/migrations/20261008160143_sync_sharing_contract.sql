-- Dedicated project only. No deployment is performed by this migration's preparation.
begin;
create schema if not exists scenario_private;
revoke all on schema scenario_private from public, anon;
grant usage on schema scenario_private to authenticated, service_role;
create table scenario_private.projects (
 id uuid primary key, owner_id uuid not null references auth.users(id), revision bigint not null default 0 check(revision>=0),
 collaboration boolean not null default false, created_at timestamptz not null default now()
);
create table scenario_private.memberships (
 project_id uuid not null references scenario_private.projects(id), account_id uuid not null references auth.users(id),
 role text not null check(role in ('owner','editor','reviewer','reader')), expires_at timestamptz, revoked_at timestamptz,
 primary key(project_id,account_id)
);
create index memberships_account_project on scenario_private.memberships(account_id,project_id);
create table scenario_private.documents (
 project_id uuid not null references scenario_private.projects(id), id uuid not null, revision bigint not null check(revision>=0),
 document jsonb not null check(jsonb_typeof(document)='object'), primary key(project_id,id)
);
create table scenario_private.revisions (
 project_id uuid not null references scenario_private.projects(id), revision bigint not null, documents jsonb not null,
 primary key(project_id,revision)
);
create table scenario_private.operations (
 project_id uuid not null references scenario_private.projects(id), operation_id uuid not null, actor_id uuid not null references auth.users(id),
 operation_hash text not null check(operation_hash ~ '^sha256:[0-9a-f]{64}$'), operation jsonb not null, ack jsonb not null,
 created_at timestamptz not null default now(), primary key(project_id,operation_id)
);
create table scenario_private.assets (
 project_id uuid not null references scenario_private.projects(id), content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 byte_size integer not null check(byte_size between 0 and 33554432), media_type text not null, visibility text not null check(visibility in('private','team')),
 storage_path text not null unique check(storage_path !~ '(^/|\.\.|\\)'), complete boolean not null default false,
 primary key(project_id,content_hash)
);
create table public.scenario_snapshots (
 id uuid primary key, public_project_id text not null, projection jsonb not null check(jsonb_typeof(projection)='object'),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default now(),
 expires_at timestamptz, withdrawn_at timestamptz
);
create table scenario_private.snapshot_bindings (
 snapshot_id uuid primary key references public.scenario_snapshots(id), project_id uuid not null references scenario_private.projects(id),
 source_version_id uuid not null, source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$')
);
create index snapshot_bindings_project on scenario_private.snapshot_bindings(project_id,snapshot_id);
create table public.scenario_comments (
 id uuid primary key default gen_random_uuid(), snapshot_id uuid not null references public.scenario_snapshots(id),
 public_entity_id text, public_block_id text, start_cp integer, end_cp integer, public_relation_id text,
 body text not null check(char_length(body) between 1 and 2000), created_at timestamptz not null default now(), resolved boolean not null default false,
 check((public_relation_id is not null and public_entity_id is null and public_block_id is null and start_cp is null and end_cp is null)
 or (public_relation_id is null and public_entity_id is not null and ((public_block_id is null and start_cp is null and end_cp is null)
 or (public_block_id is not null and start_cp is not null and end_cp is not null and start_cp>=0 and end_cp>start_cp))))
);
create index comments_snapshot_order on public.scenario_comments(snapshot_id,created_at,id);
create table scenario_private.comment_owners (
 comment_id uuid primary key references public.scenario_comments(id) on delete cascade, account_id uuid not null references auth.users(id)
);

create function scenario_private.session_valid(actor uuid, session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select actor is not null and session is not null and exists(select 1 from auth.sessions s where s.id=session and s.user_id=actor and (s.not_after is null or s.not_after>now()))
$$;
create function scenario_private.current_session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select scenario_private.session_valid(auth.uid(),case when auth.jwt()->>'session_id' ~ '^[0-9a-f-]{36}$' then (auth.jwt()->>'session_id')::uuid else null end)
$$;
create function scenario_private.member_role(target uuid,actor uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from scenario_private.memberships m where m.project_id=target and m.account_id=actor and m.revoked_at is null and (m.expires_at is null or m.expires_at>now())
$$;
create function scenario_private.can_author(target uuid,visibility text) returns boolean language sql stable security definer set search_path='' as $$
 select scenario_private.current_session_valid() and (scenario_private.member_role(target,auth.uid())='owner' or (visibility='team' and scenario_private.member_role(target,auth.uid())='editor'))
$$;
create function scenario_private.can_snapshot(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select scenario_private.current_session_valid() and exists(select 1 from public.scenario_snapshots s join scenario_private.snapshot_bindings b on b.snapshot_id=s.id
 where s.id=target and s.withdrawn_at is null and (s.expires_at is null or s.expires_at>now()) and scenario_private.member_role(b.project_id,auth.uid()) is not null)
$$;
create function scenario_private.can_comment(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select scenario_private.can_snapshot(target) and exists(select 1 from scenario_private.snapshot_bindings b where b.snapshot_id=target and scenario_private.member_role(b.project_id,auth.uid()) in('owner','editor','reviewer'))
$$;
create function scenario_private.owns_comment(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from scenario_private.comment_owners c where c.comment_id=target and c.account_id=auth.uid())
$$;
create function scenario_private.guard_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare payload jsonb; e jsonb; block jsonb; found boolean:=false;
begin
 if not scenario_private.can_comment(new.snapshot_id) then raise exception using errcode='42501',message='FORBIDDEN'; end if;
 if tg_op='UPDATE' and (new.id<>old.id or new.snapshot_id<>old.snapshot_id or new.public_entity_id is distinct from old.public_entity_id or new.public_block_id is distinct from old.public_block_id or new.start_cp is distinct from old.start_cp or new.end_cp is distinct from old.end_cp or new.public_relation_id is distinct from old.public_relation_id or new.created_at<>old.created_at) then raise exception 'TARGET_IMMUTABLE'; end if;
 select projection into payload from public.scenario_snapshots where id=new.snapshot_id;
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
create trigger comment_guard before insert or update on public.scenario_comments for each row execute function scenario_private.guard_comment();
create function scenario_private.record_comment_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into scenario_private.comment_owners(comment_id,account_id) values(new.id,auth.uid()); return new; end $$;
create trigger comment_owner after insert on public.scenario_comments for each row execute function scenario_private.record_comment_owner();

alter table scenario_private.projects enable row level security;
alter table scenario_private.memberships enable row level security;
alter table scenario_private.documents enable row level security;
alter table scenario_private.revisions enable row level security;
alter table scenario_private.operations enable row level security;
alter table scenario_private.assets enable row level security;
alter table scenario_private.snapshot_bindings enable row level security;
alter table scenario_private.comment_owners enable row level security;
alter table public.scenario_snapshots enable row level security;
alter table public.scenario_comments enable row level security;
create policy projects_owner_read on scenario_private.projects for select to authenticated using(scenario_private.can_author(id,'private'));
create policy memberships_owner_read on scenario_private.memberships for select to authenticated using(scenario_private.can_author(project_id,'private') or (account_id=auth.uid() and scenario_private.current_session_valid()));
create policy documents_author_read on scenario_private.documents for select to authenticated using(scenario_private.can_author(project_id,document->'fields'->>'visibility'));
create policy revisions_owner_read on scenario_private.revisions for select to authenticated using(scenario_private.can_author(project_id,'private'));
create policy operations_owner_read on scenario_private.operations for select to authenticated using(scenario_private.can_author(project_id,'private'));
create policy assets_author_read on scenario_private.assets for select to authenticated using(complete and scenario_private.can_author(project_id,visibility));
create policy snapshots_limited_read on public.scenario_snapshots for select to authenticated using(scenario_private.can_snapshot(id));
create policy comments_limited_read on public.scenario_comments for select to authenticated using(scenario_private.can_snapshot(snapshot_id));
create policy comments_reviewer_insert on public.scenario_comments for insert to authenticated with check(scenario_private.can_comment(snapshot_id));
create policy comments_own_update on public.scenario_comments for update to authenticated using(scenario_private.can_comment(snapshot_id) and scenario_private.owns_comment(id)) with check(scenario_private.can_comment(snapshot_id) and scenario_private.owns_comment(id));
create policy comments_own_delete on public.scenario_comments for delete to authenticated using(scenario_private.can_comment(snapshot_id) and scenario_private.owns_comment(id));
grant select on scenario_private.projects,scenario_private.memberships,scenario_private.documents,scenario_private.revisions,scenario_private.operations,scenario_private.assets to authenticated;
grant select on public.scenario_snapshots to authenticated;
grant select,insert,update,delete on public.scenario_comments to authenticated;
revoke all on all functions in schema scenario_private from public,anon;
grant execute on function scenario_private.current_session_valid(),scenario_private.can_author(uuid,text),scenario_private.can_snapshot(uuid),scenario_private.can_comment(uuid),scenario_private.owns_comment(uuid) to authenticated;
grant all on all tables in schema scenario_private to service_role;
grant all on public.scenario_snapshots,public.scenario_comments to service_role;
grant execute on all functions in schema scenario_private to service_role;

-- Metadata and bytes remain separate. This bucket is permanently private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('scenario-private','scenario-private',false,33554432,array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','audio/wav','audio/mpeg','audio/ogg','audio/mp4','video/mp4','video/webm','application/pdf','text/plain','text/markdown','application/json']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy scenario_assets_read on storage.objects for select to authenticated using(bucket_id='scenario-private' and exists(select 1 from scenario_private.assets a where a.storage_path=name and a.complete and scenario_private.can_author(a.project_id,a.visibility)));
-- Upload/create/overwrite/remove are authenticated Edge operations with server byte/hash/type verification.
-- No direct Storage write policy is granted, and no signed public URL is issued.
commit;
