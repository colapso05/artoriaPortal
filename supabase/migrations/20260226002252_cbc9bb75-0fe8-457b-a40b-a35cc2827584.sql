
-- ========================
-- FASE 3: TICKETING
-- ========================

-- Ticket category enum
CREATE TYPE public.ticket_category AS ENUM ('soporte_tecnico', 'consulta_comercial', 'ventas', 'pagos');

-- Ticket status enum
CREATE TYPE public.ticket_status AS ENUM ('abierto', 'en_progreso', 'esperando_cliente', 'resuelto', 'cerrado');

-- Ticket priority enum
CREATE TYPE public.ticket_priority AS ENUM ('baja', 'media', 'alta', 'urgente');

-- Tickets table
CREATE TABLE public.tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.company_config(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category ticket_category NOT NULL DEFAULT 'soporte_tecnico',
  status ticket_status NOT NULL DEFAULT 'abierto',
  priority ticket_priority NOT NULL DEFAULT 'media',
  assigned_to TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  created_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ticket notes/comments
CREATE TABLE public.ticket_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_name TEXT,
  author_id UUID,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_notes ENABLE ROW LEVEL SECURITY;

-- Tickets RLS
CREATE POLICY "Admins can manage tickets" ON public.tickets FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view company tickets" ON public.tickets FOR SELECT
  USING (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE POLICY "Users can create tickets" ON public.tickets FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE POLICY "Users can update company tickets" ON public.tickets FOR UPDATE
  USING (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

-- Ticket notes RLS
CREATE POLICY "Admins can manage ticket_notes" ON public.ticket_notes FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view ticket notes" ON public.ticket_notes FOR SELECT
  USING (ticket_id IN (
    SELECT id FROM public.tickets WHERE company_id IN (
      SELECT id FROM public.company_config WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can add ticket notes" ON public.ticket_notes FOR INSERT
  WITH CHECK (ticket_id IN (
    SELECT id FROM public.tickets WHERE company_id IN (
      SELECT id FROM public.company_config WHERE user_id = auth.uid()
    )
  ));

-- Triggers
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================
-- FASE 4: COVERAGE ZONES
-- ========================

CREATE TABLE public.coverage_zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.company_config(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  polygon JSONB NOT NULL, -- Array of [lat, lng] coordinates
  color TEXT DEFAULT '#3b82f6',
  technician_name TEXT,
  technician_phone TEXT,
  alert_active BOOLEAN NOT NULL DEFAULT false,
  alert_message TEXT DEFAULT 'Estamos experimentando problemas en su zona. Estamos trabajando para resolver la situación.',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.coverage_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coverage_zones" ON public.coverage_zones FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view company zones" ON public.coverage_zones FOR SELECT
  USING (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage company zones" ON public.coverage_zones FOR INSERT
  WITH CHECK (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE POLICY "Users can update company zones" ON public.coverage_zones FOR UPDATE
  USING (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete company zones" ON public.coverage_zones FOR DELETE
  USING (company_id IN (SELECT id FROM public.company_config WHERE user_id = auth.uid()));

CREATE TRIGGER update_coverage_zones_updated_at
  BEFORE UPDATE ON public.coverage_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_zones;
