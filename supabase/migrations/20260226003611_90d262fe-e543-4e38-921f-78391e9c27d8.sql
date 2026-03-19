
-- Enum for company-level roles
CREATE TYPE public.company_role AS ENUM ('administrador', 'supervisor', 'operador');

-- Table linking users to companies with a role
CREATE TABLE public.company_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.company_config(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role company_role NOT NULL DEFAULT 'operador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- Security definer to check company admin status without recursion
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'administrador'
  )
$$;

-- Security definer to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_users
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Security definer to get user's company role
CREATE OR REPLACE FUNCTION public.get_company_role(_user_id uuid, _company_id uuid)
RETURNS company_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.company_users
  WHERE user_id = _user_id AND company_id = _company_id
  LIMIT 1
$$;

-- RLS: Global admins can do everything
CREATE POLICY "Global admins can manage company_users"
ON public.company_users FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS: Company admins can manage users in their company
CREATE POLICY "Company admins can manage their users"
ON public.company_users FOR ALL
USING (public.is_company_admin(auth.uid(), company_id));

-- RLS: Users can view their own membership
CREATE POLICY "Users can view own company membership"
ON public.company_users FOR SELECT
USING (user_id = auth.uid());

-- Migrate existing company_config owners as 'administrador' in company_users
INSERT INTO public.company_users (company_id, user_id, role)
SELECT id, user_id, 'administrador'::company_role
FROM public.company_config
ON CONFLICT (company_id, user_id) DO NOTHING;
