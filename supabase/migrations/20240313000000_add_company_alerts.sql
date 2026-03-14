-- Add alert columns to company_config
ALTER TABLE public.company_config 
ADD COLUMN IF NOT EXISTS alert_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS alert_message TEXT,
ADD COLUMN IF NOT EXISTS alert_zones UUID[] DEFAULT '{}';

-- Optional: Update coverage_zones to reflect this if needed, 
-- but we might keep the old columns for backward compatibility in case they are used elsewhere.
