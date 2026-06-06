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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  companyId: string | null;
  userRole: string | null;
  userId: string;
  isSimulating?: boolean;
}

type Section = "personalizar" | "tickets" | "cuenta" | "alertas";

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

export default function SettingsPage({ companyId, userRole, userId, isSimulating = false }: Props) {
  const isAdmin = userRole === "administrador" || userRole === "admin";
  const [section, setSection] = useState<Section>(isAdmin ? "personalizar" : "cuenta");
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

  const navItems: { id: Section; label: string; icon: any; adminOnly: boolean }[] = [
    { id: "personalizar", label: "Personalizar", icon: Palette, adminOnly: true },
    { id: "tickets", label: "Etiquetas", icon: Tag, adminOnly: true },
    { id: "alertas", label: "Alertas", icon: Bell, adminOnly: true },
    { id: "cuenta", label: "Mi Cuenta", icon: User, adminOnly: false },
  ];

  const visibleNav = navItems.filter(n => !n.adminOnly || isAdmin);

  return (
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
                <div className={`space-y-3 rounded-xl border p-4 transition-colors ${isTempActive() ? "border-amber-500/40 bg-amber-500/5" : "border-border/20 bg-card/40"}`}>
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
  );
}
