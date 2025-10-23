create table if not exists public.pipeline_logs (
  id uuid default gen_random_uuid() primary key,
  call_id text not null,
  stage text not null,
  timestamp timestamptz default now() not null,
  metadata jsonb,
  error text,
  duration integer,
  owner_email text not null,
  created_at timestamptz default now() not null
);

create index idx_pipeline_logs_call_id on public.pipeline_logs(call_id);
create index idx_pipeline_logs_timestamp on public.pipeline_logs(timestamp);
create index idx_pipeline_logs_owner_email on public.pipeline_logs(owner_email);

alter table public.pipeline_logs enable row level security;

create policy "Users can view their own pipeline logs"
  on public.pipeline_logs
  for select
  using (auth.jwt() ->> 'email' = owner_email);

create policy "Users can insert their own pipeline logs"
  on public.pipeline_logs
  for insert
  with check (auth.jwt() ->> 'email' = owner_email);

create policy "Service role can manage all pipeline logs"
  on public.pipeline_logs
  for all
  using (auth.role() = 'service_role');
