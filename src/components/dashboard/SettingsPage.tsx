import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Palette, HelpCircle, Save, Loader2, Minus, Plus, User, Lock, Tag,
  Trash2, Check, GripVertical, PlusCircle, Pencil, X, Bell, Phone, PanelLeft,
  Home, MessageCircle, Ticket, Zap, MapPin, Users, Clock, Wand2,
  FileText, Upload, File, FileSpreadsheet, AlertCircle, Plug, Key, Eye, EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  companyId: string | null;
  userRole: string | null;
  userId: string;
  isSimulating?: boolean;
  tourActive?: boolean;
  onTourComplete?: () => void;
}

type Section = "personalizar" | "tickets" | "cuenta" | "alertas" | "documentos" | "integraciones";

interface CompanySettings {
  delay: number;
  mensajes_separados: boolean;
  mensaje_inicial: string;
  temp_prompt_section: string;
  temp_prompt_expires_at: string | null;
}

interface TicketLabel {
  id: string;
  key: string;
  name: string;
  color: string;
  sort_order: number;
  is_initial?: boolean;
  is_final?: boolean;
}

interface CompanyIntegration {
  id: string;
  service_name: string;
  api_key: string | null;
  api_url: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL_BASE = import.meta.env.VITE_SUPABASE_URL || "https://supabase.artoria.cl";

interface ServiceDef {
  name: string;
  label: string;
  description: string;
  badge?: string;
  needsUrl?: boolean;
  keyPlaceholder?: string;
  urlPlaceholder?: string;
}

interface ServiceCategory {
  key: string;
  label: string;
  icon: string;
  services: ServiceDef[];
}

const SERVICE_CATALOG: ServiceCategory[] = [
  {
    key: "ai_model",
    label: "Modelo de IA",
    icon: "🤖",
    services: [
      {
        name: "gemini_flash",
        label: "Gemini 2.5 Flash",
        description: "Rápido, confiable y muy buenas respuestas. El estándar recomendado.",
        badge: "Recomendado",
        keyPlaceholder: "AIzaSy...",
      },
      {
        name: "deepseek_flash",
        label: "DeepSeek Flash",
        description: "Opción económica con muy buen rendimiento en español.",
        keyPlaceholder: "sk-...",
      },
    ],
  },
  {
    key: "isp_mgmt",
    label: "Sistema de gestión ISP",
    icon: "🌐",
    services: [
      {
        name: "mikrowisp",
        label: "MikroWisp",
        description: "Plataforma de gestión y facturación para ISPs.",
        needsUrl: true,
        keyPlaceholder: "Token de API MikroWisp",
        urlPlaceholder: "https://panel.tuisp.com",
      },
      {
        name: "wisphub",
        label: "WispHub",
        description: "Sistema de gestión ISP en la nube.",
        keyPlaceholder: "Token de API WispHub",
      },
    ],
  },
];

// Mapa plano para display en la lista actual
const ALL_SERVICE_DEFS: Record<string, ServiceDef & { categoryLabel: string }> = {};
SERVICE_CATALOG.forEach(cat =>
  cat.services.forEach(svc => { ALL_SERVICE_DEFS[svc.name] = { ...svc, categoryLabel: cat.label }; })
);
// Servicios de sistema no editables por el usuario
const SYSTEM_SERVICES: Record<string, { label: string; description: string }> = {
  ycloud:      { label: "yCloud", description: "Proveedor de WhatsApp Business API" },
  mercadopago: { label: "MercadoPago", description: "Pasarela de pagos" },
};

const maskKey = (key: string | null): string => {
  if (!key || key.length < 4) return "••••••••";
  return `••••${key.slice(-4)}`;
};

// Valida una API key de Gemini directo desde el browser (CORS habilitado por Google)
async function validateGeminiKey(apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (res.ok) return { valid: true, message: "API key válida ✓" };
    if (res.status === 400) return { valid: false, message: "API key inválida o mal formada" };
    if (res.status === 403) return { valid: false, message: "API key sin permisos para Gemini" };
    return { valid: false, message: `Error HTTP ${res.status}` };
  } catch {
    return { valid: false, message: "No se pudo conectar con Google. Verificá tu conexión." };
  }
}

const DEFAULT_SETTINGS: CompanySettings = {
  delay: 0,
  mensajes_separados: false,
  mensaje_inicial: "Hola soy tu asistente inteligente, ¿En que puedo ayudarte?",
  temp_prompt_section: "",
  temp_prompt_expires_at: null,
};

const PRESET_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#a855f7",
  "#ef4444", "#06b6d4", "#f97316", "#ec4899",
  "#64748b", "#10b981", "#8b5cf6", "#0ea5e9",
];

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-muted-foreground/80 cursor-help transition-colors flex-shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[260px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

export default function SettingsPage({ companyId, userRole, userId, isSimulating = false, tourActive = false, onTourComplete }: Props) {
  const isAdmin = userRole === "administrador" || userRole === "admin";
  const [section, setSection] = useState<Section>(isAdmin ? "personalizar" : "cuenta");
  const [tourStep, setTourStep] = useState(0); // 0 = inactivo
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Apariencia — tamaño de iconos cuando el sidebar está colapsado
  const lsKey = `ui:sidebar-icon-size:${userId}`;
  const [sidebarIconSize, setSidebarIconSize] = useState<number>(() => {
    const saved = localStorage.getItem(`ui:sidebar-icon-size:${userId}`);
    return saved ? parseInt(saved) : 24;
  });

  const handleSidebarIconSizeChange = async (val: number[]) => {
    const s = val[0];
    setSidebarIconSize(s);
    window.dispatchEvent(new CustomEvent("ui:sidebar-icon-size-changed", { detail: String(s) }));
    // En simulación solo actualizamos la vista — no persistimos en cuenta del admin
    if (isSimulating || !userId) return;
    localStorage.setItem(lsKey, String(s));
    const { error } = await (supabase as any).from('user_preferences').upsert({
      user_id: userId,
      key: 'sidebar_icon_size',
      value: String(s),
    }, { onConflict: 'user_id,key' });
    if (error) console.error('[user_preferences] upsert error:', error);
  };

  // Cuenta settings
  const [newPassword, setNewPassword]= useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Ticket labels
  const [ticketLabels, setTicketLabels] = useState<TicketLabel[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#22c55e");
  const [savingLabel, setSavingLabel] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#22c55e");
  const [addingLoading, setAddingLoading] = useState(false);

  // Alert phone numbers
  const [alertPhones, setAlertPhones] = useState<{ id: string; phone: string; label: string; sort_order: number }[]>([]);
  const [alertPhonesLoading, setAlertPhonesLoading] = useState(false);
  const [newPhoneCode,  setNewPhoneCode]  = useState("+56");
  const [newPhone,      setNewPhone]      = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("");
  const [addingPhone,   setAddingPhone]   = useState(false);
  const [savingPhone,   setSavingPhone]   = useState(false);
  // Import from technicians
  const [techPhones,      setTechPhones]      = useState<{ id: string; name: string; phone: string }[]>([]);
  const [loadingTechPhones, setLoadingTechPhones] = useState(false);
  const [showTechImport,  setShowTechImport]  = useState(false);

  const { toast } = useToast();

  // ── Contexto Temporal del Agente ──
  const [tempDuration, setTempDuration] = useState("24");
  const [tempBrief, setTempBrief] = useState("");
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [savingTemp, setSavingTemp] = useState(false);
  const [tempCountdown, setTempCountdown] = useState("");
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Modo de fecha: "duration" (horas/días) o "range" (fecha inicio + fin)
  const [tempDateMode, setTempDateMode] = useState<"duration" | "range">("duration");
  // Fecha inicio y fin en formato datetime-local (YYYY-MM-DDTHH:mm), hora local del usuario
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");
  // Texto generado por IA — editable antes de aplicarlo al campo principal
  const [tempGeneratedText, setTempGeneratedText] = useState("");

  // Formatea una diferencia en ms como "Xd Yh" / "Yh Zmin" / "Zmin"
  const formatDiff = (diffMs: number): string => {
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  };

  // Calcula el string de estado a partir de los timestamps
  const calcCountdown = (startsAt: string | null, expiresAt: string | null): string => {
    if (!expiresAt) return "";
    const now = Date.now();
    const expireMs = new Date(expiresAt).getTime();
    if (expireMs <= now) return "Expirado";

    // Si tiene fecha de inicio y aún no llegó → pendiente
    if (startsAt) {
      const startMs = new Date(startsAt).getTime();
      if (startMs > now) return `Activa en ${formatDiff(startMs - now)}`;
    }

    return `Expira en ${formatDiff(expireMs - now)}`;
  };

  // ¿El contexto está activo AHORA? (inicio ya pasó y no expiró)
  const isTempActive = () => {
    if (!settings.temp_prompt_section?.trim()) return false;
    if (!settings.temp_prompt_expires_at) return false;
    const now = new Date();
    if (new Date(settings.temp_prompt_expires_at) <= now) return false;
    const startsAt = (settings as any).temp_prompt_starts_at;
    if (startsAt && new Date(startsAt) > now) return false; // pendiente, no activo aún
    return true;
  };

  // ¿El contexto está programado pero aún no comenzó?
  const isTempPending = () => {
    if (!settings.temp_prompt_section?.trim()) return false;
    if (!settings.temp_prompt_expires_at) return false;
    const startsAt = (settings as any).temp_prompt_starts_at;
    if (!startsAt) return false;
    return new Date(startsAt) > new Date() && new Date(settings.temp_prompt_expires_at) > new Date();
  };

  // Limpia el contexto temporal en BD y estado local
  const clearTempPromptSilent = useCallback(async (cId: string) => {
    await supabase
      .from("company_config")
      .update({ temp_prompt_section: null, temp_prompt_expires_at: null } as any)
      .eq("id", cId);
    setSettings(s => ({ ...s, temp_prompt_section: "", temp_prompt_expires_at: null }));
    setTempCountdown("");
  }, []);

  // Arranca / detiene el intervalo de countdown según el estado activo
  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    if (!settings.temp_prompt_expires_at || !settings.temp_prompt_section?.trim()) {
      setTempCountdown("");
      return;
    }

    const startsAt: string | null = (settings as any).temp_prompt_starts_at ?? null;

    const tick = () => {
      const now = Date.now();
      const expireMs = new Date(settings.temp_prompt_expires_at!).getTime();
      const startMs = startsAt ? new Date(startsAt).getTime() : null;

      if (expireMs <= now) {
        // Expiró → limpiar
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setTempCountdown("Expirado");
        if (companyId) clearTempPromptSilent(companyId).then(() => {
          toast({ title: "⏰ Contexto temporal expirado", description: "El agente ya no tiene instrucciones temporales activas." });
        });
        return;
      }

      if (startMs && startMs <= now && startsAt) {
        // Acaba de llegar la hora de inicio → notificar (el campo ya está en BD, n8n lo verá)
        // Limpiamos starts_at localmente para que isTempActive() lo refleje
        setSettings(s => ({ ...s, temp_prompt_starts_at: null } as any));
        toast({ title: "🟡 Contexto temporal activado", description: "El agente ya tiene las instrucciones temporales activas." });
      }

      setTempCountdown(calcCountdown(startsAt, settings.temp_prompt_expires_at));
    };

    tick();
    countdownIntervalRef.current = setInterval(tick, 60_000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.temp_prompt_expires_at, (settings as any).temp_prompt_starts_at, settings.temp_prompt_section, companyId, clearTempPromptSilent]);

  // Suscripción Realtime a company_config — sincroniza cambios de otros agentes en tiempo real
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`temp-prompt-${companyId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "company_config",
        filter: `id=eq.${companyId}`,
      }, (payload) => {
        const updated = payload.new as any;
        setSettings(s => ({
          ...s,
          temp_prompt_section: updated.temp_prompt_section ?? "",
          temp_prompt_expires_at: updated.temp_prompt_expires_at ?? null,
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  const activateTempPrompt = async () => {
    if (!companyId || !settings.temp_prompt_section?.trim()) return;

    let expiresAt: string;
    let startsAt: string | null = null;

    if (tempDateMode === "range") {
      if (!tempEndDate) {
        toast({ title: "Falta la fecha de fin", description: "Selecciona una fecha y hora de término.", variant: "destructive" });
        return;
      }
      // datetime-local es hora local del navegador → convertir a UTC
      expiresAt = new Date(tempEndDate).toISOString();
      if (tempStartDate) {
        const startMs = new Date(tempStartDate).getTime();
        if (startMs >= new Date(tempEndDate).getTime()) {
          toast({ title: "Fechas inválidas", description: "La fecha de inicio debe ser anterior a la de fin.", variant: "destructive" });
          return;
        }
        // Solo guardar starts_at si es en el futuro
        if (startMs > Date.now()) {
          startsAt = new Date(tempStartDate).toISOString();
        }
      }
    } else {
      const hours = parseInt(tempDuration);
      expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    setSavingTemp(true);
    const { error } = await supabase
      .from("company_config")
      .update({
        temp_prompt_section: settings.temp_prompt_section,
        temp_prompt_expires_at: expiresAt,
        temp_prompt_starts_at: startsAt,
      } as any)
      .eq("id", companyId);
    setSavingTemp(false);

    if (error) {
      toast({ title: "Error al activar", description: error.message, variant: "destructive" });
    } else {
      setSettings(s => ({ ...s, temp_prompt_expires_at: expiresAt, temp_prompt_starts_at: startsAt } as any));
      const msg = startsAt
        ? `Programado — se activará el ${new Date(startsAt).toLocaleString()}`
        : "El agente ya tiene las instrucciones activas.";
      toast({ title: startsAt ? "⏱ Contexto programado" : "✅ Contexto temporal activado", description: msg });
    }
  };

  const clearTempPrompt = async () => {
    if (!companyId) return;
    const { error } = await clearTempPromptSilent(companyId).then(() => ({ error: null })).catch(e => ({ error: e }));
    if (error) {
      toast({ title: "Error al desactivar", description: String(error), variant: "destructive" });
    } else {
      toast({ title: "Contexto temporal desactivado" });
    }
  };

  const generateWithAI = async () => {
    if (!tempBrief.trim() || !companyId) return;
    setGeneratingPrompt(true);
    setTempGeneratedText(""); // limpiar resultado anterior
    try {
      const res = await fetch("https://bot.artoria.cl/webhook/contexto_temporal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: tempBrief.trim(), company_id: companyId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // El webhook de n8n devuelve array: [{ output: "..." }]
      // Soportamos también objeto directo por si cambia en el futuro
      const item = Array.isArray(data) ? data[0] : data;
      const generated = item?.output ?? item?.generated_text ?? item?.text ?? item?.result;
      if (!generated || typeof generated !== "string") throw new Error("Respuesta vacía del webhook");

      setTempGeneratedText(generated.trim());
    } catch (err: any) {
      toast({ title: "No se pudo generar el texto", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const applyGeneratedText = () => {
    if (!tempGeneratedText.trim()) return;
    setSettings(s => ({ ...s, temp_prompt_section: tempGeneratedText.trim() }));
    setTempGeneratedText("");
    setTempBrief("");
    setShowAiHelper(false);
    toast({ title: "✅ Texto aplicado", description: "Revisalo y ajústalo si es necesario antes de activar." });
  };

  useEffect(() => {
    if (isAdmin && companyId) loadSettings();
    else setLoading(false);
  }, [companyId, isAdmin]);

  // ── Arrancar el tour cuando tourActive cambia a true ─────────────────────
  useEffect(() => {
    if (!tourActive) return;
    // Asegurar que estamos en la sección correcta
    setSection("personalizar");
    // Pequeño delay para que el DOM se renderice antes de iniciar
    const t = setTimeout(() => {
      setTourStep(1);
      // Scroll al área del contexto temporal
      const el = document.querySelector("[data-tour='temp-prompt-section']");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(t);
  }, [tourActive]);

  useEffect(() => {
    if (section === "tickets" && isAdmin && companyId) loadLabels();
  }, [section, companyId, isAdmin]);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_config")
      .select("delay, mensajes_separados, mensaje_inicial, temp_prompt_section, temp_prompt_expires_at")
      .eq("id", companyId!)
      .single();
    if (data) {
      setSettings({
        delay: data.delay ?? DEFAULT_SETTINGS.delay,
        mensajes_separados: data.mensajes_separados ?? DEFAULT_SETTINGS.mensajes_separados,
        mensaje_inicial: data.mensaje_inicial ?? DEFAULT_SETTINGS.mensaje_inicial,
        temp_prompt_section: (data as any).temp_prompt_section ?? "",
        temp_prompt_expires_at: (data as any).temp_prompt_expires_at ?? null,
      });
    }
    setLoading(false);
  };

  const loadLabels = async () => {
    setLabelsLoading(true);
    const { data } = await (supabase as any)
      .from("ticket_labels")
      .select("id, key, label, color, sort_order, is_initial, is_final")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true });
    if (data) setTicketLabels(data.map((r: any) => ({ ...r, name: r.label, is_initial: r.is_initial, is_final: r.is_final })) as TicketLabel[]);
    setLabelsLoading(false);
  };

  const saveSettings = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await supabase
      .from("company_config")
      .update({
        delay: settings.delay,
        mensajes_separados: settings.mensajes_separados,
        mensaje_inicial: settings.mensaje_inicial,
      } as any)
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Configuración guardada" });
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      toast({ title: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) {
      toast({ title: "Error al cambiar contraseña", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Contraseña actualizada" });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const startEdit = (label: TicketLabel) => {
    setEditingId(label.id);
    setEditName(label.name);
    setEditColor(label.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("#22c55e");
  };

  const saveEdit = async (label: TicketLabel) => {
    if (!editName.trim()) return;
    setSavingLabel(true);
    const { error } = await (supabase as any)
      .from("ticket_labels")
      .update({ label: editName.trim(), color: editColor })
      .eq("id", label.id);
    setSavingLabel(false);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
      setTicketLabels(prev => prev.map(l => l.id === label.id ? { ...l, name: editName.trim(), color: editColor } : l));
      cancelEdit();
      toast({ title: "Etiqueta actualizada" });
    }
  };

  const deleteLabel = async (label: TicketLabel) => {
    if (label.is_initial || label.is_final) {
      toast({ title: "No se puede eliminar", description: "Las etiquetas de inicio y cierre no pueden eliminarse, solo editarse.", variant: "destructive" });
      return;
    }
    const { error } = await (supabase as any)
      .from("ticket_labels")
      .delete()
      .eq("id", label.id);
    if (error) {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    } else {
      setTicketLabels(prev => prev.filter(l => l.id !== label.id));
      toast({ title: "Etiqueta eliminada" });
    }
  };

  const addLabel = async () => {
    if (!newName.trim() || !companyId) return;
    setAddingLoading(true);
    const key = slugify(newName);
    const maxOrder = ticketLabels.length > 0 ? Math.max(...ticketLabels.map(l => l.sort_order)) : 0;
    const { data, error } = await (supabase as any)
      .from("ticket_labels")
      .insert({ company_id: companyId, key, label: newName.trim(), color: newColor, sort_order: maxOrder + 1 })
      .select()
      .single();
    setAddingLoading(false);
    if (error) {
      toast({ title: "Error al crear etiqueta", description: error.message, variant: "destructive" });
    } else {
      setTicketLabels(prev => [...prev, { ...data, name: data.label } as TicketLabel]);
      setNewName("");
      setNewColor("#22c55e");
      setAddingNew(false);
      toast({ title: "✅ Etiqueta creada" });
    }
  };

  useEffect(() => {
    if (section === "alertas" && isAdmin && companyId) loadAlertPhones();
  }, [section, companyId, isAdmin]);

  const loadAlertPhones = async () => {
    setAlertPhonesLoading(true);
    const { data } = await (supabase as any)
      .from("alert_phone_numbers")
      .select("id, phone, label, sort_order")
      .eq("company_id", companyId)
      .order("sort_order");
    setAlertPhones(data ?? []);
    setAlertPhonesLoading(false);
  };

  const addAlertPhone = async (overridePhone?: string, overrideLabel?: string) => {
    const rawNumber = overridePhone ?? newPhone.trim();
    if (!rawNumber || !companyId) return;
    // If it's a manual entry, prepend the selected country code
    const fullPhone = overridePhone
      ? rawNumber
      : `${newPhoneCode}${rawNumber.replace(/^0+/, '')}`;
    setSavingPhone(true);
    const { error } = await (supabase as any).rpc("add_alert_phone", {
      p_company_id: companyId,
      p_phone: fullPhone,
      p_label: (overrideLabel ?? newPhoneLabel.trim()) || null,
    });
    setSavingPhone(false);
    if (error) {
      if (error.message?.includes("5") || error.message?.includes("Máximo")) {
        toast({ title: "Máximo 5 números permitidos", variant: "destructive" });
      } else {
        toast({ title: "Error al agregar", description: error.message, variant: "destructive" });
      }
    } else {
      if (!overridePhone) {
        setNewPhone("");
        setNewPhoneLabel("");
        setAddingPhone(false);
      }
      await loadAlertPhones();
      toast({ title: "✅ Número agregado" });
    }
  };

  const loadTechPhones = async () => {
    if (!companyId) return;
    setLoadingTechPhones(true);
    const { data } = await (supabase as any)
      .from('technicians')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .not('phone', 'is', null)
      .order('name');
    setTechPhones((data ?? []).filter((t: any) => t.phone?.trim()));
    setLoadingTechPhones(false);
    setShowTechImport(true);
  };

  const deleteAlertPhone = async (id: string) => {
    const { error } = await (supabase as any)
      .from("alert_phone_numbers")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    } else {
      setAlertPhones(prev => prev.filter(p => p.id !== id));
      toast({ title: "Número eliminado" });
    }
  };

  // ── Integraciones ────────────────────────────────────────────────────────
  const [integrations, setIntegrations] = useState<CompanyIntegration[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);
  const [intFormKey, setIntFormKey] = useState("");
  const [intFormUrl, setIntFormUrl] = useState("");
  const [intFormMeta, setIntFormMeta] = useState("");
  const [intFormMetaError, setIntFormMetaError] = useState("");
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  // Wizard "agregar integración"
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCategory, setWizardCategory] = useState<string | null>(null);
  const [wizardService, setWizardService] = useState<ServiceDef | null>(null);
  const [wizardKey, setWizardKey] = useState("");
  const [wizardUrl, setWizardUrl] = useState("");
  const [wizardValidation, setWizardValidation] = useState<{ status: "idle" | "loading" | "ok" | "error"; message: string }>({ status: "idle", message: "" });
  const [savingWizard, setSavingWizard] = useState(false);

  const getServiceKey = async (): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("get-service-key");
    if (error || !data?.service_key) return null;
    return data.service_key as string;
  };

  const loadIntegrations = async () => {
    if (!companyId) return;
    setIntegrationsLoading(true);
    const serviceKey = await getServiceKey();
    if (!serviceKey) {
      toast({ title: "Error de acceso a integraciones", variant: "destructive" });
      setIntegrationsLoading(false);
      return;
    }
    const res = await fetch(
      `${SUPABASE_URL_BASE}/rest/v1/company_integrations?company_id=eq.${companyId}&select=*&order=created_at.asc`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    const data = await res.json();
    setIntegrations(Array.isArray(data) ? data : []);
    setIntegrationsLoading(false);
  };

  const startEditIntegration = (integration: CompanyIntegration) => {
    setEditingIntegration(integration.id);
    setIntFormKey("");
    setIntFormUrl(integration.api_url ?? "");
    setIntFormMeta(integration.metadata ? JSON.stringify(integration.metadata, null, 2) : "");
    setIntFormMetaError("");
  };

  const cancelEditIntegration = () => {
    setEditingIntegration(null);
    setIntFormKey("");
    setIntFormUrl("");
    setIntFormMeta("");
    setIntFormMetaError("");
  };

  const saveIntegrationEdit = async (integration: CompanyIntegration) => {
    let parsedMeta: Record<string, any> | null = integration.metadata;
    if (intFormMeta.trim()) {
      try { parsedMeta = JSON.parse(intFormMeta); setIntFormMetaError(""); }
      catch { setIntFormMetaError("JSON inválido"); return; }
    } else {
      parsedMeta = null;
    }

    setSavingIntegration(true);
    const serviceKey = await getServiceKey();
    if (!serviceKey) { setSavingIntegration(false); return; }

    const body: Record<string, any> = { api_url: intFormUrl.trim() || null, metadata: parsedMeta };
    if (intFormKey.trim()) body.api_key = intFormKey.trim();

    const res = await fetch(
      `${SUPABASE_URL_BASE}/rest/v1/company_integrations?id=eq.${integration.id}&company_id=eq.${companyId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
      }
    );
    setSavingIntegration(false);
    if (!res.ok) {
      toast({ title: "Error al guardar", description: `HTTP ${res.status}`, variant: "destructive" });
    } else {
      toast({ title: "✅ Integración actualizada" });
      cancelEditIntegration();
      await loadIntegrations();
    }
  };

  const resetWizard = () => {
    setWizardOpen(false);
    setWizardCategory(null);
    setWizardService(null);
    setWizardKey("");
    setWizardUrl("");
    setWizardValidation({ status: "idle", message: "" });
  };

  const validateWizardKey = async () => {
    if (!wizardService || !wizardKey.trim()) return;
    setWizardValidation({ status: "loading", message: "Verificando..." });

    if (wizardService.name === "gemini_flash") {
      const result = await validateGeminiKey(wizardKey.trim());
      setWizardValidation({ status: result.valid ? "ok" : "error", message: result.message });
      return;
    }

    // Para otros servicios: edge function validate-integration (sin auth requerida)
    try {
      const res = await fetch(`${SUPABASE_URL_BASE}/functions/v1/validate-integration`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({
          service_name: wizardService.name,
          api_key: wizardKey.trim(),
          ...(wizardService.needsUrl && wizardUrl.trim() ? { api_url: wizardUrl.trim() } : {}),
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (data?.valid) {
        setWizardValidation({ status: "ok", message: data.message ?? "API key válida ✓" });
      } else {
        setWizardValidation({ status: "error", message: data?.message ?? "API key inválida" });
      }
    } catch {
      setWizardValidation({ status: "error", message: "No se pudo conectar con el servicio de validación" });
    }
  };

  const saveWizardIntegration = async () => {
    if (!wizardService || !wizardKey.trim() || !companyId) return;
    setSavingWizard(true);
    const serviceKey = await getServiceKey();
    if (!serviceKey) { setSavingWizard(false); return; }

    const body = {
      company_id: companyId,
      service_name: wizardService.name,
      api_key: wizardKey.trim(),
      api_url: wizardUrl.trim() || null,
      metadata: null,
    };

    const res = await fetch(`${SUPABASE_URL_BASE}/rest/v1/company_integrations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    });
    setSavingWizard(false);
    if (!res.ok) {
      toast({ title: "Error al guardar", description: `HTTP ${res.status}`, variant: "destructive" });
    } else {
      toast({ title: `✅ ${wizardService.label} conectada` });
      resetWizard();
      await loadIntegrations();
    }
  };

  useEffect(() => {
    if (section === "integraciones" && isAdmin && companyId) loadIntegrations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, companyId, isAdmin]);

  // ── Documentos RAG ───────────────────────────────────────────────────────
  interface CompanyDocument {
    id: string;
    name: string;
    storage_path: string;
    file_type: string;
    size_bytes: number;
    created_at: string;
    description?: string | null;
  }

  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_TYPES: Record<string, string> = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
  };
  const MAX_SIZE_MB = 20;

  const loadDocuments = async () => {
    if (!companyId) return;
    setLoadingDocs(true);
    const { data, error } = await (supabase as any)
      .from("company_documents")
      .select("id, name, storage_path, file_type, size_bytes, created_at, description")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setLoadingDocs(false);
    if (!error && data) setDocuments(data);
  };

  useEffect(() => {
    if (section === "documentos" && isAdmin && companyId) loadDocuments();
  }, [section, companyId, isAdmin]);

  // Valida formato y tamaño, luego sube directamente con descripción fija
  const handleFilePicked = (file: File) => {
    const mimeType = file.type || "";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = ALLOWED_TYPES[mimeType] ?? ext;
    if (!Object.values(ALLOWED_TYPES).includes(fileType)) {
      toast({ title: "Formato no soportado", description: "Subí PDF, TXT, CSV o Excel. Si tenés Word, exportalo como PDF primero.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: `El límite es ${MAX_SIZE_MB} MB.`, variant: "destructive" });
      return;
    }
    handleFileUpload(file, "Grilla de canales");
  };

  const handleFileUpload = async (file: File, description: string) => {
    if (!companyId) return;

    const mimeType = file.type || "";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileType = ALLOWED_TYPES[mimeType] ?? ext;

    setPendingFile(null);
    setFileDescription("");
    setUploadingFile(true);
    setUploadProgress(10);

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${companyId}/${timestamp}_${safeName}`;

    // 1. Subir al bucket
    const { error: storageError } = await (supabase as any).storage
      .from("company-documents")
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });

    setUploadProgress(70);

    if (storageError) {
      setUploadingFile(false);
      setUploadProgress(0);
      toast({ title: "Error al subir", description: storageError.message, variant: "destructive" });
      return;
    }

    // 2. Guardar metadata en la tabla
    const { data: docData, error: dbError } = await (supabase as any)
      .from("company_documents")
      .insert({
        company_id: companyId,
        name: file.name,
        storage_path: storagePath,
        file_type: fileType,
        size_bytes: file.size,
        created_by: userId,
        description: description.trim() || null,
      })
      .select("id")
      .single();

    setUploadProgress(100);
    setUploadingFile(false);
    setUploadProgress(0);

    if (dbError) {
      toast({ title: "Error al registrar", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Archivo subido", description: `${file.name} está siendo procesado por el agente IA.` });
      loadDocuments();

      // 3. Notificar a n8n para chunking + embeddings (fire & forget)
      fetch("https://bot.artoria.cl/webhook/rag_artoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          document_id: docData?.id ?? null,
          storage_path: storagePath,
          file_type: fileType,
          name: file.name,
          description: description.trim() || null,
        }),
      }).catch(err => console.warn("[RAG webhook] Error al notificar a n8n:", err));
    }
  };

  const handleDeleteDocument = async (doc: CompanyDocument) => {
    if (!confirm(`¿Eliminar "${doc.name}"? Esta acción no se puede deshacer.`)) return;

    // 1. Borrar del storage
    await (supabase as any).storage.from("company-documents").remove([doc.storage_path]);

    // 2. Borrar el registro de la tabla — el CASCADE elimina los chunks automáticamente
    const { error } = await (supabase as any)
      .from("company_documents")
      .delete()
      .eq("id", doc.id)
      .eq("company_id", companyId); // doble filtro por seguridad

    if (error) {
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Documento eliminado", description: "Los chunks del agente IA también fueron limpiados." });
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    }
  };

  // Elimina el archivo actual silenciosamente y abre el selector para subir uno nuevo
  const handleReplaceDocument = async (doc: CompanyDocument) => {
    await (supabase as any).storage.from("company-documents").remove([doc.storage_path]);
    await (supabase as any).from("company_documents").delete().eq("id", doc.id).eq("company_id", companyId);
    setDocuments([]);
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const docIcon = (type: string) => {
    if (["xlsx", "xls", "csv"].includes(type)) return FileSpreadsheet;
    if (["pdf"].includes(type)) return FileText;
    return File;
  };

  const docColor = (type: string) => {
    if (["pdf"].includes(type)) return "text-red-500 bg-red-500/10";
    if (["xlsx", "xls"].includes(type)) return "text-emerald-500 bg-emerald-500/10";
    if (["csv"].includes(type)) return "text-emerald-600 bg-emerald-600/10";
    if (["docx", "doc"].includes(type)) return "text-blue-500 bg-blue-500/10";
    return "text-muted-foreground bg-muted/30";
  };

  const navItems: { id: Section; label: string; icon: any; adminOnly: boolean }[] = [
    { id: "personalizar", label: "Personalizar", icon: Palette, adminOnly: true },
    { id: "tickets", label: "Etiquetas", icon: Tag, adminOnly: true },
    { id: "alertas", label: "Alertas", icon: Bell, adminOnly: true },
    { id: "documentos", label: "Grilla de Canales", icon: FileSpreadsheet, adminOnly: true },
    { id: "integraciones", label: "Integraciones", icon: Plug, adminOnly: true },
    { id: "cuenta", label: "Mi Cuenta", icon: User, adminOnly: false },
  ];

  const visibleNav = navItems.filter(n => !n.adminOnly || isAdmin);

  return (
    <>
    <div className="flex h-full min-h-[600px] gap-0">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-border/20 bg-card/30 p-4 flex flex-col gap-1">
        <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/50 mb-3 px-2">
          Configuración
        </p>
        {visibleNav.map(item => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 w-full text-left
              ${section === item.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
              }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </button>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">

        {/* ── PERSONALIZAR ── */}
        {section === "personalizar" && isAdmin && (
          <motion.div
            key="personalizar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl space-y-8"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight">Personalizar</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ajusta el comportamiento del agente IA para tu empresa.
              </p>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-8">
                {/* Delay */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Delay de respuesta</Label>
                    <HelpTip text="Sirve para esperar que el cliente envíe varios mensajes y responderlos todos en 1 sola ejecución (respuesta) en vez de 1 mensaje a la vez. Útil cuando los clientes suelen escribir en varios mensajes cortos." />
                  </div>

                  <div className="flex items-center gap-4">
                    <button
                      className="w-8 h-8 rounded-lg border border-border/40 bg-secondary/30 flex items-center justify-center hover:bg-secondary/60 transition-colors disabled:opacity-40"
                      onClick={() => setSettings(s => ({ ...s, delay: Math.max(0, s.delay - 1) }))}
                      disabled={settings.delay <= 0}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex-1">
                      <Slider
                        min={0}
                        max={60}
                        step={1}
                        value={[settings.delay]}
                        onValueChange={([v]) => setSettings(s => ({ ...s, delay: v }))}
                        className="w-full"
                      />
                    </div>

                    <button
                      className="w-8 h-8 rounded-lg border border-border/40 bg-secondary/30 flex items-center justify-center hover:bg-secondary/60 transition-colors disabled:opacity-40"
                      onClick={() => setSettings(s => ({ ...s, delay: Math.min(60, s.delay + 1) }))}
                      disabled={settings.delay >= 60}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-16 text-center">
                      <span className="text-2xl font-black text-primary font-display">{settings.delay}</span>
                      <span className="text-xs text-muted-foreground ml-1">seg</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground/60 italic">
                    0 = responde inmediatamente. Máximo 60 segundos.
                  </p>
                </div>

                {/* Mensajes separados */}
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/20 bg-card/40">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="mensajes-sep" className="text-sm font-semibold cursor-pointer">
                        Mensajes separados
                      </Label>
                      <HelpTip text="Cuando está activado, el agente IA puede dividir su respuesta en múltiples mensajes de WhatsApp en vez de uno solo largo. Hace la conversación más natural." />
                    </div>
                    <p className="text-xs text-muted-foreground/70">
                      El agente envía respuestas divididas en varios mensajes
                    </p>
                  </div>
                  <Switch
                    id="mensajes-sep"
                    checked={settings.mensajes_separados}
                    onCheckedChange={v => setSettings(s => ({ ...s, mensajes_separados: v }))}
                  />
                </div>

                {/* Mensaje inicial */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Mensaje inicial</Label>
                    <HelpTip text="Es el primer mensaje que el agente IA envía cuando un cliente inicia una conversación por primera vez. Debe ser un saludo amigable que indique al cliente cómo puede ayudarlo." />
                  </div>
                  <Textarea
                    value={settings.mensaje_inicial}
                    onChange={e => setSettings(s => ({ ...s, mensaje_inicial: e.target.value }))}
                    rows={7}
                    className="resize-y text-sm bg-muted/10 border-border/20 focus:border-primary/50 rounded-xl min-h-[140px]"
                    placeholder="Ej: Hola soy tu asistente inteligente, ¿En que puedo ayudarte?"
                  />
                  <p className="text-[11px] text-muted-foreground/60 text-right">
                    {settings.mensaje_inicial.length} caracteres
                  </p>
                </div>

                {/* ── Contexto Temporal del Agente ── */}
                <div data-tour="temp-prompt-section" className={`space-y-3 rounded-xl border p-4 transition-colors ${isTempActive() ? "border-amber-500/40 bg-amber-500/5" : "border-border/20 bg-card/40"} ${tourStep >= 1 && tourStep <= 5 ? "ring-2 ring-amber-500/60 ring-offset-2 ring-offset-background" : ""}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label className="text-sm font-semibold">Contexto Temporal del Agente</Label>
                          <HelpTip text="Información o instrucciones que el agente IA tendrá en cuenta solo durante el período que definas. Útil para feriados, promociones, cambios temporales de horario u otros avisos con fecha límite." />
                          {isTempActive() && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                              ● ACTIVO
                            </span>
                          )}
                          {isTempPending() && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/15 text-blue-500 uppercase tracking-wider">
                              ⏱ PROGRAMADO
                            </span>
                          )}
                          {settings.temp_prompt_section && !isTempActive() && !isTempPending() && settings.temp_prompt_expires_at && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-muted/40 text-muted-foreground uppercase tracking-wider">
                              EXPIRADO
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/70">
                          Como una historia de Instagram — expira automáticamente cuando se acaba el tiempo.
                        </p>
                      </div>
                    </div>
                    {isTempActive() && tempCountdown && (
                      <span className="text-[11px] text-amber-500/80 font-medium whitespace-nowrap flex-shrink-0">
                        {tempCountdown}
                      </span>
                    )}
                  </div>

                  {/* Textarea principal */}
                  <Textarea
                    value={settings.temp_prompt_section}
                    onChange={e => setSettings(s => ({ ...s, temp_prompt_section: e.target.value }))}
                    rows={5}
                    className="resize-y text-sm bg-muted/10 border-border/20 focus:border-amber-500/50 rounded-xl min-h-[100px]"
                    placeholder={'Ej: "Esta semana hay una promoción especial en el plan 100MB a $12.990/mes. El feriado del lunes la oficina estará cerrada. Ofrece esta promoción a clientes que pregunten por planes."'}
                  />
                  <p className="text-[11px] text-muted-foreground/50 text-right">
                    {(settings.temp_prompt_section || "").length} caracteres
                  </p>

                  {/* Asistente IA */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAiHelper(v => !v)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-primary/60 hover:text-primary transition-colors"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {showAiHelper ? "Ocultar asistente" : "✨ Ayudarme a redactar con IA"}
                    </button>
                    <AnimatePresence>
                      {showAiHelper && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2.5 space-y-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                            {/* ── Paso 1: Brief ── */}
                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                                1. Describí brevemente qué querés informar
                              </p>
                              <Textarea
                                value={tempBrief}
                                onChange={e => setTempBrief(e.target.value)}
                                rows={2}
                                className="text-sm bg-background/60 border-border/20 rounded-xl"
                                placeholder='Ej: "feriado el lunes, no hay atención" o "promoción 50% en plan fibra esta semana"'
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={generateWithAI}
                                disabled={generatingPrompt || !tempBrief.trim()}
                                className="gap-2 text-xs border-primary/30 text-primary hover:bg-primary/10"
                              >
                                {generatingPrompt
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Wand2 className="w-3.5 h-3.5" />}
                                {generatingPrompt ? "La IA está redactando..." : "Generar texto con IA"}
                              </Button>
                            </div>

                            {/* ── Paso 2: Resultado editable (aparece cuando llega la respuesta) ── */}
                            <AnimatePresence>
                              {tempGeneratedText && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 6 }}
                                  className="space-y-2 pt-2 border-t border-primary/10"
                                >
                                  <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                                    2. Revisá y editá el texto generado
                                  </p>
                                  <Textarea
                                    value={tempGeneratedText}
                                    onChange={e => setTempGeneratedText(e.target.value)}
                                    rows={5}
                                    className="text-sm bg-background border-primary/20 rounded-xl focus-visible:ring-primary/30"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={applyGeneratedText}
                                      className="gap-2 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Usar este texto
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setTempGeneratedText("")}
                                      className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      Descartar
                                    </Button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Selector de modo: Duración vs Fecha específica */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/40 border border-border/20 w-fit">
                    <button
                      onClick={() => setTempDateMode("duration")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tempDateMode === "duration" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Por duración
                    </button>
                    <button
                      onClick={() => setTempDateMode("range")}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${tempDateMode === "range" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Fecha específica
                    </button>
                  </div>

                  {/* Controles según modo */}
                  <div className="flex items-end gap-2 flex-wrap pt-1">
                    {tempDateMode === "duration" ? (
                      <Select value={tempDuration} onValueChange={setTempDuration}>
                        <SelectTrigger className="w-32 h-8 text-xs border-border/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 hora</SelectItem>
                          <SelectItem value="4">4 horas</SelectItem>
                          <SelectItem value="8">8 horas</SelectItem>
                          <SelectItem value="24">1 día</SelectItem>
                          <SelectItem value="48">2 días</SelectItem>
                          <SelectItem value="168">7 días</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-10 shrink-0">Inicio</span>
                          <input
                            type="datetime-local"
                            value={tempStartDate}
                            onChange={e => setTempStartDate(e.target.value)}
                            className="h-8 text-xs px-2 rounded-md border border-border/30 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <span className="text-[10px] text-muted-foreground">(opcional)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-10 shrink-0">Fin</span>
                          <input
                            type="datetime-local"
                            value={tempEndDate}
                            onChange={e => setTempEndDate(e.target.value)}
                            className="h-8 text-xs px-2 rounded-md border border-border/30 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          />
                        </div>
                      </div>
                    )}

                    <Button
                      size="sm"
                      onClick={activateTempPrompt}
                      disabled={savingTemp || !settings.temp_prompt_section?.trim()}
                      className="gap-2 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {savingTemp
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Clock className="w-3.5 h-3.5" />}
                      {isTempActive() ? "Reactivar" : isTempPending() ? "Reprogramar" : "Activar"}
                    </Button>
                    {(isTempActive() || isTempPending() || (settings.temp_prompt_expires_at != null)) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearTempPrompt}
                        className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    )}
                  </div>
                </div>

                {/* Save */}
                <Button onClick={saveSettings} disabled={saving} className="gap-2 w-full sm:w-auto">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar cambios
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── ETIQUETAS DE TICKETS ── */}
        {section === "tickets" && isAdmin && (
          <motion.div
            key="tickets"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight">Etiquetas de Tickets</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Define los estados personalizados para los tickets de soporte de tu empresa.
              </p>
            </div>

            {labelsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {ticketLabels.map(label => (
                    <motion.div
                      key={label.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-border/20 bg-card/40 group hover:border-border/50 transition-all"
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />

                      {editingId === label.id ? (
                        /* ── Edit mode ── */
                        <>
                          <div className="flex items-center gap-2 flex-1">
                            {/* Color picker */}
                            <div className="relative">
                              <input
                                type="color"
                                value={editColor}
                                onChange={e => setEditColor(e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                              <div className="w-7 h-7 rounded-lg border-2 border-border/30 cursor-pointer shadow-sm" style={{ backgroundColor: editColor }} />
                            </div>

                            {/* Preset colors */}
                            <div className="flex gap-1 flex-wrap max-w-[160px]">
                              {PRESET_COLORS.slice(0, 8).map(c => (
                                <button
                                  key={c}
                                  onClick={() => setEditColor(c)}
                                  className={`w-4 h-4 rounded-full border-2 transition-all ${editColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>

                            <Input
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="h-8 text-sm flex-1"
                              placeholder="Nombre de la etiqueta"
                              onKeyDown={e => { if (e.key === "Enter") saveEdit(label); if (e.key === "Escape") cancelEdit(); }}
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={() => saveEdit(label)}
                            disabled={savingLabel}
                            className="w-7 h-7 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors"
                          >
                            {savingLabel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="w-7 h-7 rounded-lg bg-secondary/60 text-muted-foreground hover:bg-secondary flex items-center justify-center transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        /* ── View mode ── */
                        <>
                          <div className="w-6 h-6 rounded-lg flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium">{label.name}</span>
                              {label.is_initial && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">INICIO</span>
                              )}
                              {label.is_final && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-400 uppercase tracking-wider">CIERRE</span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">{label.key}</span>
                          </div>

                          {/* Preview pill */}
                          <span
                            className="hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                            style={{ color: label.color, borderColor: label.color + "40", backgroundColor: label.color + "15" }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                            {label.name}
                          </span>

                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(label)}
                              className="w-7 h-7 rounded-lg bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteLabel(label)}
                              disabled={!!(label.is_initial || label.is_final)}
                              className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              title={label.is_initial || label.is_final ? "No se puede eliminar la etiqueta de inicio o cierre" : undefined}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Add new label */}
                <AnimatePresence>
                  {addingNew ? (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {/* Color picker */}
                        <div className="relative">
                          <input
                            type="color"
                            value={newColor}
                            onChange={e => setNewColor(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          />
                          <div className="w-7 h-7 rounded-lg border-2 border-primary/30 cursor-pointer shadow-sm" style={{ backgroundColor: newColor }} />
                        </div>

                        {/* Preset colors */}
                        <div className="flex gap-1 flex-wrap max-w-[160px]">
                          {PRESET_COLORS.slice(0, 8).map(c => (
                            <button
                              key={c}
                              onClick={() => setNewColor(c)}
                              className={`w-4 h-4 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>

                        <Input
                          value={newName}
                          onChange={e => setNewName(e.target.value)}
                          className="h-8 text-sm flex-1"
                          placeholder="Nombre de la etiqueta..."
                          onKeyDown={e => { if (e.key === "Enter") addLabel(); if (e.key === "Escape") { setAddingNew(false); setNewName(""); } }}
                          autoFocus
                        />
                      </div>
                      <button
                        onClick={addLabel}
                        disabled={addingLoading || !newName.trim()}
                        className="w-7 h-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        {addingLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => { setAddingNew(false); setNewName(""); }}
                        className="w-7 h-7 rounded-lg bg-secondary/60 text-muted-foreground hover:bg-secondary flex items-center justify-center transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setAddingNew(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border/40 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary/20 transition-all"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Agregar etiqueta
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* Preview */}
                {ticketLabels.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border/20">
                    <p className="text-[11px] text-muted-foreground/60 uppercase font-bold tracking-widest mb-3">Vista previa en bandeja</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {ticketLabels.map(label => (
                        <span
                          key={label.key}
                          className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border"
                          style={{ color: label.color, borderColor: label.color + "50", backgroundColor: label.color + "15" }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                          {label.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── ALERTAS ── */}
        {section === "alertas" && isAdmin && (
          <motion.div
            key="alertas"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl space-y-8"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight">Sistema de Alertas</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Números de WhatsApp que recibirán avisos automáticos del sistema.
              </p>
            </div>

            <div className="space-y-4 p-6 rounded-xl border border-border/20 bg-card/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">Números para aviso</h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  alertPhones.length >= 5
                    ? "text-destructive border-destructive/30 bg-destructive/10"
                    : "text-muted-foreground border-border/30 bg-secondary/30"
                }`}>
                  {alertPhones.length}/5
                </span>
              </div>

              {alertPhonesLoading ? (
                <div className="space-y-2">
                  {[1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-muted/20 animate-pulse" />)}
                </div>
              ) : alertPhones.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Bell className="w-8 h-8 opacity-20" />
                  <p className="text-sm">Sin números configurados</p>
                  <p className="text-[11px] opacity-60">Agrega hasta 5 números para recibir alertas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {alertPhones.map(p => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/20"
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Phone className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{p.phone}</p>
                          {p.label && <p className="text-[11px] text-muted-foreground truncate">{p.label}</p>}
                        </div>
                        <button
                          onClick={() => deleteAlertPhone(p.id)}
                          className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Import from technicians */}
              <AnimatePresence>
                {showTechImport && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="space-y-2 p-3 rounded-xl border border-border/30 bg-secondary/20"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground">Técnicos con teléfono registrado</p>
                      <button onClick={() => setShowTechImport(false)} className="text-muted-foreground/50 hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {techPhones.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/60 py-2 text-center">
                        Sin técnicos con número registrado
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {techPhones.map(tech => {
                          const alreadyAdded = alertPhones.some(p =>
                            p.phone.replace(/\D/g, '').endsWith(tech.phone.replace(/\D/g, ''))
                          );
                          return (
                            <div key={tech.id} className="flex items-center gap-2 py-1">
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold truncate">{tech.name}</p>
                                <p className="text-[10px] text-muted-foreground">{tech.phone}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={alreadyAdded ? "ghost" : "outline"}
                                className="h-7 text-[11px] gap-1 shrink-0"
                                disabled={alreadyAdded || alertPhones.length >= 5 || savingPhone}
                                onClick={() => addAlertPhone(tech.phone, tech.name)}
                              >
                                {alreadyAdded ? (
                                  <><Check className="w-3 h-3 text-emerald-500" /> Agregado</>
                                ) : (
                                  <><PlusCircle className="w-3 h-3" /> Agregar</>
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Add new phone */}
              <AnimatePresence>
                {addingPhone ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="space-y-2 p-3 rounded-xl border border-primary/30 bg-primary/5"
                  >
                    {/* Country code + number */}
                    <div className="flex gap-2">
                      <Select value={newPhoneCode} onValueChange={setNewPhoneCode}>
                        <SelectTrigger className="w-[90px] h-9 text-sm rounded-md shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { code: '+56', flag: '🇨🇱' },
                            { code: '+54', flag: '🇦🇷' },
                            { code: '+51', flag: '🇵🇪' },
                            { code: '+57', flag: '🇨🇴' },
                            { code: '+52', flag: '🇲🇽' },
                            { code: '+55', flag: '🇧🇷' },
                            { code: '+34', flag: '🇪🇸' },
                            { code: '+1',  flag: '🇺🇸' },
                          ].map(({ code, flag }) => (
                            <SelectItem key={code} value={code} className="text-sm">
                              {flag} {code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="912345678"
                        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onKeyDown={e => e.key === "Enter" && addAlertPhone()}
                      />
                    </div>
                    <input
                      type="text"
                      value={newPhoneLabel}
                      onChange={e => setNewPhoneLabel(e.target.value)}
                      placeholder="Etiqueta (ej: Jefe de turno)"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onKeyDown={e => e.key === "Enter" && addAlertPhone()}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setAddingPhone(false); setNewPhone(""); setNewPhoneLabel(""); }}>
                        Cancelar
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => addAlertPhone()} disabled={savingPhone || !newPhone.trim()}>
                        {savingPhone ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Guardar
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 gap-2 text-xs border-dashed"
                      disabled={alertPhones.length >= 5}
                      onClick={() => setAddingPhone(true)}
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {alertPhones.length >= 5 ? "Límite alcanzado (5/5)" : "Agregar número"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 text-xs border-dashed"
                      disabled={alertPhones.length >= 5 || loadingTechPhones}
                      onClick={showTechImport ? () => setShowTechImport(false) : loadTechPhones}
                      title="Importar desde técnicos"
                    >
                      {loadingTechPhones
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Users className="w-3.5 h-3.5" />
                      }
                      Técnicos
                    </Button>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── GRILLA DE CANALES ── */}
        {section === "documentos" && (
          <motion.div key="documentos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-lg font-bold">Grilla de Canales</h2>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Cargá la grilla de canales actualizada para que el asistente pueda responder consultas sobre la programación.
                Solo se permite un archivo a la vez — para actualizarla, reemplazá la versión anterior.
              </p>
            </div>

            {/* Input oculto siempre presente */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.csv,.xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFilePicked(f); e.target.value = ""; }}
            />

            {/* ── Zona de carga / confirmación / progreso ── */}
            <AnimatePresence mode="wait">
              {uploadingFile ? (
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border-2 border-dashed border-primary/40 rounded-2xl p-10 flex flex-col items-center gap-3 bg-primary/5"
                >
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm font-semibold text-primary">Subiendo grilla...</p>
                  <div className="w-full max-w-xs h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </motion.div>
              ) : !loadingDocs && documents.length === 0 ? (
                /* ── Drop zone (solo si no hay archivo cargado) ── */
                <motion.div
                  key="dropzone"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFilePicked(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all
                    ${dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-border/30 hover:border-primary/40 hover:bg-muted/20"}`}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-[15px] font-semibold">
                      {dragOver ? "Soltá el archivo aquí" : "Arrastrá la grilla o hacé clic"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      PDF · TXT · CSV · Excel — máx. {MAX_SIZE_MB} MB
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 mt-1">
                      Si tenés Word, exportá como PDF antes de subir
                    </p>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* ── Archivo actual ── */}
            {loadingDocs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
              </div>
            ) : (
              <AnimatePresence>
                {documents.map(doc => {
                  const Icon = docIcon(doc.file_type);
                  const colorClass = docColor(doc.file_type);
                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="flex items-center gap-3 p-4 rounded-xl border border-border/20 bg-card/40"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate">{doc.name}</p>
                        {doc.description && (
                          <p className="text-[12px] text-muted-foreground/70 truncate">{doc.description}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/40 mt-0.5">
                          {doc.file_type.toUpperCase()} · {formatBytes(doc.size_bytes)} · Subida el {new Date(doc.created_at).toLocaleDateString("es-CL")}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5 border-border/30"
                          onClick={() => handleReplaceDocument(doc)}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Reemplazar
                        </Button>
                        <button
                          onClick={() => handleDeleteDocument(doc)}
                          className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground/40 transition-colors"
                          title="Eliminar grilla"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            {/* Info */}
            <div className="flex gap-3 p-4 rounded-xl bg-muted/20 border border-border/15">
              <AlertCircle className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
                Una vez subida, la grilla es procesada automáticamente para que el asistente pueda responder
                consultas de canales y señales. Puede tardar unos minutos en estar disponible.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── INTEGRACIONES ── */}
        {section === "integraciones" && isAdmin && (
          <motion.div key="integraciones" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Integraciones</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Conecta los servicios externos que usa tu empresa. Las API keys se almacenan cifradas.
              </p>
            </div>

            {integrationsLoading ? (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-muted/20 animate-pulse" />)}
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {integrations.map(intg => {
                    const def = ALL_SERVICE_DEFS[intg.service_name] ?? SYSTEM_SERVICES[intg.service_name];
                    const isSystem = !!SYSTEM_SERVICES[intg.service_name] && !ALL_SERVICE_DEFS[intg.service_name];
                    const isEditing = editingIntegration === intg.id;
                    const showKey = showKeyMap[intg.id];
                    const defTyped = ALL_SERVICE_DEFS[intg.service_name];
                    return (
                      <motion.div
                        key={intg.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        className="rounded-xl border border-border/20 bg-card/40 overflow-hidden"
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Plug className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">{def?.label ?? intg.service_name}</p>
                              {isSystem && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground uppercase tracking-wider">Sistema</span>
                              )}
                              {(def as any)?.categoryLabel && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">{(def as any).categoryLabel}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground/60">{def?.description ?? ""}</p>
                          </div>
                          {!isEditing && !isSystem && (
                            <button
                              onClick={() => startEditIntegration(intg)}
                              className="w-7 h-7 rounded-lg bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="px-4 pb-3 border-t border-border/10 pt-2.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Key className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
                              <span className="font-mono text-xs text-muted-foreground/70 flex-1">
                                {showKey ? (intg.api_key ?? "—") : maskKey(intg.api_key)}
                              </span>
                              {intg.api_key && (
                                <button onClick={() => setShowKeyMap(m => ({ ...m, [intg.id]: !m[intg.id] }))} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                            {intg.api_url && (
                              <p className="text-[11px] text-muted-foreground/50 font-mono truncate pl-5">{intg.api_url}</p>
                            )}
                          </div>
                        )}

                        {isEditing && (
                          <div className="px-4 pb-4 pt-2.5 border-t border-border/10 space-y-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">Nueva API Key <span className="text-muted-foreground/40">(vacío = no cambiar)</span></Label>
                              <Input
                                type="password"
                                value={intFormKey}
                                onChange={e => setIntFormKey(e.target.value)}
                                placeholder={defTyped?.keyPlaceholder ?? "••••••••••••"}
                                className="h-8 text-sm font-mono bg-muted/10 border-border/20"
                                autoFocus
                              />
                            </div>
                            {defTyped?.needsUrl && (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">URL base</Label>
                                <Input value={intFormUrl} onChange={e => setIntFormUrl(e.target.value)} placeholder={defTyped.urlPlaceholder} className="h-8 text-sm bg-muted/10 border-border/20" />
                              </div>
                            )}
                            {intFormMetaError && <p className="text-[11px] text-destructive">{intFormMetaError}</p>}
                            <div className="flex gap-2 justify-end pt-1">
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEditIntegration}>Cancelar</Button>
                              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => saveIntegrationEdit(intg)} disabled={savingIntegration}>
                                {savingIntegration ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Guardar
                              </Button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* ── Wizard: agregar integración ── */}
                <AnimatePresence mode="wait">
                  {!wizardOpen ? (
                    <motion.button
                      key="add-btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => { resetWizard(); setWizardOpen(true); }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border/40 text-sm text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-secondary/20 transition-all"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Agregar integración
                    </motion.button>
                  ) : (
                    <motion.div
                      key="wizard"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="rounded-xl border border-primary/30 bg-primary/5 overflow-hidden"
                    >
                      {/* Wizard header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          {wizardService ? (
                            <>
                              <button onClick={() => { setWizardService(null); setWizardKey(""); setWizardUrl(""); setWizardValidation({ status: "idle", message: "" }); }} className="text-muted-foreground hover:text-foreground transition-colors">
                                ← {wizardCategory ? SERVICE_CATALOG.find(c => c.key === wizardCategory)?.label : "Categoría"}
                              </button>
                              <span className="text-muted-foreground/40">›</span>
                              <span>{wizardService.label}</span>
                            </>
                          ) : wizardCategory ? (
                            <>
                              <button onClick={() => setWizardCategory(null)} className="text-muted-foreground hover:text-foreground transition-colors">← Categoría</button>
                              <span className="text-muted-foreground/40">›</span>
                              <span>{SERVICE_CATALOG.find(c => c.key === wizardCategory)?.label}</span>
                            </>
                          ) : (
                            <span>¿Qué quieres conectar?</span>
                          )}
                        </div>
                        <button onClick={resetWizard} className="text-muted-foreground/50 hover:text-foreground transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        {/* Paso 1: Categoría */}
                        {!wizardCategory && (
                          <div className="grid grid-cols-2 gap-3">
                            {SERVICE_CATALOG.map(cat => (
                              <button
                                key={cat.key}
                                onClick={() => setWizardCategory(cat.key)}
                                className="flex flex-col items-start gap-2 p-4 rounded-xl border border-border/30 bg-background/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                              >
                                <span className="text-2xl">{cat.icon}</span>
                                <span className="text-sm font-semibold group-hover:text-primary transition-colors">{cat.label}</span>
                                <span className="text-[11px] text-muted-foreground/60">{cat.services.length} disponibles</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Paso 2: Servicio */}
                        {wizardCategory && !wizardService && (
                          <div className="space-y-2">
                            {SERVICE_CATALOG.find(c => c.key === wizardCategory)?.services.map(svc => {
                              const alreadyAdded = integrations.some(i => i.service_name === svc.name);
                              return (
                                <button
                                  key={svc.name}
                                  onClick={() => { if (!alreadyAdded) setWizardService(svc); }}
                                  disabled={alreadyAdded}
                                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                                    alreadyAdded
                                      ? "border-border/20 bg-muted/20 opacity-50 cursor-not-allowed"
                                      : "border-border/30 bg-background/60 hover:border-primary/40 hover:bg-primary/5"
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-semibold">{svc.label}</span>
                                      {svc.badge && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">{svc.badge}</span>
                                      )}
                                      {alreadyAdded && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground uppercase tracking-wider">Ya configurado</span>
                                      )}
                                    </div>
                                    <p className="text-[12px] text-muted-foreground/70 mt-0.5">{svc.description}</p>
                                  </div>
                                  {!alreadyAdded && <span className="text-muted-foreground/40 text-sm mt-0.5">→</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Paso 3: API Key */}
                        {wizardService && (
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-muted-foreground">API Key de {wizardService.label}</Label>
                              <Input
                                type="password"
                                value={wizardKey}
                                onChange={e => { setWizardKey(e.target.value); setWizardValidation({ status: "idle", message: "" }); }}
                                placeholder={wizardService.keyPlaceholder ?? "Pega tu API key aquí"}
                                className="h-9 text-sm font-mono bg-background/80 border-border/30"
                                autoFocus
                              />
                            </div>

                            {wizardService.needsUrl && (
                              <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">URL del panel</Label>
                                <Input
                                  value={wizardUrl}
                                  onChange={e => { setWizardUrl(e.target.value); setWizardValidation({ status: "idle", message: "" }); }}
                                  placeholder={wizardService.urlPlaceholder}
                                  className="h-9 text-sm bg-background/80 border-border/30"
                                />
                              </div>
                            )}

                            {/* Validación */}
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1.5 border-border/30"
                                onClick={validateWizardKey}
                                disabled={!wizardKey.trim() || wizardValidation.status === "loading" || (wizardService.needsUrl && !wizardUrl.trim())}
                              >
                                {wizardValidation.status === "loading"
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Check className="w-3 h-3" />}
                                Validar key
                              </Button>
                              {wizardValidation.status !== "idle" && wizardValidation.status !== "loading" && (
                                <span className={`text-[12px] font-medium ${wizardValidation.status === "ok" ? "text-emerald-500" : "text-destructive"}`}>
                                  {wizardValidation.message}
                                </span>
                              )}
                            </div>

                            <div className="flex gap-2 justify-end pt-1 border-t border-primary/10">
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetWizard}>Cancelar</Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs gap-1.5"
                                onClick={saveWizardIntegration}
                                disabled={savingWizard || !wizardKey.trim() || (wizardService.needsUrl && !wizardUrl.trim())}
                              >
                                {savingWizard ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                Guardar integración
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* ── MI CUENTA ── */}
        {section === "cuenta" && (
          <motion.div
            key="cuenta"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-xl space-y-8"
          >
            <div>
              <h2 className="text-xl font-bold tracking-tight">Mi Cuenta</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Gestiona la seguridad de tu cuenta personal.
              </p>
            </div>

            {/* Apariencia — tamaño de iconos colapsados */}
            <div className="space-y-4 p-6 rounded-xl border border-border/20 bg-card/40">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <PanelLeft className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Iconos del menú lateral</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Ajusta el tamaño de los iconos cuando la barra de navegación está oculta.
              </p>

              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Pequeño</span>
                  <span className="font-mono font-semibold text-foreground">{sidebarIconSize} px</span>
                  <span>Grande</span>
                </div>
                <Slider
                  min={16}
                  max={36}
                  step={2}
                  value={[sidebarIconSize]}
                  onValueChange={handleSidebarIconSizeChange}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground/50">
                  <span>16 px</span>
                  <span>36 px</span>
                </div>
                {/* Preview en vivo */}
                <div className="flex items-center justify-center gap-5 py-3 rounded-xl bg-card border border-border/20">
                  {[Home, MessageCircle, Ticket, Zap, MapPin].map((Icon, i) => (
                    <Icon
                      key={i}
                      className="text-muted-foreground/60 transition-all duration-200"
                      style={{ width: sidebarIconSize, height: sidebarIconSize }}
                    />
                  ))}
                </div>
                <button
                  onClick={() => handleSidebarIconSizeChange([24])}
                  className="text-[11px] text-primary hover:underline"
                >
                  Restablecer por defecto (24 px)
                </button>
              </div>
            </div>

            {/* Cambiar contraseña */}
            <div className="space-y-4 p-6 rounded-xl border border-border/20 bg-card/40">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="font-semibold text-sm">Cambiar contraseña</h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nueva contraseña</Label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Confirmar contraseña</Label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu nueva contraseña"
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">⚠ Las contraseñas no coinciden</p>
                )}
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={savingPw || !newPassword || newPassword !== confirmPassword}
                size="sm"
                className="gap-2"
              >
                {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Actualizar contraseña
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>

    {/* ── Tour guiado: Contexto Temporal del Agente ── */}
    <AnimatePresence>
      {tourStep > 0 && (
        <>
          {/* Overlay semitransparente */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] pointer-events-none"
          />

          {/* Tooltip flotante */}
          <motion.div
            key={tourStep}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed z-[100] bottom-10 left-1/2 -translate-x-1/2 w-[480px] max-w-[92vw]"
          >
            <div className="bg-card border border-border/30 rounded-2xl shadow-2xl overflow-hidden">
              {/* Barra de progreso */}
              <div className="h-1 bg-muted/30">
                <motion.div
                  className="h-full bg-amber-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(tourStep / TOUR_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>

              <div className="p-6">
                {/* Ícono + step count */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-xl">
                      {TOUR_STEPS[tourStep - 1].emoji}
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                      Paso {tourStep} de {TOUR_STEPS.length}
                    </span>
                  </div>
                  <button
                    onClick={() => { setTourStep(0); onTourComplete?.(); }}
                    className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/30"
                  >
                    Saltar tour
                  </button>
                </div>

                {/* Título y descripción */}
                <h3 className="text-[18px] font-bold leading-snug mb-2">
                  {TOUR_STEPS[tourStep - 1].title}
                </h3>
                <p className="text-[14px] text-muted-foreground/80 leading-relaxed">
                  {TOUR_STEPS[tourStep - 1].desc}
                </p>

                {/* Botones */}
                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => tourStep > 1 && setTourStep(s => s - 1)}
                    className={`text-sm font-medium px-4 py-2 rounded-xl transition-colors ${tourStep > 1 ? "text-muted-foreground hover:text-foreground hover:bg-muted/30" : "invisible"}`}
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => {
                      if (tourStep < TOUR_STEPS.length) {
                        setTourStep(s => s + 1);
                        // Scroll al target del siguiente paso
                        const next = TOUR_STEPS[tourStep]; // tourStep no incrementado aún → es el índice siguiente
                        if (next?.target) {
                          setTimeout(() => {
                            document.querySelector(`[data-tour='${next.target}']`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 100);
                        }
                      } else {
                        setTourStep(0);
                        onTourComplete?.();
                      }
                    }}
                    className="text-sm font-bold px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors shadow-lg shadow-amber-500/20"
                  >
                    {tourStep < TOUR_STEPS.length ? "Siguiente →" : "¡Entendido! 🎉"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}

// ── Pasos del tour ────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    emoji: "🎉",
    title: "¡Nueva función: Contexto Temporal!",
    desc: "Ahora podés darle instrucciones temporales al agente IA — feriados, promociones, cambios de horario — que se activan y se borran automáticamente cuando se acaba el tiempo. Sin tocar el prompt principal.",
    target: "temp-prompt-section",
  },
  {
    emoji: "✍️",
    title: "Escribí qué debe saber el bot",
    desc: "En el campo de texto describís la situación. Por ejemplo: 'El lunes es feriado, no hay atención presencial. Solo emergencias por WhatsApp.' Podés ser tan detallado como necesites.",
    target: "temp-prompt-section",
  },
  {
    emoji: "✨",
    title: "¿No sabés cómo redactarlo? La IA te ayuda",
    desc: "Hacé clic en 'Ayudarme a redactar con IA', describí la situación en palabras simples y la IA lo transforma en una instrucción clara para el bot. Podés editarla antes de aplicarla.",
    target: "temp-prompt-section",
  },
  {
    emoji: "⏱",
    title: "Elegí cuánto tiempo durará",
    desc: "Podés poner una duración (1 hora, 1 día, etc.) o una fecha exacta de inicio y fin. Cuando se acabe el tiempo, el contexto se borra automáticamente — el bot vuelve a su comportamiento normal.",
    target: "temp-prompt-section",
  },
  {
    emoji: "🚀",
    title: "Activar y olvidarte",
    desc: "Hacé clic en 'Activar' y listo. El agente IA ya tiene el contexto. Podés ver el tiempo restante en el badge 'ACTIVO'. Si algo cambia, podés desactivarlo manualmente en cualquier momento.",
    target: "temp-prompt-section",
  },
];
