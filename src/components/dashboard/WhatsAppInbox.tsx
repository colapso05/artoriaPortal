import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send, Search, ArrowLeft, Bot, Monitor,
  Phone, FileText, CheckCheck, Check, Clock,
  Ticket, User, Info, AlertCircle, XCircle, MessageCircle, X, Loader2, Download, Hand, Forward
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateTicketDialog } from "./CreateTicketDialog";
import { CustomerTicketsSearch } from "./CustomerTicketsSearch";

interface Conversation {
  id: string;
  wa_id: string;
  profile_name: string | null;
  profile_picture_url: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  is_agent_active?: boolean;
  assigned_role?: string | null;
  assigned_user_id?: string | null;
  taken_by?: string | null;
  taken_at?: string | null;
  status: 'abierto' | 'en_progreso' | 'cerrado'; // Virtual/Infered field
  match_content?: string; // For search results
}

interface Message {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: string;
  content: string;
  message_type: string;
  status: string | null;
  sender_name: string | null;
  sender_type?: string;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
}

function formatMessageTime(dateStr: string) {
  return format(new Date(dateStr), "HH:mm");
}

function formatWhatsAppText(text: string) {
  if (!text) return "";
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  formatted = formatted.replace(/\*([^\*]+)\*/g, "<strong>$1</strong>");
  // Italic
  formatted = formatted.replace(/_([^_]+)_/g, "<em>$1</em>");
  // Strikethrough
  formatted = formatted.replace(/~([^~]+)~/g, "<del>$1</del>");
  // Code
  formatted = formatted.replace(/`([^`]+)`/g, '<code class="bg-black/20 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');

  return formatted;
}

function formatConvDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ayer";
  return format(date, "dd/MM");
}

function getSenderBadge(senderType?: string, senderName?: string | null) {
  switch (senderType) {
    case "agent":
      return { icon: Bot, label: "IA" };
    case "specialist":
      return { icon: Phone, label: senderName || "Especialista" };
    case "platform":
      return { icon: Monitor, label: "Plataforma" };
    default:
      return null;
  }
}

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return <Clock className="w-[10px] h-[10px] text-muted-foreground/40" />;
  switch (status) {
    case "sent": return <Check className="w-[10px] h-[10px] text-muted-foreground/50" />;
    case "delivered": return <CheckCheck className="w-[10px] h-[10px] text-muted-foreground/50" />;
    case "read": return <CheckCheck className="w-[10px] h-[10px] text-blue-400" />;
    case "failed": return <AlertCircle className="w-[10px] h-[10px] text-destructive" />;
    default: return <Clock className="w-[10px] h-[10px] text-muted-foreground/40" />;
  }
}

function StatusBadge({ status, className = "" }: { status: 'abierto' | 'en_progreso' | 'cerrado', className?: string }) {
  const configs = {
    abierto: { label: 'ACTIVO', color: 'text-green-500', bg: 'bg-green-500', pulse: 'bg-green-400' },
    en_progreso: { label: 'En proceso', color: 'text-yellow-500', bg: 'bg-yellow-500', pulse: 'bg-yellow-400' },
    cerrado: { label: 'Cerrado', color: 'text-red-500', bg: 'bg-red-500', pulse: 'bg-red-400' },
  };

  const config = configs[status] || configs.en_progreso;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="relative flex h-2 w-2">
        <div className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.pulse} opacity-75`}></div>
        <div className={`relative inline-flex rounded-full h-2 w-2 ${config.bg}`}></div>
      </div>
      <span className={`text-[9px] font-bold tracking-widest uppercase ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
}

function getMediaType(mediaUrl: string, messageType?: string): 'image' | 'audio' | 'video' | 'document' {
  try {
    // 1. Try decoding YCloud payload
    const urlObj = new URL(mediaUrl);
    const payload = urlObj.searchParams.get('payload');
    if (payload) {
      const decoded = JSON.parse(atob(payload));
      const mime = decoded.mimeType || '';
      if (mime.startsWith('image')) return 'image';
      if (mime.startsWith('audio') || mime.includes('ogg')) return 'audio';
      if (mime.startsWith('video')) return 'video';
    }

    // 2. Fallback to extension/keywords if not a YCloud URL or payload missing
    const lowUrl = mediaUrl.toLowerCase();
    if (lowUrl.includes('image') || /\.(jpg|jpeg|png|gif|webp|heic)/i.test(lowUrl) || messageType === 'image') return 'image';
    if (lowUrl.includes('audio') || /\.(ogg|mp3|wav|m4a|amr)/i.test(lowUrl) || messageType === 'audio') return 'audio';
    if (lowUrl.includes('video') || /\.(mp4|mov|avi|3gp|mkv|wmv)/i.test(lowUrl) || messageType === 'video' || messageType === 'short_video') return 'video';
  } catch (e) {
    console.error("Error detecting media type:", e);
  }
  return 'document';
}

function MessageMedia({ message }: { message: Message }) {
  const url = message.media_url;
  if (!url) return null;

  const type = getMediaType(url, message.message_type);
  // URLs from Supabase Storage are public and loadable by the browser directly
  const isSupabaseUrl = url.includes('supabase.artoria.cl') || url.includes('supabase.co/storage');

  if (type === 'image') {
    return (
      <img
        src={url}
        alt="WhatsApp Image"
        className="rounded-lg max-w-[280px] md:max-w-xs max-h-[320px] object-cover cursor-pointer hover:opacity-90 transition mb-1.5 shadow-sm"
        onClick={() => window.open(url, "_blank")}
        loading="lazy"
      />
    );
  }

  if (type === 'audio') {
    // Native player for Supabase Storage URLs
    if (isSupabaseUrl) {
      return (
        <div className="mb-1.5">
          <audio controls className="w-56 h-10 rounded-lg" preload="metadata">
            <source src={url} type="audio/ogg" />
            <source src={url} type="audio/mpeg" />
          </audio>
        </div>
      );
    }
    // Fallback link for old YCloud URLs
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-lg px-4 py-2.5 text-sm text-white transition-colors mb-1.5 shadow-md w-fit"
      >
        <Phone className="w-4 h-4" />
        <span className="font-medium">🎵 Reproducir audio</span>
      </a>
    );
  }

  if (type === 'video') {
    // Native player for Supabase Storage URLs
    if (isSupabaseUrl) {
      return (
        <div className="mb-2">
          <video controls className="max-w-xs rounded-lg w-full" preload="metadata" playsInline>
            <source src={url} />
            Tu navegador no soporta el reproductor de video.
          </video>
        </div>
      );
    }
    // Full player with overlay button for YCloud or other URLs
    return (
      <div className="relative group/video max-w-[280px] rounded-xl overflow-hidden bg-slate-900 border border-border/10 shadow-2xl mb-2">
        <video
          className="w-full h-auto aspect-video cursor-pointer"
          controls
          playsInline
          preload="metadata"
        >
          <source src={url} />
          Tu navegador no soporta el reproductor de video.
        </video>
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover/video:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 rounded-full bg-black/60 hover:bg-black/90 text-white border-0 backdrop-blur-sm"
            onClick={() => window.open(url, "_blank")}
          >
            <Monitor className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  // Document/File Fallback
  const fileName = message.content && message.content.includes("📎 Archivo adjunto:") 
    ? message.content.split("📎 Archivo adjunto: ")[1]?.trim()
    : (url.split('/').pop()?.split('?')[0] || "Contenido Multimedia");

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition text-xs mb-1.5 border border-border/30 max-w-[240px]">
      <FileText className="w-5 h-5 shrink-0 text-primary" />
      <span className="underline truncate leading-snug font-medium text-blue-500 dark:text-blue-400">
        📎 Ver archivo ({fileName})
      </span>
    </a>
  );
}

interface WhatsAppInboxProps {
  companyId?: string;
  userId?: string;
  userName?: string;
  userRole?: string;
  operatorRoles?: string[];
  initialConversationId?: string;
  onConversationOpened?: () => void;
}

export default function WhatsAppInbox({ companyId, userId, userName, userRole, operatorRoles, initialConversationId, onConversationOpened }: WhatsAppInboxProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [chatFilter, setChatFilter] = useState<'all' | 'open' | 'mine' | 'closed' | 'en_progreso'>('all');
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRole, setTransferRole] = useState("soporte_tecnico");
  const [activeTicket, setActiveTicket] = useState<any>(null);
  
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [closeSummaryData, setCloseSummaryData] = useState<any>(null);
  const [closeSummaryText, setCloseSummaryText] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Debounced keyword search
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const normalize = (rows: any[]) =>
        rows.map(r => ({ ...r, id: r.id ?? r.conversation_id }));

      // 1. Always search the full phrase first (exact order)
      const { data: phraseData, error: phraseError } = await (supabase as any).rpc(
        'search_conversations_by_keyword',
        { p_company_id: companyId, p_keyword: searchTerm.trim() }
      );

      if (!phraseError && phraseData && (phraseData as any[]).length > 0) {
        setSearchResults(normalize(phraseData as any[]));
        return;
      }

      // 2. Fallback: search each significant word (≥4 chars) independently and merge results
      const words = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length >= 4);
      if (words.length === 0) {
        // If no significant words exist, nothing useful to search
        setSearchResults([]);
        return;
      }

      const results = await Promise.all(
        words.map(word =>
          (supabase as any).rpc('search_conversations_by_keyword', {
            p_company_id: companyId,
            p_keyword: word
          })
        )
      );

      // Merge deduplicated results (conversation shown once, using first match_content)
      const merged = new Map<string, any>();
      results.forEach(({ data, error }: any) => {
        if (!error && data) {
          normalize(data as any[]).forEach((r: any) => {
            if (!merged.has(r.id)) merged.set(r.id, r);
          });
        }
      });

      setSearchResults(Array.from(merged.values()));
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm, companyId]);

  useEffect(() => {
    loadConversations();
    const filter = companyId ? `company_id=eq.${companyId}` : undefined;
    const channel = supabase
      .channel(`conversations-realtime-${companyId || 'all'}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversations",
        ...(filter ? { filter } : {})
      }, () => loadConversations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, chatFilter, userRole, operatorRoles, userId]);

  // Handle initialConversationId
  useEffect(() => {
    if (initialConversationId && conversations.length > 0) {
      const target = conversations.find(c => c.id === initialConversationId);
      if (target) {
        handleConvSelect(target);
        setChatFilter('all'); // Ensure it's visible
        onConversationOpened?.();
      }
    }
  }, [initialConversationId, conversations]);

  useEffect(() => {
    if (!selectedConv) return;
    loadMessages(selectedConv.id);
    supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedConv.id).then();

    const channel = supabase
      .channel(`messages-${selectedConv.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload) => {
        setMessages((prev) => {
          // Prevent duplicates if multiple events arrive
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new as Message];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    selectedConvRef.current = selectedConv ? selectedConv.id : null;
    if (selectedConv) {
      (async () => {
        const { data: ticketData } = await supabase
          .from("tickets")
          .select("id, customer_rut, customer_name, description, category, assigned_role, status")
          .eq("conversation_id", selectedConv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setActiveTicket(ticketData);
      })();
    } else {
      setActiveTicket(null);
    }
  }, [selectedConv]);

  const loadConversations = async () => {
    let query: any = supabase.from("conversations").select("*");
    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    if (chatFilter === 'closed') {
      query = query.eq("status", "cerrado");
      if (userRole === "operador" && userId) {
        query = query.eq("taken_by", userId);
      }
    } else {
      query = query.neq("status", "cerrado");
      if (userRole === "operador" && userId) {
        let orConditions = [`taken_by.eq.${userId}`];
        if (operatorRoles && operatorRoles.length > 0) {
          orConditions.push(`and(assigned_role.in.(${operatorRoles.join(',')}),taken_by.is.null)`);
        }
        query = query.or(orConditions.join(','));
      }
    }

    const { data } = await query;
    if (data) {
      const enriched = data.map(c => ({
        ...c,
        status: (c as any).status === 'cerrado' ? 'cerrado' : (c.is_agent_active ? 'abierto' : 'en_progreso')
      }));
      setConversations(enriched as unknown as Conversation[]);
      if (selectedConvRef.current) {
        const updated = enriched.find(c => c.id === selectedConvRef.current);
        if (updated) setSelectedConv(updated as unknown as Conversation);
      }
    }
    setLoading(false);
  };

  const loadMessages = async (convId: string) => {
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: true });
    if (data) {
      console.log("[MSG DEBUG] First message fields:", JSON.stringify(data[0], null, 2));
      console.log("[MSG DEBUG] media_url of first msg:", data[0]?.media_url);
      setMessages(data as unknown as Message[]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      if (selectedConv.is_agent_active) {
        await handleToggleBot(false); // Auto intervenir
      }
      const { error } = await supabase.functions.invoke("ycloud-send", {
        body: { 
          to: selectedConv.wa_id, 
          message: newMessage.trim(), 
          conversationId: selectedConv.id,
          senderName: userName
        },
      });
      if (error) throw error;
      setNewMessage("");
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleToggleBot = async (activate: boolean) => {
    if (!selectedConv) return;
    try {
      const action = activate ? 'activate_bot' : 'deactivate_bot';
      const loadingToast = toast({ title: "Procesando...", description: "Actualizando estado del bot en YCloud y sistema local" });

      const { error } = await supabase.functions.invoke("ycloud-toggle-bot", {
        body: { conversationId: selectedConv.id, action },
      });

      if (error) throw error;

      // Forzar la actualización local en la base de datos en caso de que Edge Functions falle silenciosamente
      await supabase.from("conversations").update({ 
        is_agent_active: activate,
        assigned_user_id: activate ? null : userId
      }).eq("id", selectedConv.id);

      toast({ title: activate ? "¡IA Activada!" : "¡Interviniendo!", description: "El estado se ha actualizado con éxito." });
      const newStatus = activate ? 'abierto' : 'en_progreso';
      const updatedConv = { 
        ...selectedConv, 
        is_agent_active: activate, 
        status: newStatus as any,
        assigned_user_id: activate ? null : (userId || selectedConv.assigned_user_id) 
      };
      setSelectedConv(updatedConv);
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? updatedConv : c));
    } catch (err: any) {
      toast({ title: "Error al cambiar estado", description: err.message || "Revisa la consola web para más detalles", variant: "destructive" });
    }
  };

  const handleTakeCase = async () => {
    if (!selectedConv) return;
    const { error } = await supabase
      .from("conversations")
      .update({ taken_by: userId, taken_at: new Date().toISOString() } as any)
      .eq("id", selectedConv.id);
    if (!error) {
      toast({ title: "Caso asignado", description: "Ahora eres el responsable de este ticket." });
      setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, taken_by: userId || null } : c));
      setSelectedConv(prev => prev ? { ...prev, taken_by: userId || null } : null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleTransferChat = async () => {
    if (!selectedConv) return;
    const { error } = await supabase
      .from("conversations")
      .update({ assigned_role: transferRole, taken_by: null, taken_at: null } as any)
      .eq("id", selectedConv.id);
    if (!error) {
      toast({ title: "Caso transferido", description: `Enviado al departamento: ${transferRole}` });
      setIsTransferModalOpen(false);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      setSelectedConv(null);
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCloseChat = async () => {
    if (!selectedConv) return;
    const isCurrentlyClosed = selectedConv.status === 'cerrado';
    
    if (isCurrentlyClosed) {
      // Reabrir chat (comportamiento legacy si ya está cerrado)
      const newStatus = selectedConv.is_agent_active ? 'abierto' : 'en_progreso';
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from("conversations")
        .update({ status: newStatus, closed_at: null } as any)
        .eq("id", selectedConv.id);

      if (!error) {
        toast({ title: "Chat Reabierto" });
        setSelectedConv(null);
        setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      return;
    }

    // Nuevo flujo para cerrar
    setIsCloseModalOpen(true);
    setIsGeneratingSummary(true);
    setCloseSummaryData({ 
      customer_name: activeTicket?.customer_name || selectedConv.profile_name || 'Cliente sin nombre', 
      rut: activeTicket?.customer_rut || 'Sin RUT', 
      summary: '', 
      ticket_id: activeTicket?.id 
    });
    setCloseSummaryText("");

    try {
      const fetchPromise = supabase.functions.invoke("generate-case-summary", {
        body: { conversation_id: selectedConv.id }
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 35000));
      
      const res = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (res.error) throw res.error;
      const data = res.data;
      console.log("[DEBUG Raw Data]", data);
      
      let parsed = data;
      try {
        if (typeof data === "string") {
          parsed = JSON.parse(data);
        }
      } catch (e) {
        console.error("Error parsing JSON string:", e);
      }
      
      if (parsed && !parsed.error) {
        const summaryText = parsed.summary || parsed.data?.summary || "";
        const cName = parsed.customer_name || parsed.data?.customer_name || activeTicket?.customer_name || selectedConv.profile_name || 'Cliente sin nombre';
        const rutVal = parsed.rut || parsed.data?.rut || activeTicket?.customer_rut || 'Sin RUT';
        const tId = parsed.ticket_id || parsed.data?.ticket_id || activeTicket?.id;

        setCloseSummaryData({
          customer_name: cName,
          rut: rutVal,
          summary: summaryText,
          ticket_id: tId
        });
        setCloseSummaryText(summaryText);
      } else {
        throw new Error(parsed?.error || "Error generating summary");
      }
    } catch (err) {
      console.log("Error generating summary:", err);
      toast({ title: "Automático fallido", description: "No se pudo generar el resumen automáticamente — escribe uno manualmente.", variant: "destructive" });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!selectedConv) return;
    const now = new Date().toISOString();
    setSending(true);

    try {
      const tId = closeSummaryData?.ticket_id || activeTicket?.id;
      
      console.log("[DEBUG note insert]", { 
        ticket_id: tId, 
        content: closeSummaryText?.substring(0, 50), 
        author_id: userId,
        tId_type: typeof tId
      });
      
      if (tId && closeSummaryText.trim()) {
        const { error: noteError } = await supabase.from("ticket_notes").insert({
          ticket_id: tId,
          content: closeSummaryText,
          author_id: userId,
          is_internal: false
        });

        console.log("[DEBUG note result]", noteError);

        if (noteError) {
          console.error("[ERROR ticket_notes]", noteError);
        }
      }

      const { error } = await supabase
        .from("conversations")
        .update({ status: 'cerrado', closed_at: now } as any)
        .eq("id", selectedConv.id);

      if (error) throw error;

      if (tId) {
        await supabase.from("tickets")
          .update({ status: 'cerrado', closed_at: now, closed_by: userId })
          .eq("id", tId)
          .eq("status", "abierto");
          
        // Sincronizar memoria del agente en background
        (supabase as any).rpc('sync_ticket_memory', {
          p_conversation_id: selectedConv.id,
          p_ticket_id: tId
        }).then(({ data, error: rpcError }: any) => {
          if (rpcError) console.error('[SyncMemory] Error:', rpcError);
          else console.log('[SyncMemory] Mensajes sincronizados:', data);
        }).catch(console.error);
      }

      // Activar el bot para que maneje la próxima interacción
      await supabase.from("conversations")
        .update({ is_agent_active: true })
        .eq("id", selectedConv.id);

      toast({ title: "Chat Cerrado" });
      setIsCloseModalOpen(false);
      setSelectedConv(null);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
    } catch (err: any) {
      toast({ title: "Error al cerrar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleConvSelect = async (conv: Conversation) => {
    setSelectedConv(conv);
    if (conv.unread_count > 0) {
      // Clear unread count locally and db
      const updatedList = conversations.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c);
      setConversations(updatedList as unknown as Conversation[]);
      setSelectedConv({ ...conv, unread_count: 0 });
      await supabase.from("conversations").update({ unread_count: 0 } as any).eq("id", conv.id);
    }
  };

  const handleDeleteChat = async () => {
    if (!selectedConv) return;
    if (!confirm("Esto eliminará la conversación y sus mensajes. ¿Continuar?")) return;
    try {
      await supabase.from("messages").delete().eq("conversation_id", selectedConv.id);
      await supabase.from("conversations").delete().eq("id", selectedConv.id);
      setSelectedConv(null);
      setConversations(prev => prev.filter(c => c.id !== selectedConv.id));
      toast({ title: "Chat eliminado", description: "Se borró el historial y la conversación." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Filter conversations: merge keyword search hits (which may not be in conversations[] if closed)
  const filtered = (() => {
    let base = [...conversations];
    if (searchTerm.trim() && searchResults.length > 0) {
      searchResults.forEach(sr => {
        // sr.id is already normalized from RPC's conversation_id
        if (!base.find(c => c.id === sr.id)) {
          base.push({
            ...sr,
            status: sr.status || (sr.is_agent_active ? 'abierto' : 'en_progreso')
          } as Conversation);
        }
      });
    }

    return base.map(c => {
      const hit = searchResults.find(sr => sr.id === c.id);
      return hit ? { ...c, match_content: hit.match_content } : c;
    });
  })().filter((c) => {
    // Name/number filter: exact phrase OR significant words (≥4 chars)
    const matchesName = (() => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      // Try full phrase
      if (c.profile_name?.toLowerCase().includes(q) || c.wa_id.includes(q)) return true;
      // Fallback: significant words
      const words = q.split(/\s+/).filter(t => t.length >= 4);
      return words.some(t => c.profile_name?.toLowerCase().includes(t) || c.wa_id.includes(t));
    })();
    const matchesContent = !!c.match_content;
    
    if (!matchesName && !matchesContent) return false;

    // Keyword message matches bypass tab filter
    if (searchTerm.trim() && matchesContent) return true;

    if (chatFilter === 'closed') return c.status === 'cerrado';
    if (c.status === 'cerrado') return false;

    if (chatFilter === 'open') return c.unread_count > 0 || !c.is_agent_active;
    if (chatFilter === 'mine') return c.taken_by === userId;
    if (chatFilter === 'en_progreso') return c.status === 'en_progreso';

    return true;
  }).sort((a, b) => {
    const statusWeight = { abierto: 3, en_progreso: 2, cerrado: 1 };
    const weightA = statusWeight[a.status] || 0;
    const weightB = statusWeight[b.status] || 0;

    if (weightA !== weightB) return weightB - weightA;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });

  const getInitials = (name: string | null, waId: string) =>
    (name || waId).replace("+", "").slice(0, 2).toUpperCase();

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  let curDate = "";
  messages.forEach((msg) => {
    const d = new Date(msg.created_at);
    const key = isToday(d) ? "Hoy" : isYesterday(d) ? "Ayer" : format(d, "dd MMMM yyyy", { locale: es });
    if (key !== curDate) { curDate = key; grouped.push({ date: key, msgs: [] }); }
    grouped[grouped.length - 1].msgs.push(msg);
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv) return;

    setSending(true);
    try {
      const fileExt = file.name.split('.').pop();
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${selectedConv.id}/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('whatsapp_media')
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw new Error("Error al subir archivo: " + uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp_media')
        .getPublicUrl(filePath);

      if (selectedConv.is_agent_active) await handleToggleBot(false);

      // Use the real MIME type from the file for YCloud
      // YCloud requires: 'image', 'video', 'audio', or 'document'
      let ycloudType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) ycloudType = 'image';
      else if (file.type.startsWith('video/')) ycloudType = 'video';
      else if (file.type.startsWith('audio/')) ycloudType = 'audio';

      const { error: sendError } = await supabase.functions.invoke("ycloud-send", {
        body: {
          to: selectedConv.wa_id,
          message: null,               // No text fallback — let YCloud handle it as pure media
          conversationId: selectedConv.id,
          mediaUrl: publicUrl,
          mediaType: ycloudType,
        },
      });
      if (sendError) throw sendError;
      toast({ title: "Archivo Enviado", description: "El adjunto fue entregado al cliente." });
    } catch (err: any) {
      toast({ title: "Error al subir archivo", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-background relative z-10 w-full">
      {/* 1. Sidebar de Chats */}
      <div className={`tour-inbox-sidebar ${selectedConv ? "hidden md:flex" : "flex"} flex-col w-full md:w-[300px] border-r border-border/10 glass flex-shrink-0 z-10`}>
        <div className="p-4 border-b border-border/20 space-y-3 sticky top-0 z-10">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
            <Input
              placeholder="Buscar chats..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 bg-secondary/50 border-border/40 focus-visible:ring-1 text-[13px] rounded-lg shadow-sm"
            />
          </div>
          <div className="flex bg-secondary/40 p-1 rounded-lg border border-border/20">
            <button
              onClick={() => setChatFilter('all')}
              className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${chatFilter === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setChatFilter('open')}
              className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${chatFilter === 'open' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              Abiertos
            </button>
            <button
              onClick={() => setChatFilter('mine')}
              className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${chatFilter === 'mine' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              Míos
            </button>
            <button
              onClick={() => setChatFilter('en_progreso')}
              className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${chatFilter === 'en_progreso' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              Proceso
            </button>
            <button
              onClick={() => setChatFilter('closed')}
              className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all ${chatFilter === 'closed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
            >
              Cerrados
            </button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">Cargando chats...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-[13px]">No se encontraron conversaciones</div>
          ) : filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleConvSelect(conv)}
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-all border-b border-border/5 ${selectedConv?.id === conv.id ? "bg-primary/10 relative" : ""}`}
            >
              {selectedConv?.id === conv.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
              )}
              <div className="relative flex-shrink-0 flex items-center">
                <Avatar className="h-10 w-10 border border-border/50">
                  <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-[11px] font-semibold">
                    {getInitials(conv.profile_name, conv.wa_id)}
                  </AvatarFallback>
                </Avatar>

              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold text-[13px] truncate ${selectedConv?.id === conv.id ? "text-primary" : "text-foreground"} tracking-wide`}>
                    {conv.profile_name || conv.wa_id}
                  </span>
                  <span className={`text-[10px] flex-shrink-0 ml-2 font-medium tracking-wider ${conv.unread_count > 0 ? "text-primary glow-text" : "text-muted-foreground/50"}`}>
                    {conv.last_message_at ? formatConvDate(conv.last_message_at) : ""}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusBadge status={conv.status} />
                    {conv.match_content && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 py-0 bg-primary/10 text-primary border-primary/20 font-bold">
                        en mensaje
                      </Badge>
                    )}
                  </div>
                  <p className={`text-[11px] leading-tight truncate w-full ${conv.unread_count > 0 ? "text-foreground/90 font-medium" : "text-muted-foreground/60 font-light"}`}>
                    {conv.match_content || conv.last_message_preview || "Sin mensajes"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </div>

      {/* 2. Ventana de Conversación */}
      <div className={`tour-inbox-chat ${selectedConv ? "flex" : "hidden md:flex"} flex-col flex-1 bg-background/50 relative overflow-hidden min-h-0`}>
        {/* Background Pattern */}
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-6 relative z-10 bg-grid">
            <div className="absolute inset-0 bg-background/80" />
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-[50px] rounded-full" />
              <div className="w-24 h-24 rounded-[2rem] bg-card/40 border border-primary/20 flex items-center justify-center shadow-2xl relative z-10 glass hover:scale-105 transition-transform duration-500">
                <MessageCircle className="w-10 h-10 text-primary drop-shadow-[0_0_15px_rgba(var(--primary),0.8)]" />
              </div>
            </div>
            <div className="text-center max-w-sm px-6 animate-in fade-in slide-in-from-bottom-4 duration-700 z-10">
              <h2 className="text-2xl tracking-tight font-display font-medium glow-text mb-3">SISTEMA EN ESPERA</h2>
              <p className="text-[14px] text-muted-foreground/80 leading-relaxed mb-8 font-light">
                Seleccione un canal de comunicación en el panel lateral. El Agente IA maneja las peticiones entrantes.
              </p>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col items-center gap-3 p-4 bento-card">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/30 glow-box">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] uppercase font-semibold tracking-widest text-primary/90">AGENTE IA</span>
                </div>
                <div className="flex flex-col items-center gap-3 p-4 bento-card">
                  <div className="w-10 h-10 rounded-xl bg-muted/20 flex items-center justify-center border border-muted-foreground/20">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="text-[10px] uppercase font-semibold tracking-widest text-muted-foreground">ESPECIALISTA</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 h-full min-h-0 relative z-10 bg-background/50">
            {/* Header */}
            <div className="flex justify-between items-center px-6 h-16 border-b border-border/10 glass z-20 flex-shrink-0">
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-2" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-primary/20 shadow-lg glow-box">
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {getInitials(selectedConv.profile_name, selectedConv.wa_id)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-bold text-[14px] tracking-wide text-foreground leading-snug">
                      {selectedConv.profile_name || "Contacto Desconocido"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono font-medium leading-none mb-0.5">
                      {selectedConv.wa_id}
                    </span>
                    <div className="scale-75 origin-left -mt-0.5">
                      <StatusBadge status={selectedConv.status} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseChat}
                  className={`h-8 gap-2 text-[10px] font-bold tracking-widest uppercase border transition-all ${selectedConv.status === 'cerrado' ? 'border-green-500/50 text-green-500 hover:bg-green-500/10' : 'border-red-500/50 text-red-500 hover:bg-red-500/10'}`}
                >
                  <X className="w-3.5 h-3.5" />
                  {selectedConv.status === 'cerrado' ? 'Reabrir Chat' : 'Cerrar Chat'}
                </Button>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 md:px-8 pt-4 pb-0 scroll-smooth">
              <div className="max-w-4xl mx-auto space-y-1 pb-0">
                {grouped.map((group) => (
                  <div key={group.date}>
                    <div className="flex justify-center my-6 sticky top-2 z-10">
                      <span className="text-[10px] font-medium tracking-widest uppercase glass text-muted-foreground px-4 py-1.5 rounded-full shadow-2xl">
                        {group.date}
                      </span>
                    </div>
                    {group.msgs.map((msg, idx) => {
                      const isOut = msg.direction === "outbound";
                      const effectiveSenderName = msg.sender_name || (selectedConv.assigned_user_id === userId ? userName : "Especialista");
                      const badge = isOut ? getSenderBadge(msg.sender_type, effectiveSenderName) : null;

                      // Check if previous message is from same sender to chain bubbles ideally
                      const prevMsg = idx > 0 ? group.msgs[idx - 1] : null;
                      const isChained = prevMsg?.direction === msg.direction && prevMsg?.sender_type === msg.sender_type;

                      return (
                        <div key={msg.id} className={`flex w-full ${isOut ? "justify-end" : "justify-start"} ${isChained ? "mt-0.5" : "mt-2"}`}>
                          <div className={`
                            relative max-w-[85%] md:max-w-[70%] lg:max-w-[60%] w-fit px-4 py-2 hover:brightness-110 transition-all shadow-lg
                            ${isOut ? "rounded-[20px] rounded-br-[4px]" : "rounded-[20px] rounded-tl-[4px]"}
                            ${isChained && isOut ? "!rounded-br-[20px]" : ""}
                            ${isChained && !isOut ? "!rounded-tl-[20px]" : ""}
                            ${isOut
                              ? msg.sender_type === "agent"
                                ? "bg-primary/5 dark:bg-transparent dark:chat-bubble-agent border border-primary/20 text-foreground"
                                : msg.sender_type === "specialist"
                                  ? "bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md border border-indigo-500/30 dark:bg-transparent dark:chat-bubble-specialist dark:border-secondary/20 dark:text-foreground"
                                  : "glass text-foreground bg-primary/10 dark:bg-primary/20"
                              : "bg-white dark:bg-card border border-slate-200 dark:border-white/5 shadow-sm text-foreground"
                            }
                          `}>
                            {badge && !isChained && (
                              <div className={`flex items-center gap-1 mb-1.5 ${isOut ? "opacity-80" : "text-slate-500 dark:text-muted-foreground"}`}>
                                <badge.icon className="w-3 h-3" />
                                <span className="text-[10px] font-medium tracking-wide">{badge.label}</span>
                              </div>
                            )}

                            <MessageMedia message={msg} />

                            {/* En caso de que no haya URL pero sepamos que es multimedia (inbound de YCloud procesando o error) */}
                            {!msg.media_url && (msg.message_type === 'video' || msg.message_type === 'image' || msg.message_type === 'audio' || msg.message_type === 'short_video' || (msg.content && /🎥|📷|🎵|\[video\]|\[image\]/i.test(msg.content))) && (
                              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-2 max-w-[280px]">
                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center animate-pulse shrink-0">
                                  <Clock className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                  <span className="text-[11px] font-bold text-primary italic uppercase tracking-wider truncate">Multimedia en Camino</span>
                                  <span className="text-[9px] text-muted-foreground leading-tight">Autorizando acceso seguro con WhatsApp...</span>
                                </div>
                              </div>
                            )}

                            {/* Mostrar texto solo si no hay multimedia o si el texto no es el placeholder de sistema [Multimedia] */}
                            {msg.content && !msg.media_url && (() => {
                              // 1. Limpieza de etiquetas técnicas [video] y palabras redundantes solas
                              let clean = msg.content.replace(/\[(video|image|audio|document|sticker|short_video)\]/gi, '').trim();

                              // 2. Limpieza de iconos o palabras de sistema si están solas
                              const redundant = ['video', 'audio', 'imagen', 'documento', 'sticker', 'archivo', 'short_video', 'foto', '🎥 video', '🎵 audio', '📷 imagen', '[multimedia]'];
                              const lowerClean = clean.toLowerCase();
                              const isRedundant = ['🎥', '📷', '🎵', '📄', '🏷️', '📍'].includes(clean) || redundant.includes(lowerClean);

                              if (isRedundant) {
                                clean = '';
                              }

                              return clean ? (
                                <div
                                  className="text-[12.5px] whitespace-pre-wrap break-words leading-snug"
                                  dangerouslySetInnerHTML={{ __html: formatWhatsAppText(clean) }}
                                />
                              ) : null;
                            })()}

                            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isOut ? "opacity-70" : "text-slate-500 dark:text-muted-foreground/60"
                              }`}>
                              <span className="text-[9.5px] font-medium tracking-wide">{formatMessageTime(msg.created_at)}</span>
                              {isOut && <StatusIcon status={msg.status} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Wrapper */}
            <div className="p-2 md:px-6 py-2 border-t border-border/5 bg-background/50 backdrop-blur-xl z-20 sticky bottom-0">
              <div className="flex items-end gap-3 max-w-4xl mx-auto relative group">
                <div className="relative flex-1 bg-white/5 border border-white/10 group-focus-within:border-primary/50 group-focus-within:bg-white/10 rounded-full flex items-center shadow-xl transition-all min-h-[48px] px-2">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground shrink-0 rounded-full hover:bg-white/10 hover:text-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                    )}
                  </Button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedConv.is_agent_active ? "Inyectar comando (Pausa IA Automáticamente)..." : "Redactar transmisión de un Especialista..."}
                    className="w-full bg-transparent border-0 focus:ring-0 resize-none py-3.5 px-2 text-[13.5px] tracking-wide placeholder:text-muted-foreground/40 max-h-32 min-h-[48px]"
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="h-10 w-10 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.5)] transition-all disabled:opacity-50 disabled:shadow-none ml-1 mr-1"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Panel Lateral de Gestión */}
      {selectedConv && (
        <div className="tour-inbox-metadata hidden lg:flex flex-col w-[320px] border-l border-border/10 glass flex-shrink-0 overflow-y-auto z-10">
          <div className="p-6 flex flex-col items-center justify-center text-center border-b border-border/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent opacity-50 pointer-events-none" />
            <Avatar className="h-20 w-20 mb-4 shadow-[0_0_30px_rgba(var(--primary),0.2)] ring-1 ring-primary/20 relative z-10 glass">
              <AvatarFallback className="bg-transparent text-primary text-xl font-bold">
                {getInitials(selectedConv.profile_name, selectedConv.wa_id)}
              </AvatarFallback>
            </Avatar>
            <h3 className="font-bold text-[18px] tracking-tight relative z-10">{selectedConv.profile_name || "Contacto Desconocido"}</h3>
            <p className="text-[12px] text-muted-foreground/80 mt-0.5 font-mono font-medium relative z-10">{selectedConv.wa_id}</p>
          </div>

          <div className="p-5 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary" />
                  Telemetría
                </h4>
              </div>
              <div className="bento-card p-4 space-y-4">
                <div className="flex justify-between items-center group">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-2 font-medium">
                    <Clock className="w-3.5 h-3.5 group-hover:text-primary transition-colors" /> Actividad Local
                  </span>
                  <span className="text-[11px] font-bold text-foreground">{selectedConv.last_message_at ? formatConvDate(selectedConv.last_message_at) : 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center group border-t border-white/5 pt-4">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-2 font-medium">
                    <Bot className="w-3.5 h-3.5 group-hover:text-violet-500 transition-colors" /> Sistema Auto-IA
                  </span>
                  <Badge variant="outline" className={`h-5 text-[9px] px-2 font-bold uppercase tracking-widest border-transparent ${selectedConv.is_agent_active ? 'bg-violet-500/20 text-violet-500' : 'bg-secondary text-muted-foreground'}`}>
                    {selectedConv.is_agent_active ? 'ONLINE' : 'OFFLINE'}
                  </Badge>
                </div>
                {selectedConv.unread_count > 0 && (
                  <div className="flex justify-between items-center group border-t border-white/5 pt-4">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-2 font-medium">
                      <Info className="w-3.5 h-3.5 group-hover:text-primary transition-colors" /> Paquetes Pendientes
                    </span>
                    <span className="text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md glow-text">{selectedConv.unread_count}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary" />
                  Ejecución Rápida
                </h4>
              </div>
              <div className="space-y-2.5">
                <Button onClick={() => setIsTicketModalOpen(true)} className="w-full justify-center text-[11px] h-10 gap-2.5 rounded-xl shadow-[0_0_15px_rgba(var(--primary),0.3)] bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wider transition-all hover:scale-[1.02]" variant="default">
                  <Ticket className="w-3.5 h-3.5" /> Escalar a Ticket Central
                </Button>

                <div className="space-y-2.5">
                  {!selectedConv.taken_by && (
                    <Button onClick={handleTakeCase} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 font-bold uppercase tracking-wider" variant="outline">
                      <Hand className="w-3.5 h-3.5" /> Tomar Caso
                    </Button>
                  )}
                  {selectedConv.is_agent_active ? (
                    <Button onClick={() => handleToggleBot(false)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-input bg-background/50 hover:bg-accent hover:text-accent-foreground font-bold uppercase tracking-wider text-foreground shadow-sm transition-all" variant="ghost">
                      <User className="w-3.5 h-3.5" /> Intervenir
                    </Button>
                  ) : (
                    <Button onClick={() => handleToggleBot(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-violet-500/30 text-violet-500 dark:text-violet-400 hover:bg-violet-500/10 font-bold uppercase tracking-wider" variant="outline">
                      <Bot className="w-3.5 h-3.5" /> Activar IA
                    </Button>
                  )}
                  <Button onClick={() => setIsTransferModalOpen(true)} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-blue-500/30 text-blue-500 hover:bg-blue-500/10 font-bold uppercase tracking-wider" variant="outline">
                    <Forward className="w-3.5 h-3.5" /> Transferir Chat
                  </Button>
                  <Button onClick={handleCloseChat} className="w-full justify-center text-[10px] h-9 gap-2 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold uppercase tracking-wider" variant="outline">
                    <XCircle className="w-3.5 h-3.5" /> {selectedConv.status === 'cerrado' ? 'Reabrir Chat' : 'Cerrar Chat'}
                  </Button>
                </div>
              </div>
            </div>

            {activeTicket && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                    Caso Derivado
                  </h4>
                </div>
                <div className="bento-card p-4 space-y-3 border-emerald-500/20 bg-emerald-500/5">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">👤 Cliente</span>
                    <p className="text-[12px] font-medium">{activeTicket.customer_name || 'No especificado'}</p>
                  </div>
                  <div className="space-y-1 border-t border-border/10 pt-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">🪪 RUT</span>
                    <p className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">{activeTicket.customer_rut || 'No especificado'}</p>
                  </div>
                  <div className="space-y-1 border-t border-border/10 pt-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">📋 Motivo</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{activeTicket.description || 'Sin descripción'}</p>
                  </div>
                  <div className="space-y-1 border-t border-border/10 pt-2 grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">🏷️ Categoría</span>
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-600">
                        {{
                          soporte_tecnico: "Soporte Técnico",
                          ventas: "Ventas",
                          pagos: "Pagos",
                          consulta_comercial: "Consulta Comercial"
                        }[activeTicket.category as string] || activeTicket.category || 'General'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">🔵 Estado</span>
                      <Badge variant="default" className="text-[9px] uppercase">{activeTicket.status || 'abierto'}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <CustomerTicketsSearch key={activeTicket?.id || 'empty'} defaultRut={activeTicket?.customer_rut || ""} />

          </div>
        </div>
      )}

      {selectedConv && (
        <CreateTicketDialog
          open={isTicketModalOpen}
          onOpenChange={setIsTicketModalOpen}
          conversation={selectedConv}
        />
      )}

      {selectedConv && (
        <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
          <DialogContent className="border-border/30 bg-card">
            <DialogHeader>
              <DialogTitle>Transferir Conversación</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Select value={transferRole} onValueChange={setTransferRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar sector..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="soporte_tecnico">Soporte Técnico</SelectItem>
                  <SelectItem value="ventas">Ventas</SelectItem>
                  <SelectItem value="pagos">Pagos</SelectItem>
                  <SelectItem value="consulta_comercial">Consulta Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleTransferChat} className="bg-blue-600 hover:bg-blue-700">Transferir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {selectedConv && (
        <Dialog open={isCloseModalOpen} onOpenChange={isGeneratingSummary ? undefined : setIsCloseModalOpen}>
          <DialogContent className="border-border/30 bg-card max-w-md">
            {isGeneratingSummary ? (
              <div className="flex flex-col items-center justify-center p-6 space-y-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <DialogTitle className="text-center text-lg">Generando resumen del caso...</DialogTitle>
                <p className="text-sm text-muted-foreground text-center">Analizando el historial con IA. Esto puede tomar hasta 30 segundos.</p>
              </div>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Gestión del Caso — {closeSummaryData?.customer_name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">RUT Asociado</span>
                    <p className="text-sm font-medium">{closeSummaryData?.rut}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resumen de Cierre</span>
                    <Textarea 
                      value={closeSummaryText}
                      onChange={(e) => setCloseSummaryText(e.target.value)}
                      placeholder="Escribe un resumen o diagnóstico del caso..."
                      className="min-h-[120px] text-sm resize-none"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0 mt-4">
                  <Button variant="outline" onClick={() => setIsCloseModalOpen(false)} disabled={sending}>Cancelar</Button>
                  <Button onClick={handleConfirmClose} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Confirmar y Cerrar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
