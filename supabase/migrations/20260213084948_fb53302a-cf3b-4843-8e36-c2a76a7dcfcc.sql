
-- Create table for standalone toggles (agent controls)
CREATE TABLE public.user_toggles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Control de Agente',
  nocodb_table_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_toggles ENABLE ROW LEVEL SECURITY;

-- Admins can manage all toggles
CREATE POLICY "Admins can manage toggles"
ON public.user_toggles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own toggles
CREATE POLICY "Users can view own toggles"
ON public.user_toggles
FOR SELECT
USING (user_id = auth.uid());
