
-- Smart Redirect Trigger for AI Responses
-- If an outbound message is inserted, we ensure it goes to the correct conversation
-- for the phone number, which is the one that received the most recent inbound message.

CREATE OR REPLACE FUNCTION public.redirect_ai_messages()
RETURNS TRIGGER AS $$
DECLARE
    target_conv_id UUID;
    target_company_id UUID;
    v_wa_id TEXT;
BEGIN
    -- Only act on outbound messages without a clear company or from external systems
    IF NEW.direction = 'outbound' THEN
        -- 1. Resolve wa_id from current conversation_id
        SELECT wa_id INTO v_wa_id FROM public.conversations WHERE id = NEW.conversation_id;
        
        IF v_wa_id IS NOT NULL THEN
            -- 2. Find the MOST RECENT conversation/company that had an INBOUND message from this wa_id
            -- This identifies the "currently active" company context for the user
            SELECT m.conversation_id, m.company_id INTO target_conv_id, target_company_id
            FROM public.messages m
            JOIN public.conversations c ON m.conversation_id = c.id
            WHERE c.wa_id = v_wa_id AND m.direction = 'inbound'
            ORDER BY m.created_at DESC
            LIMIT 1;
            
            IF target_conv_id IS NOT NULL AND target_conv_id <> NEW.conversation_id THEN
                -- Redirect message to the active conversation
                NEW.conversation_id := target_conv_id;
                NEW.company_id := target_company_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_redirect_ai_messages ON public.messages;
CREATE TRIGGER tr_redirect_ai_messages
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.redirect_ai_messages();
