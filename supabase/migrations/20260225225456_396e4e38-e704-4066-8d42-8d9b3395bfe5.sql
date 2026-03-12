
-- Add media and sender type columns to messages
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS sender_type text NOT NULL DEFAULT 'customer';

-- Add comment for sender_type values: 'customer', 'agent', 'specialist', 'platform'
COMMENT ON COLUMN public.messages.sender_type IS 'Who sent: customer, agent (IA), specialist (human from phone), platform (from inbox UI)';

-- Add is_active_agent flag to conversations to track if AI agent is active
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_agent_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to text;
