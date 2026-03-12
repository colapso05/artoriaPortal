
-- Tabla de módulos disponibles
CREATE TABLE public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  nocodb_table_id text NOT NULL,
  nocodb_base_id text NOT NULL,
  icon text DEFAULT 'table',
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabla de asignación de módulos a usuarios
CREATE TABLE public.user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id)
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;

-- Policies for modules: admins manage, users can view
CREATE POLICY "Admins can manage modules"
ON public.modules FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view assigned modules"
ON public.modules FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_modules
    WHERE user_modules.module_id = modules.id
    AND user_modules.user_id = auth.uid()
  )
);

-- Policies for user_modules: admins manage, users view own
CREATE POLICY "Admins can manage user_modules"
ON public.user_modules FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own modules"
ON public.user_modules FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_modules_updated_at
BEFORE UPDATE ON public.modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
