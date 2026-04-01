
-- Conversations table (one per WhatsApp contact)
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wa_id TEXT NOT NULL UNIQUE, -- WhatsApp phone number
  profile_name TEXT, -- Contact name from WhatsApp
  profile_picture_url TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_message_preview TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT, -- YCloud message ID
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text', -- text, image, etc.
  status TEXT DEFAULT 'sent', -- sent, delivered, read, failed
  sender_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Only authenticated users (admins) can access
CREATE POLICY "Admins can manage conversations"
  ON public.conversations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage messages"
  ON public.messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view messages"
  ON public.messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow webhook edge function to insert (service role handles this, but also allow via special policy)
CREATE POLICY "Service can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update conversations"
  ON public.conversations FOR UPDATE
  USING (true);

CREATE POLICY "Service can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Trigger for updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
