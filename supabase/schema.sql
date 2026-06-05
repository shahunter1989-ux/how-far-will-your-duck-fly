create extension if not exists pgcrypto;

create table if not exists public.leaderboard_scores (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('daily', 'weekly')),
  period_key text not null check (period_key ~ '^\d{4}-\d{2}-\d{2}$'),
  device_id text not null check (char_length(device_id) between 8 and 80),
  nickname text not null check (char_length(nickname) between 1 and 18),
  score integer not null check (score >= 0),
  peak_altitude integer not null check (peak_altitude >= 0),
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_type, period_key, device_id)
);

create index if not exists leaderboard_scores_period_rank_idx
  on public.leaderboard_scores (period_type, period_key, score desc, played_at asc);

alter table public.leaderboard_scores enable row level security;

revoke insert, update, delete on public.leaderboard_scores from anon, authenticated;
grant select on public.leaderboard_scores to anon, authenticated;

drop policy if exists "Public can read leaderboard scores" on public.leaderboard_scores;
create policy "Public can read leaderboard scores"
  on public.leaderboard_scores
  for select
  to anon, authenticated
  using (true);

create or replace function public.upsert_leaderboard_best(
  p_period_type text,
  p_period_key text,
  p_device_id text,
  p_nickname text,
  p_score integer,
  p_peak_altitude integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  best_score integer;
begin
  insert into public.leaderboard_scores (
    period_type,
    period_key,
    device_id,
    nickname,
    score,
    peak_altitude,
    played_at,
    updated_at
  )
  values (
    p_period_type,
    p_period_key,
    p_device_id,
    p_nickname,
    p_score,
    p_peak_altitude,
    now(),
    now()
  )
  on conflict (period_type, period_key, device_id)
  do update set
    nickname = excluded.nickname,
    score = excluded.score,
    peak_altitude = excluded.peak_altitude,
    played_at = excluded.played_at,
    updated_at = now()
  where public.leaderboard_scores.score < excluded.score
  returning public.leaderboard_scores.score into best_score;

  if best_score is null then
    select score into best_score
    from public.leaderboard_scores
    where period_type = p_period_type
      and period_key = p_period_key
      and device_id = p_device_id;
  end if;

  return coalesce(best_score, p_score);
end;
$$;

revoke all on function public.upsert_leaderboard_best(text, text, text, text, integer, integer) from public;
grant execute on function public.upsert_leaderboard_best(text, text, text, text, integer, integer) to service_role;
