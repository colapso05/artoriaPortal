import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordStrengthBar, { isPasswordValid } from "@/components/ui/PasswordStrengthBar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Settings2, Pencil, Building2, KeyRound, Copy, Eye, EyeOff,
  MoreHorizontal, Link2, Phone, Key, RotateCw, ChevronLeft, Map, Users as UsersIcon, Settings,
  FileUp, AlertCircle, Save, WandSparkles, Tag, ShieldAlert
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import CompanyTeamManager from "./CompanyTeamManager";
import CoverageMap from "./CoverageMap";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const generatePassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};




interface CompanyConfig {
  id: string;
  company_name: string;
  ycloud_api_key: string;
  ycloud_phone: string;
  webhook_id: string;
  user_id: string | null;
  owner_id?: string;
  auto_close_message?: string;
  alert_webhook_path?: string | null;
  credits_enabled?: boolean;
  bandeja_template_id?: string | null;
}

interface WaTemplate {
  name: string;
  language?: string;
  status?: string;
  category?: string;
  components?: any[];
}

interface SimulateUserPayload {
  userId: string;
  name: string;
  role: string;
  operatorRoles: string[];
  companyName?: string;
}

export default function AdminUserManager({ onSimulate, onSimulateUser }: { onSimulate?: (id: string, name: string) => void; onSimulateUser?: (companyId: string, payload: SimulateUserPayload) => void }) {
  const [companies, setCompanies] = useState<CompanyConfig[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newYcloudKey, setNewYcloudKey] = useState("");
  const [newYcloudPhone, setNewYcloudPhone] = useState("");
  const [countryPrefix, setCountryPrefix] = useState("+56");


  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Edit user/company
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editUserData, setEditUserData] = useState({
    user_id: "",
    display_name: "",
    email: "",
    ycloud_api_key: "",
    ycloud_phone: "",
    config_id: null as string | null,
    webhook_id: "",
    auto_close_message: "",
    credits_enabled: false as boolean,
    bandeja_template_id: "" as string,
    tech_template_id: "" as string,
    outbound_template_id: "" as string,
    alert_webhook_path: "" as string,
  });
  const [editTemplates, setEditTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Reset password
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [resetPwUserId, setResetPwUserId] = useState("");
  const [resetPwValue, setResetPwValue] = useState("");



  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showYcloudKey, setShowYcloudKey] = useState(false);
  const [showEditYcloudKey, setShowEditYcloudKey] = useState(false);
  
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();
  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ycloud-webhook`;

  // Claves sensibles cargadas desde el servidor — nunca hardcodeadas en el bundle
  const [serviceKey, setServiceKey] = useState<string>("");
  const [botWebhookUrl, setBotWebhookUrl] = useState<string>("");
  const [supabaseUrl, setSupabaseUrl] = useState<string>(import.meta.env.VITE_SUPABASE_URL || "");

  useEffect(() => {
    fetchCompanies();
    fetchSecureConfig();
  }, []);

  const fetchSecureConfig = async () => {
    try {
      // Fix 1: service_role key — nunca en el bundle
      const { data: keyData } = await supabase.functions.invoke("get-service-key");
      if (keyData?.service_key) setServiceKey(keyData.service_key);
      if (keyData?.supabase_url) setSupabaseUrl(keyData.supabase_url);

      // Fix 2: webhook URL del bot — nunca en el bundle
      const { data: configData } = await supabase.functions.invoke("get-config");
      if (configData?.bot_webhook_url) setBotWebhookUrl(configData.bot_webhook_url);
    } catch (e) {
      console.warn("No se pudo cargar config segura:", e);
    }
  };

  const fetchCompanies = async () => {
    setLoading(true);
    const { data: configs } = await supabase.from("company_config").select("*").order("company_name");
    const validConfigs = configs || [];
    setCompanies(validConfigs);


    setLoading(false);
  };



  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newYcloudKey || !newYcloudPhone) {
      toast({ title: "WhatsApp Obligatorio", description: "Debes configurar la API Key y el teléfono de la empresa.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const fullPhone = `${countryPrefix}${newYcloudPhone.replace(/^\+/, '')}`;

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email: newEmail,
        display_name: newName,
        password: newPassword,
        company_name: newName,
        ycloud_api_key: newYcloudKey,
        phone_number: fullPhone
      },
    });

    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const userId = data?.user?.id;
    if (userId) {
      // 1. Vincular al usuario como administrador de su propia compañía 
      // (Buscamos la config creada por la edge function)
      const { data: configData } = await supabase
        .from("company_config")
        .select("id")
        .or(`owner_id.eq.${userId},user_id.eq.${userId}`)
        .limit(1)
        .single();

      if (configData) {
        await supabase.from("company_users").insert({
          company_id: configData.id,
          user_id: userId,
          role: "administrador"
        });

        // Seed etiquetas de ticket por defecto
        await (supabase as any).from("ticket_labels").insert([
          { company_id: configData.id, key: "abierto",             label: "Abierto",             color: "#22c55e", sort_order: 1, is_initial: true,  is_final: false },
          { company_id: configData.id, key: "en_proceso",          label: "En Proceso",          color: "#3b82f6", sort_order: 2, is_initial: false, is_final: false },
          { company_id: configData.id, key: "esperando_respuesta", label: "Esperando Respuesta", color: "#f59e0b", sort_order: 3, is_initial: false, is_final: false },
          { company_id: configData.id, key: "resuelto",            label: "Resuelto",            color: "#a855f7", sort_order: 4, is_initial: false, is_final: false },
          { company_id: configData.id, key: "cerrado",             label: "Cerrado",             color: "#64748b", sort_order: 5, is_initial: false, is_final: true  },
        ]);
      }


    }

    // Notify external webhook
    try {
      if (!botWebhookUrl) throw new Error("Bot webhook URL no disponible");
      await fetch(botWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "company_created",
          company_name: newName,
          email: newEmail,
          temporary_password: newPassword,
          timestamp: new Date().toISOString()
        })
      });
      console.log("External webhook notified successfully");
    } catch (webhookErr) {
      console.error("Failed to notify external webhook:", webhookErr);
    }

    toast({ title: "Empresa creada", description: `${newEmail}` });
    setNewEmail(""); setNewName(""); setNewPassword("");
    setNewYcloudKey(""); setNewYcloudPhone("");
    setDialogOpen(false);
    fetchCompanies();
    setLoading(false);
  };

  const seedDefaultLabels = async (companyId: string) => {
    // Verificar si ya tiene etiquetas para no duplicar
    const { data: existing } = await (supabase as any)
      .from("ticket_labels")
      .select("id")
      .eq("company_id", companyId)
      .limit(1);
    if (existing && existing.length > 0) {
      toast({ title: "Ya tiene etiquetas", description: "Esta empresa ya tiene etiquetas de ticket configuradas.", variant: "destructive" });
      return;
    }
    const { error } = await (supabase as any).from("ticket_labels").insert([
      { company_id: companyId, key: "abierto",             label: "Abierto",             color: "#22c55e", sort_order: 1, is_initial: true,  is_final: false },
      { company_id: companyId, key: "en_proceso",          label: "En Proceso",          color: "#3b82f6", sort_order: 2, is_initial: false, is_final: false },
      { company_id: companyId, key: "esperando_respuesta", label: "Esperando Respuesta", color: "#f59e0b", sort_order: 3, is_initial: false, is_final: false },
      { company_id: companyId, key: "resuelto",            label: "Resuelto",            color: "#a855f7", sort_order: 4, is_initial: false, is_final: false },
      { company_id: companyId, key: "cerrado",             label: "Cerrado",             color: "#64748b", sort_order: 5, is_initial: false, is_final: true  },
    ]);
    if (error) {
      toast({ title: "Error al crear etiquetas", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Etiquetas por defecto creadas" });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa eliminada" });
      fetchCompanies();
    }
  };



  // Edit user/company
  const openEditUser = async (company: CompanyConfig) => {
    setEditUserData({
      user_id: company.user_id || company.owner_id || "",
      display_name: company.company_name || "",
      email: "",
      ycloud_api_key: company.ycloud_api_key || "",
      ycloud_phone: company.ycloud_phone || "",
      config_id: company.id,
      webhook_id: company.webhook_id || "",
      auto_close_message: company.auto_close_message || "",
      credits_enabled: company.credits_enabled ?? false,
      bandeja_template_id: company.bandeja_template_id || "",
      tech_template_id: "",
      outbound_template_id: (company as any).outbound_template_id || "",
      alert_webhook_path: company.alert_webhook_path || "",
    });
    setEditUserDialogOpen(true);

    // Cargar plantillas usando service key para poder pasar company_id como override
    setLoadingTemplates(true);
    try {
      // Si serviceKey aún no cargó (race condition), lo pedimos aquí
      let key = serviceKey;
      if (!key) {
        const { data: keyData } = await supabase.functions.invoke("get-service-key");
        key = keyData?.service_key || "";
        if (key) setServiceKey(key);
      }
      // Siempre usar la URL pública (VITE_SUPABASE_URL) — supabaseUrl puede ser la interna de Docker
      const baseUrl = import.meta.env.VITE_SUPABASE_URL || supabaseUrl || "";
      const url = `${baseUrl}/functions/v1/ycloud-get-templates-company`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({ company_id: company.id }),
      });
      const data = await resp.json();
      const tpls = data?.templates || [];
      setEditTemplates(tpls);
      if (tpls.length === 0 && data?.error) {
        toast({ title: "Sin plantillas", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error cargando plantillas", description: e.message, variant: "destructive" });
    } finally {
      setLoadingTemplates(false);
    }
    try {
      const { data: schedData } = await (supabase as any)
        .from("schedule_settings")
        .select("tech_template_id")
        .eq("company_id", company.id)
        .maybeSingle();
      if (schedData?.tech_template_id) {
        setEditUserData(prev => ({ ...prev, tech_template_id: schedData.tech_template_id }));
      }
    } catch (_) {}
  };

  const handleUpdateUser = async () => {
    setLoading(true);
    try {
      // 1. Update Auth/Profile via Edge Function (if user_id is available and email/display_name changed)
      if (editUserData.user_id && (editUserData.email || editUserData.display_name)) {
        const { data, error } = await supabase.functions.invoke("update-user", {
          body: {
            user_id: editUserData.user_id,
            display_name: editUserData.display_name,
            email: editUserData.email // This might be empty if not fetched
          },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
      }

      // 2. Update Company Config
      if (editUserData.config_id) {
        const { error: updateConfigError } = await supabase.from("company_config")
          .update({
            ycloud_api_key: editUserData.ycloud_api_key,
            ycloud_phone: editUserData.ycloud_phone,
            company_name: editUserData.display_name,
            auto_close_message: editUserData.auto_close_message,
            credits_enabled: editUserData.credits_enabled,
            bandeja_template_id: editUserData.bandeja_template_id || null,
            outbound_template_id: editUserData.outbound_template_id || null,
            alert_webhook_path: editUserData.alert_webhook_path.trim() || null,
          })
          .eq("id", editUserData.config_id);
        if (updateConfigError) throw new Error(updateConfigError.message);

        // 3. Update schedule_settings tech_template_id (upsert por si no existe fila)
        await (supabase as any).from("schedule_settings")
          .upsert({
            company_id: editUserData.config_id,
            tech_template_id: editUserData.tech_template_id || null,
          }, { onConflict: "company_id", ignoreDuplicates: false });
      } else {
        // This case should ideally not happen if editing an existing company
        // but if it does, create a new config (though user_id is required)
        if (!editUserData.user_id) throw new Error("User ID is required to create a new company config.");
        const { error: insertConfigError } = await supabase.from("company_config").insert({
          user_id: editUserData.user_id,
          owner_id: editUserData.user_id,
          company_name: editUserData.display_name,
          ycloud_api_key: editUserData.ycloud_api_key,
          ycloud_phone: editUserData.ycloud_phone,
        });
        if (insertConfigError) throw new Error(insertConfigError.message);
      }

      toast({ title: "Empresa actualizada" });
      setEditUserDialogOpen(false);
      await fetchCompanies(); // Re-fetch all companies to update the list and selected company
      if (selectedCompany && selectedCompany.id === editUserData.config_id) {
        // Update selectedCompany state to reflect changes immediately
        setSelectedCompany(prev => prev ? { ...prev, ...editUserData, company_name: editUserData.display_name } : null);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };


  // Password
  const openResetPassword = (userId: string) => { setResetPwUserId(userId); setResetPwValue(""); setResetPwDialogOpen(true); };
  const handleResetPassword = async () => {
    if (!resetPwValue) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("update-user", { body: { user_id: resetPwUserId, password: resetPwValue } });
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Contraseña restablecida" });
      setResetPwDialogOpen(false);
      // No need to fetch users, as this only affects auth.users table
    }
    setLoading(false);
  };


  const handleImportZones = async () => {
    if (!selectedCompany || !importJson.trim()) return;
    setIsImporting(true);
    try {
      const parsed = JSON.parse(importJson);

      // Normalize: accept GeoJSON FeatureCollection OR array of zones
      let data: any[];
      if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
        // Convert GeoJSON FeatureCollection → zone array
        data = parsed.features.map((f: any, i: number) => {
          const coords = f.geometry?.coordinates?.[0]; // first ring of polygon
          if (!coords) throw new Error(`Feature ${i + 1} no tiene coordenadas válidas`);
          return {
            name: f.properties?.name || f.properties?.nombre || `Zona ${i + 1}`,
            color: f.properties?.color || "#3b82f6",
            polygon: coords, // already [lng, lat] pairs, will be inverted below
          };
        });
      } else if (Array.isArray(parsed)) {
        data = parsed;
      } else {
        throw new Error("El JSON debe ser un array de zonas o un GeoJSON FeatureCollection.");
      }

      const zonesToInsert = data.map((z: any) => {
        if (!Array.isArray(z.polygon)) throw new Error(`Zona sin polígono inválido: ${JSON.stringify(z)}`);

        // Invertir [lng, lat] -> [lat, lng]
        const invertedPolygon = z.polygon.map((p: any) => {
          if (!Array.isArray(p) || p.length < 2) return p;
          return [p[1], p[0]]; // [lng, lat] -> [lat, lng]
        });

        return {
          company_id: selectedCompany.id,
          name: z.name || "Zona sin nombre",
          polygon: invertedPolygon,
          color: z.color || "#3b82f6",
          alert_active: true
        };
      });

      // 1. Delete existing zones
      const { error: delError } = await supabase
        .from("coverage_zones")
        .delete()
        .eq("company_id", selectedCompany.id);

      if (delError) throw delError;

      // 2. Insert new zones
      const { error: insError } = await supabase
        .from("coverage_zones")
        .insert(zonesToInsert);

      if (insError) throw insError;

      toast({ 
        title: "Importación Exitosa", 
        description: `Se han importado ${zonesToInsert.length} zonas correctamente.` 
      });
      setImportDialogOpen(false);
      setImportJson("");
      
      // Force refresh map by re-selecting company
      const current = selectedCompany;
      setSelectedCompany(null);
      setTimeout(() => setSelectedCompany(current), 10);

    } catch (err: any) {
      toast({ title: "Error de Importación", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportZones = async () => {
    if (!selectedCompany) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase
        .from("coverage_zones")
        .select("name, polygon")
        .eq("company_id", selectedCompany.id);
      
      if (error) throw error;
      
      const zonesToExport = (data || []).map(z => ({
        name: z.name,
        polygon: (z.polygon as number[][]).map(p => [p[1], p[0]]) // Invert to [lng, lat]
      }));

      const blob = new Blob([JSON.stringify(zonesToExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_cobertura_${selectedCompany.company_name.toLowerCase().replace(/\s+/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Exportación Exitosa", description: `${zonesToExport.length} zonas exportadas.` });
    } catch (err: any) {
      toast({ title: "Error al exportar", description: err.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyZones = async () => {
    if (!selectedCompany) return;
    await copyZonesJson(selectedCompany.id);
  };

  const copyZonesJson = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("coverage_zones")
        .select("name, polygon")
        .eq("company_id", companyId);

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "Sin zonas", description: "Esta empresa no tiene zonas para copiar.", variant: "destructive" });
        return;
      }

      const zonesToCopy = (data || []).map(z => ({
        name: z.name,
        polygon: (z.polygon as number[][]).map(p => [p[1], p[0]]) // Invert to [lng, lat]
      }));

      await navigator.clipboard.writeText(JSON.stringify(zonesToCopy, null, 2));
      toast({ title: "JSON Copiado", description: "Las zonas están en tu portapapeles." });
    } catch (err: any) {
      toast({ title: "Error al copiar", description: err.message, variant: "destructive" });
    }
  };


  const copyWebhook = (webhookId: string) => {
    navigator.clipboard.writeText(`${webhookBaseUrl}?cid=${webhookId}`);
    toast({ title: "URL copiada", description: "Pégala en la configuración de webhook de YCloud" });
  };

  const copyCurlDerivacion = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/create-ticket" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{
    "company_id": "${companyId}",
    "wa_id": "{{ $json.wa_id }}",
    "customer_name": "{{ $json.customer_name }}",
    "reason": "{{ $json.reason }}",
    "category": "{{ $json.category }}",
    "assigned_role": "{{ $json.assigned_role }}",
    "rut": "{{ $json.rut }}",
    "customer_address": "{{ $json.customer_address }}",
    "customer_email": "{{ $json.customer_email }}",
    "skip_nocodb": true
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Derivación copiado al portapapeles" });
  };

  const copyCurlToggleAlert = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/toggle-alert" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{
    "company_id": "${companyId}",
    "active": true,
    "message": "Estamos experimentando problemas en tu zona.",
    "zone_ids": []
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Toggle Alerta copiado al portapapeles" });
  };

  const copyCurlFactibilidad = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/check-coverage" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{
    "company_id": "${companyId}",
    "lat": -33.5281408,
    "lng": -70.6984815,
    "mode": "coverage"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Factibilidad copiado al portapapeles" });
  };

  const copyCurlAlertStatus = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/get-alert-status" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{"company_id": "${companyId}"}'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Estado Alerta copiado al portapapeles" });
  };

  const copyCurlSistemaAlerta = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/check-alert-zone" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{"lat": -33.4489, "lng": -70.6693, "company_id": "${companyId}"}'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL Sistema de Alerta copiado al portapapeles" });
  };

  const copyAlertWebhookUrl = (company: any) => {
    if (!company?.alert_webhook_path) {
      toast({ title: "Sin webhook configurado", description: "Esta empresa no tiene webhook de alerta. Ejecuta el SQL de migración.", variant: "destructive" });
      return;
    }
    const baseWebhook = (botWebhookUrl || "").replace(/\/[^/]+$/, "");
    const url = `${baseWebhook}/${company.alert_webhook_path}`;
    navigator.clipboard.writeText(url);
    toast({ title: "✅ Webhook de Alertas copiado", description: url });
  };

  const copyCurlVerificarTicket = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/check-ticket" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{
    "company_id": "${companyId}",
    "rut": "12.345.678-9"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Verificar Ticket copiado al portapapeles" });
  };

  const copyCurlDeductCredit = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/deduct-credit" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{
    "company_id": "${companyId}",
    "amount": 1,
    "description": "Mensaje WhatsApp enviado"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Descontar Crédito copiado al portapapeles" });
  };

  const copyCurlGetCreditBalance = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/get-credit-balance" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${serviceKey}" \\
  -d '{ "company_id": "${companyId}" }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Ver Saldo de Créditos copiado al portapapeles" });
  };

  const copyJsonCoberturaN8n = async (companyId: string) => {
    await copyZonesJson(companyId);
  };

  const copyDerivationTemplate = () => {
    const template = {
      "company_id": editUserData.config_id,
      "wa_id": "",
      "customer_name": "",
      "rut": "",
      "reason": "",
      "category": "soporte_tecnico",
      "assigned_role": "soporte_tecnico"
    };
    navigator.clipboard.writeText(JSON.stringify(template, null, 2));
    toast({ title: "Plantilla copiada", description: "JSON de derivación copiado al portapapeles" });
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 10) return "••••••••";
    return key.substring(0, 6) + "••••••" + key.substring(key.length - 4);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Building2 className="w-6 h-6 text-primary" />
          Gestión de Empresas
        </h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 h-10 px-4" onClick={() => {
              setNewPassword(generatePassword());
              setCountryPrefix("+56");
            }}>
              <Plus className="w-4 h-4" /> Nueva Empresa
            </Button>
          </DialogTrigger>

          <DialogContent className="border-border/30 bg-card max-w-lg">
            <DialogHeader>
              <DialogTitle>Crear Nueva Empresa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-6 mt-4 max-h-[70vh] overflow-y-auto px-1 pr-3 custom-scrollbar">
              {/* Sección General */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                  <Building2 className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Información General</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre de Empresa</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Ej: DROPPLTDA" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email de acceso</Label>
                    <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="admin@empresa.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Contraseña temporal</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Ej: Empresa1_2024"
                        required
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => setNewPassword(generatePassword())}
                      title="Regenerar contraseña"
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </div>
                  <PasswordStrengthBar password={newPassword} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Configuración WhatsApp</span>
                </div>
                <div className="space-y-2">
                  <Label>API Key de YCloud</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showYcloudKey ? "text" : "password"}
                      value={newYcloudKey}
                      onChange={(e) => setNewYcloudKey(e.target.value)}
                      placeholder="ycl_..."
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground z-10"
                      onClick={() => setShowYcloudKey(!showYcloudKey)}
                    >
                      {showYcloudKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono WhatsApp (Sin prefijo)</Label>
                  <div className="flex gap-2">
                    <Select value={countryPrefix} onValueChange={setCountryPrefix}>
                      <SelectTrigger className="w-[110px]">
                        <SelectValue placeholder="Prefijo" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px] bg-card border-border/40">
                        <SelectItem value="+56">🇨🇱 +56</SelectItem>
                        <SelectItem value="+54">🇦🇷 +54</SelectItem>
                        <SelectItem value="+51">🇵🇪 +51</SelectItem>
                        <SelectItem value="+57">🇨🇴 +57</SelectItem>
                        <SelectItem value="+52">🇲🇽 +52</SelectItem>
                        <SelectItem value="+55">🇧🇷 +55</SelectItem>
                        <SelectItem value="+1">🇺🇸 +1</SelectItem>
                        <SelectItem value="+34">🇪🇸 +34</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={newYcloudPhone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val.length <= 15) setNewYcloudPhone(val);
                      }}
                      placeholder="9 1234 5678"
                      required
                      className="flex-1"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 px-1 italic">
                    Formato final: <span className="text-primary font-bold">{countryPrefix}{newYcloudPhone || "9XXXXXXXX"}</span>
                  </p>
                </div>
              </div>



              <div className="pt-2 sticky bottom-0 bg-card/95 backdrop-blur-sm pb-1">
                <Button type="submit" disabled={loading} className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <RotateCw className="w-4 h-4 animate-spin" />
                      Creando Empresa...
                    </div>
                  ) : "Finalizar y Crear Empresa"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>



      {/* Edit User/Company Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="border-border/30 bg-card max-w-md">
          <DialogHeader><DialogTitle>Editar Empresa</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                <Building2 className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Info General</span>
              </div>
              <div><Label>Nombre</Label><Input value={editUserData.display_name} onChange={(e) => setEditUserData(prev => ({ ...prev, display_name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Email</Label><Input type="email" value={editUserData.email} onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))} className="mt-1" /></div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                <Phone className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Config WhatsApp</span>
              </div>
              <div className="space-y-1">
                <Label>API Key de YCloud</Label>
                <div className="relative mt-1">
                  <Input
                    type={showEditYcloudKey ? "text" : "password"}
                    value={editUserData.ycloud_api_key}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, ycloud_api_key: e.target.value }))}
                    placeholder="ycl_..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground z-10"
                    onClick={() => setShowEditYcloudKey(!showEditYcloudKey)}
                  >
                    {showEditYcloudKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div><Label>Teléfono WhatsApp</Label><Input value={editUserData.ycloud_phone} onChange={(e) => setEditUserData(prev => ({ ...prev, ycloud_phone: e.target.value }))} placeholder="+569..." className="mt-1" /></div>
              {editUserData.webhook_id && (
                <div>
                  <Label>Webhook URL (Solo lectura)</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={`${webhookBaseUrl}?cid=${editUserData.webhook_id}`} className="bg-secondary/30 text-xs font-mono" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyWebhook(editUserData.webhook_id)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              {/* Alert webhook path */}
              <div className="pt-2 border-t border-border/10 mt-2 space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  Webhook de Alertas (ruta n8n)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={editUserData.alert_webhook_path}
                    onChange={(e) => setEditUserData(prev => ({ ...prev, alert_webhook_path: e.target.value.trim() }))}
                    placeholder="ej: alert-dropp"
                    className="font-mono text-xs"
                  />
                  {editUserData.alert_webhook_path && botWebhookUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Copiar URL completa"
                      onClick={() => {
                        const base = botWebhookUrl.replace(/\/[^/]+$/, "");
                        const url = `${base}/${editUserData.alert_webhook_path}`;
                        navigator.clipboard.writeText(url);
                        toast({ title: "URL copiada", description: url });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Solo el segmento final de la URL del webhook en n8n.{" "}
                  {botWebhookUrl && editUserData.alert_webhook_path
                    ? <span className="font-mono text-primary/70">{botWebhookUrl.replace(/\/[^/]+$/, "")}/{editUserData.alert_webhook_path}</span>
                    : "Ej: si la URL es …/webhook/alert-dropp, escribe alert-dropp"}
                </p>
              </div>

              {editUserData.config_id && (
                <div className="pt-2 border-t border-border/10 mt-2 space-y-2">
                  <Label>Webhook Derivación de Tickets (Dev)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={`POST http://192.168.102.3:8000/functions/v1/create-ticket`} className="bg-secondary/30 text-[11px] font-mono text-muted-foreground" />
                  </div>
                  <div className="flex gap-2">
                    <Input readOnly value={`Authorization: Bearer SERVICE_ROLE_KEY`} className="bg-secondary/30 text-[11px] font-mono text-muted-foreground" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyDerivationTemplate()} title="Copiar Plantilla JSON">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-border/10 mt-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm font-semibold">Créditos WhatsApp</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Habilita el sistema de créditos para esta empresa. El widget de saldo aparecerá en su panel.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditUserData(prev => ({ ...prev, credits_enabled: !prev.credits_enabled }))}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${editUserData.credits_enabled ? "bg-primary" : "bg-secondary/60"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${editUserData.credits_enabled ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
              </div>

            </div>

            {/* Plantillas automáticas */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                <WandSparkles className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Plantillas Automáticas</span>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">Las plantillas seleccionadas se usan automáticamente — los usuarios de esta empresa no tendrán que elegirlas.</p>

              {/* Bandeja 24h */}
              <div className="space-y-1">
                <Label className="text-xs">Plantilla bandeja (24h expirada)</Label>
                {loadingTemplates ? (
                  <div className="h-9 rounded-md border border-border/30 bg-muted/20 animate-pulse" />
                ) : (
                  <Select
                    value={editUserData.bandeja_template_id || "__none__"}
                    onValueChange={(v) => setEditUserData(prev => ({ ...prev, bandeja_template_id: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Sin plantilla configurada" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/40 max-h-52">
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Sin plantilla —</SelectItem>
                      {editTemplates.map(t => (
                        <SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Técnicos agenda */}
              <div className="space-y-1">
                <Label className="text-xs">Plantilla técnicos (agenda)</Label>
                {loadingTemplates ? (
                  <div className="h-9 rounded-md border border-border/30 bg-muted/20 animate-pulse" />
                ) : (
                  <Select
                    value={editUserData.tech_template_id || "__none__"}
                    onValueChange={(v) => setEditUserData(prev => ({ ...prev, tech_template_id: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Sin plantilla configurada" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/40 max-h-52">
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Sin plantilla —</SelectItem>
                      {editTemplates.map(t => (
                        <SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Nueva conversación outbound */}
              <div className="space-y-1">
                <Label className="text-xs">Plantilla nueva conversación (outbound)</Label>
                {loadingTemplates ? (
                  <div className="h-9 rounded-md border border-border/30 bg-muted/20 animate-pulse" />
                ) : (
                  <Select
                    value={editUserData.outbound_template_id || "__none__"}
                    onValueChange={(v) => setEditUserData(prev => ({ ...prev, outbound_template_id: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Sin plantilla configurada" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/40 max-h-52">
                      <SelectItem value="__none__" className="text-xs text-muted-foreground">— Sin plantilla —</SelectItem>
                      {editTemplates.map(t => (
                        <SelectItem key={t.name} value={t.name} className="text-xs">{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="pt-2 sticky bottom-0 bg-card/90 backdrop-blur-sm pb-1">
              <Button onClick={handleUpdateUser} disabled={loading} className="w-full h-10">{loading ? "Guardando..." : "Guardar Cambios"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Reset Password Dialog */}
      <Dialog open={resetPwDialogOpen} onOpenChange={setResetPwDialogOpen}>
        <DialogContent className="border-border/30 bg-card">
          <DialogHeader><DialogTitle>Restablecer Contraseña</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">El usuario deberá cambiarla al ingresar.</p>
            <div className="relative">
              <Label>Nueva contraseña</Label>
              <div className="relative mt-1">
                <Input
                  type={showResetPassword ? "text" : "password"}
                  value={resetPwValue}
                  onChange={(e) => setResetPwValue(e.target.value)}
                  placeholder="NuevaTemp123!"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-muted-foreground"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <Button onClick={handleResetPassword} disabled={loading || !resetPwValue} className="w-full">{loading ? "Restableciendo..." : "Restablecer Contraseña"}</Button>
          </div>
        </DialogContent>
      </Dialog>


      {selectedCompany ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300 overflow-y-auto max-h-[calc(100vh-10rem)] pr-2">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedCompany(null)}
              className="h-8 border-border/20 bg-card hover:bg-secondary/50"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Regresar
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary" />
                {selectedCompany.company_name}
              </h2>
              <p className="text-sm text-muted-foreground">ID: {selectedCompany.id}</p>
            </div>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-card border-border/40">
                  <DropdownMenuItem
                    onClick={() => onSimulate?.(selectedCompany.id, selectedCompany.company_name)}
                    className="cursor-pointer gap-2 text-primary focus:text-primary font-bold"
                  >
                    <WandSparkles className="w-4 h-4" /> Simular esta empresa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => seedDefaultLabels(selectedCompany.id)}
                    className="cursor-pointer gap-2"
                  >
                    <Tag className="w-4 h-4" /> Crear etiquetas por defecto
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/20" />
                  <DropdownMenuItem onClick={() => copyWebhook(selectedCompany.webhook_id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> Copiar Webhook
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlDerivacion(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Derivación
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlFactibilidad(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Factibilidad
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlToggleAlert(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Toggle Alerta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlAlertStatus(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Estado Alerta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlSistemaAlerta(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Sistema Alerta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyAlertWebhookUrl(selectedCompany)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> Webhook Alertas (n8n)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlVerificarTicket(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Verificar Ticket
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlDeductCredit(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Descontar Crédito
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyCurlGetCreditBalance(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Ver Saldo Créditos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyJsonCoberturaN8n(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> JSON Cobertura n8n
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/20" />
                  <DropdownMenuItem 
                    onClick={() => handleDeleteUser(selectedCompany.user_id || selectedCompany.owner_id || "")} 
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar empresa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Tabs defaultValue="equipo" className="space-y-6">
            <TabsList className="bg-muted/50 p-1 border border-border/20 h-11">
              <TabsTrigger value="equipo" className="gap-2 px-4 data-[state=active]:bg-card">
                <UsersIcon className="w-4 h-4" /> Equipo
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2 px-4 data-[state=active]:bg-card">
                <Settings className="w-4 h-4" /> Configuración
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-2 px-4 data-[state=active]:bg-card">
                <Map className="w-4 h-4" /> Cobertura
              </TabsTrigger>
            </TabsList>

            <TabsContent value="equipo" className="space-y-6 outline-none">
              <CompanyTeamManager
                companyId={selectedCompany.id}
                companyName={selectedCompany.company_name}
                onOpenResetPassword={(userId) => openResetPassword(userId)}
                onSimulate={onSimulate}
                onSimulateUser={onSimulateUser ? (payload) => onSimulateUser(selectedCompany.id, { ...payload, companyName: selectedCompany.company_name }) : undefined}
              />
            </TabsContent>

            <TabsContent value="config" className="space-y-6 outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border/30 bg-card p-6 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border/10 pb-3">
                    <Phone className="w-5 h-5 text-primary" />
                    <h3 className="font-bold">WhatsApp Business</h3>
                  </div>
                  
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Número de Teléfono</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={selectedCompany.ycloud_phone} className="bg-muted/20" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>API Key (Mascara)</Label>
                      <div className="flex items-center gap-2 border border-border/20 rounded-md px-3 h-10 bg-muted/10">
                        <Key className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-mono text-muted-foreground flex-1">
                          {maskKey(selectedCompany.ycloud_api_key)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-border/30 bg-card p-6 space-y-4">
                  <div className="flex items-center gap-2 border-b border-border/10 pb-3">
                    <Link2 className="w-5 h-5 text-primary" />
                    <h3 className="font-bold">Webhooks & API</h3>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground uppercase">URL de Recepción (YCloud)</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={`${webhookBaseUrl}?cid=${selectedCompany.webhook_id}`} className="bg-muted/10 text-xs font-mono" />
                        <Button variant="outline" size="icon" onClick={() => copyWebhook(selectedCompany.webhook_id)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2">
                      <div className="flex gap-3">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1 gap-2"
                          onClick={() => copyCurlDerivacion(selectedCompany.id)}
                        >
                          <Copy className="w-3.5 h-3.5" /> cURL Derivación
                        </Button>
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1 gap-2"
                          onClick={() => copyJsonCoberturaN8n(selectedCompany.id)}
                        >
                          <Copy className="w-3.5 h-3.5" /> JSON Cobertura n8n
                        </Button>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full gap-2 border-primary/20 hover:bg-primary/5"
                        onClick={() => copyCurlToggleAlert(selectedCompany.id)}
                      >
                        <Copy className="w-3.5 h-3.5" /> cURL Toggle Alerta n8n
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => openEditUser(selectedCompany)}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" /> Editar Configuración Real
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="map" className="outline-none space-y-4 overflow-hidden">
              <div className="flex justify-between items-center bg-card border border-border/30 p-3 rounded-xl flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Map className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Capa de Cobertura Geográfica</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-primary/20 hover:bg-primary/5 h-8 text-[11px] font-bold uppercase tracking-wider"
                    onClick={() => setImportDialogOpen(true)}
                  >
                    <FileUp className="w-3.5 h-3.5" /> Importar JSON
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-primary/20 hover:bg-primary/5 h-8 text-[11px] font-bold uppercase tracking-wider"
                    onClick={handleCopyZones}
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar JSON
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-primary/20 hover:bg-primary/5 h-8 text-[11px] font-bold uppercase tracking-wider"
                    onClick={handleExportZones}
                    disabled={isExporting}
                  >
                    {isExporting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Exportar Backup
                  </Button>
                </div>
              </div>
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden h-[600px] shadow-inner relative z-0">
                <CoverageMap companyId={selectedCompany.id} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden animate-in fade-in duration-500">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="px-6 py-4 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-bold">Empresa</th>
                <th className="px-6 py-4 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-bold">WhatsApp</th>
                <th className="px-6 py-4 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-bold w-[120px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {companies.map((c) => (
                <tr 
                  key={c.id} 
                  className="hover:bg-primary/5 transition-colors group cursor-pointer"
                  onClick={() => setSelectedCompany(c)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">{c.company_name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground/60 uppercase">UID: {c.id.split('-')[0]}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1 px-2 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[11px] font-medium flex items-center gap-1.5">
                        <Phone className="w-3 h-3" /> {c.ycloud_phone}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar configuración"
                        className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                        onClick={() => openEditUser(c)}
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-card border-border/40">
                        <DropdownMenuItem onClick={() => setSelectedCompany(c)} className="cursor-pointer gap-2">
                          <Eye className="w-4 h-4" /> Ver panel detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditUser(c)} className="cursor-pointer gap-2">
                          <Settings2 className="w-4 h-4" /> Editar configuración
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onSimulate?.(c.id, c.company_name)}
                          className="cursor-pointer gap-2 text-primary focus:text-primary font-bold"
                        >
                          <WandSparkles className="w-4 h-4" /> Simular esta empresa
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border/20" />
                        <DropdownMenuItem onClick={() => copyWebhook(c.webhook_id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> Copiar Webhook
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlDerivacion(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Derivación
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlFactibilidad(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Factibilidad
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlToggleAlert(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Toggle Alerta
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlAlertStatus(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Estado Alerta
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlSistemaAlerta(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Sistema Alerta
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyAlertWebhookUrl(c)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> Webhook Alertas (n8n)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlVerificarTicket(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Verificar Ticket
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyJsonCoberturaN8n(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> JSON Cobertura n8n
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border/20" />
                        <DropdownMenuItem 
                          onClick={() => handleDeleteUser(c.user_id || c.owner_id || "")} 
                          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" /> Eliminar empresa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground italic">
                    No se encontraron empresas configuradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Import Zones Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="border-border/30 bg-card max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-primary" />
              Importar Zonas Masivamente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-primary/5 border border-primary/10 p-3 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-primary shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">¡Atención!</strong> Al importar, se <span className="text-destructive font-bold">borrarán todas las zonas actuales</span> de esta empresa. Acepta dos formatos: un <strong>GeoJSON FeatureCollection</strong> (exportado desde geojson.io u otros) o un array de objetos con <code className="bg-secondary px-1 rounded">name</code> y <code className="bg-secondary px-1 rounded">polygon</code> como [[lng, lat], ...].
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase opacity-60">Pega el JSON aquí</Label>
              <Textarea
                placeholder='[{"name": "Zona A", "polygon": [[-70.6, -33.4], ...]}]'
                className="min-h-[250px] font-mono text-[11px] bg-secondary/30"
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
              />
            </div>

            {(() => {
              try {
                const parsed = JSON.parse(importJson);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-center">
                      <span className="text-[11px] font-bold text-emerald-500">
                        DETECTADAS: {parsed.length} ZONAS PARA IMPORTAR
                      </span>
                    </div>
                  );
                }
              } catch (e) {}
              return null;
            })()}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setImportDialogOpen(false)} disabled={isImporting}>
              Cancelar
            </Button>
            <Button 
              onClick={handleImportZones} 
              disabled={isImporting || !importJson.trim()}
              className="font-bold gap-2"
            >
              {isImporting ? <RotateCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              Confirmar e Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
