begin;
alter table scenario_private.projects add column membership_revision bigint not null default 0;
drop function public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[]);
create function public.scenario_membership(actor uuid,session uuid,project uuid,account uuid,new_role text,expires_at timestamptz,revoked boolean,snapshots uuid[],expected_membership bigint) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare p scenario_private.projects; current_role text; target uuid;
begin
 select * into p from scenario_private.projects x where x.id=project for update;
 if not scenario_private.session_valid(actor,session) or scenario_private.member_role(project,actor) is distinct from 'owner' then raise exception using errcode='42501',message='FORBIDDEN';end if;
 if p.membership_revision is distinct from expected_membership then raise exception 'REVISION_CHANGED';end if;
 if new_role not in('owner','editor','reviewer','reader') or account is null or expires_at<=now()or snapshots is null or cardinality(snapshots)>10000 then raise exception 'PROTOCOL_INVALID';end if;
 select role into current_role from scenario_private.memberships where project_id=project and account_id=account for update;
 if current_role='owner' and(new_role<>'owner' or revoked or expires_at is not null) and(select count(*)from scenario_private.memberships m where m.project_id=project and m.role='owner' and m.revoked_at is null and(m.expires_at is null or m.expires_at>now()))<=1 then raise exception 'LAST_OWNER_REQUIRED';end if;
 insert into scenario_private.memberships values(project,account,new_role,expires_at,case when revoked then now()end)on conflict(project_id,account_id)do update set role=excluded.role,expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 update scenario_private.snapshot_grants g set revoked_at=now()where g.account_id=account and exists(select 1 from scenario_private.snapshot_bindings b where b.project_id=project and b.snapshot_id=g.snapshot_id);
 foreach target in array snapshots loop
  if not exists(select 1 from scenario_private.snapshot_bindings b where b.project_id=project and b.snapshot_id=target)then raise exception 'PROTOCOL_INVALID';end if;
  insert into scenario_private.snapshot_grants values(target,account,expires_at,case when revoked then now()end)on conflict(snapshot_id,account_id)do update set expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 end loop;
 update scenario_private.projects set membership_revision=membership_revision+1,collaboration=case when account<>actor and not revoked then true else collaboration end where id=project;
end $$;
create or replace function public.scenario_project_members(p_actor uuid,p_session uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return jsonb_build_object('membershipRevision',(select membership_revision::text from scenario_private.projects where id=p_project),'members',coalesce((select jsonb_agg(jsonb_build_object('accountId',m.account_id,'role',m.role,'expiresAt',m.expires_at,'revokedAt',m.revoked_at,'snapshotIds',coalesce((select jsonb_agg(g.snapshot_id)from scenario_private.snapshot_grants g join scenario_private.snapshot_bindings b on b.snapshot_id=g.snapshot_id where b.project_id=p_project and g.account_id=m.account_id and g.revoked_at is null),'[]')))from scenario_private.memberships m where m.project_id=p_project),'[]'));
end $$;
create function public.scenario_project_shares(p_actor uuid,p_session uuid,p_project uuid)returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not scenario_private.session_valid(p_actor,p_session)or scenario_private.member_role(p_project,p_actor)is distinct from 'owner'then raise exception using errcode='42501',message='FORBIDDEN';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'sourceVersionId',b.source_version_id,'contentHash',s.content_hash,'withdrawnAt',s.withdrawn_at,'expiresAt',s.expires_at)order by s.created_at desc)from public.scenario_snapshots s join scenario_private.snapshot_bindings b on b.snapshot_id=s.id where b.project_id=p_project),'[]');
end $$;
revoke all on function public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[],bigint),public.scenario_project_shares(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scenario_membership(uuid,uuid,uuid,uuid,text,timestamptz,boolean,uuid[],bigint),public.scenario_project_shares(uuid,uuid,uuid) to service_role;
commit;
