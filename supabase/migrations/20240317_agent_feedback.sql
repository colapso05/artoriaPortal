-- Migration for agent_feedback table
create table public.agent_feedback (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  wa_id text not null,
  error_type text not null check (error_type in ('informacion_incorrecta', 'no_entendio', 'derivo_mal', 'otro')),
  description_wrong text not null,
  description_expected text not null,
  status text not null default 'pendiente' check (status in ('pendiente', 'revisado', 'resuelto')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reported_by uuid references auth.users(id) on delete set null
);

-- RLS
alter table public.agent_feedback enable row level security;

create policy "Admins ISP can view all feedback"
  on public.agent_feedback for select
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin_isp'
    )
  );

create policy "Admins ISP can update all feedback"
  on public.agent_feedback for update
  using (
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin_isp'
    )
  );

create policy "Users can insert feedback for their company"
  on public.agent_feedback for insert
  with check (
    exists (
      select 1 from user_company_roles
      where user_company_roles.user_id = auth.uid()
      and user_company_roles.company_id = agent_feedback.company_id
    )
    or
    exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
      and user_roles.role = 'admin_isp'
    )
  );

-- Trigger to update updated_at
create trigger handle_updated_at before update on public.agent_feedback
  for each row execute procedure public.moddatetime (updated_at);
