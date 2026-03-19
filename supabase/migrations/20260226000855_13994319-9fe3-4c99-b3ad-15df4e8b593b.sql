
-- Create company_config table for multi-tenant YCloud configuration
CREATE TABLE public.company_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  ycloud_api_key TEXT NOT NULL,
  ycloud_phone TEXT NOT NULL,
  webhook_id UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add unique constraint on webhook_id for routing
ALTER TABLE public.company_config ADD CONSTRAINT company_config_webhook_id_key UNIQUE (webhook_id);

-- Add company_id to conversations
ALTER TABLE public.conversations ADD COLUMN company_id UUID REFERENCES public.company_config(id);

-- Add company_id to messages
ALTER TABLE public.messages ADD COLUMN company_id UUID REFERENCES public.company_config(id);

-- Enable RLS on company_config
ALTER TABLE public.company_config ENABLE ROW LEVEL SECURITY;

-- Admins can manage all company configs
CREATE POLICY "Admins can manage company_config"
  ON public.company_config FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own company config
CREATE POLICY "Users can view own company_config"
  ON public.company_config FOR SELECT
  USING (user_id = auth.uid());

-- Update trigger for updated_at
CREATE TRIGGER update_company_config_updated_at
  BEFORE UPDATE ON public.company_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for company_config
ALTER PUBLICATION supabase_realtime ADD TABLE public.company_config;
