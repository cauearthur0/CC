-- Pequenos Rolês: família conectada (mesma agenda em vários celulares) e notificações.
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run". Pode rodar de novo sem problema.
--
-- Como funciona:
-- - Cada celular entra de forma anônima (sem e-mail nem senha).
-- - Um celular cria a família e recebe um código (ex.: K7MQ-3XPA); os outros entram com esse código.
-- - Os dados da família (crianças, cidade, favoritos e agenda) ficam num documento só, em families.data.
-- - Ninguém lê nem altera uma família da qual não faz parte (regras de acesso no fim do arquivo).
-- - As notificações são enviadas por um robô do GitHub Actions, com a chave secreta do projeto.

-- ---------- Tabelas ----------

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index if not exists family_members_user_idx on public.family_members (user_id);

-- Um celular com notificações ligadas. "prefs" guarda os alertas escolhidos no app (ai, free, rain).
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Notificações já enviadas (para não mandar a mesma duas vezes).
create table if not exists public.notification_log (
  endpoint text not null,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (endpoint, kind, ref)
);

-- Chaves das notificações (VAPID), criadas pelo robô na primeira vez que ele roda.
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);

-- ---------- Regras de acesso ----------
-- Sem regra = ninguém acessa pelo app. Só o robô (chave secreta) passa por cima delas.

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.app_secrets enable row level security;

create or replace function public.is_family_member(p_family uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members m where m.family_id = p_family and m.user_id = auth.uid()
  );
$$;

drop policy if exists "membros leem a família" on public.families;
create policy "membros leem a família" on public.families
  for select to authenticated using (public.is_family_member(id));

drop policy if exists "cada um vê a própria participação" on public.family_members;
create policy "cada um vê a própria participação" on public.family_members
  for select to authenticated using (user_id = auth.uid());

-- ---------- Funções chamadas pelo app ----------

-- Sai da família atual (e apaga a família se ninguém mais estiver nela).
create or replace function public.leave_family()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  if auth.uid() is null then
    raise exception 'sem_sessao';
  end if;
  delete from public.push_subscriptions where user_id = auth.uid();
  for v_family in delete from public.family_members where user_id = auth.uid() returning family_id loop
    delete from public.families f
     where f.id = v_family
       and not exists (select 1 from public.family_members m where m.family_id = f.id);
  end loop;
end;
$$;

-- Cria uma família com os dados deste celular e devolve o código para os outros entrarem.
create or replace function public.create_family(p_data jsonb)
returns table (id uuid, code text, version bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- sem 0/O, 1/I/L
  v_code text;
  v_bytes bytea;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sem_sessao';
  end if;
  if octet_length(p_data::text) > 3000000 then
    raise exception 'dados_grandes_demais';
  end if;
  perform public.leave_family();
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 31), 1);
    end loop;
    exit when not exists (select 1 from public.families f where f.code = v_code);
  end loop;
  insert into public.families (code, data) values (v_code, coalesce(p_data, '{}'::jsonb)) returning families.id into v_id;
  insert into public.family_members (family_id, user_id) values (v_id, auth.uid());
  return query select v_id, v_code, 1::bigint;
end;
$$;

-- Entra numa família pelo código (aceita com ou sem hífen, maiúsculas ou minúsculas).
create or replace function public.join_family(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sem_sessao';
  end if;
  select f.id into v_id
    from public.families f
   where f.code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  if v_id is null then
    raise exception 'codigo_invalido';
  end if;
  if not public.is_family_member(v_id) then
    perform public.leave_family();
    insert into public.family_members (family_id, user_id) values (v_id, auth.uid());
  end if;
  return v_id;
end;
$$;

-- Salva os dados da família, só se ninguém tiver salvo outra versão no meio do caminho.
-- Devolve a nova versão, ou null se a versão mudou (o app junta as mudanças e tenta de novo).
create or replace function public.save_family_data(p_family uuid, p_data jsonb, p_version bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version bigint;
begin
  if not public.is_family_member(p_family) then
    raise exception 'sem_acesso';
  end if;
  if octet_length(p_data::text) > 3000000 then
    raise exception 'dados_grandes_demais';
  end if;
  update public.families
     set data = p_data, version = families.version + 1, updated_at = now()
   where families.id = p_family and families.version = p_version
  returning families.version into v_version;
  return v_version;
end;
$$;

-- Liga (ou atualiza) as notificações deste celular.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_family uuid;
begin
  select m.family_id into v_family from public.family_members m where m.user_id = auth.uid() limit 1;
  if v_family is null then
    raise exception 'sem_familia';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'endereco_invalido';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, family_id, p256dh, auth, prefs)
  values (p_endpoint, auth.uid(), v_family, p_p256dh, p_auth, coalesce(p_prefs, '{}'::jsonb))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        family_id = excluded.family_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        prefs = excluded.prefs,
        updated_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Chave pública das notificações (a privada nunca sai do banco).
create or replace function public.get_vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_secrets where name = 'vapid_public';
$$;

-- Só quem entrou no app (mesmo de forma anônima) chama as funções.
revoke execute on function public.is_family_member(uuid) from public, anon;
revoke execute on function public.leave_family() from public, anon;
revoke execute on function public.create_family(jsonb) from public, anon;
revoke execute on function public.join_family(text) from public, anon;
revoke execute on function public.save_family_data(uuid, jsonb, bigint) from public, anon;
revoke execute on function public.save_push_subscription(text, text, text, jsonb) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
revoke execute on function public.get_vapid_public_key() from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.leave_family() to authenticated;
grant execute on function public.create_family(jsonb) to authenticated;
grant execute on function public.join_family(text) to authenticated;
grant execute on function public.save_family_data(uuid, jsonb, bigint) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, jsonb) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.get_vapid_public_key() to authenticated;

-- Permissões das tabelas (as regras de acesso acima continuam valendo para o app).
revoke all on public.families, public.family_members, public.push_subscriptions, public.notification_log,
  public.app_secrets from anon;
revoke insert, update, delete on public.families, public.family_members from authenticated;
revoke all on public.push_subscriptions, public.notification_log, public.app_secrets from authenticated;
grant select on public.families, public.family_members to authenticated;
grant all on public.families, public.family_members, public.push_subscriptions, public.notification_log,
  public.app_secrets to service_role;
