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
  FileUp, AlertCircle, Save, Clock, WandSparkles
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
}

export default function AdminUserManager({ onSimulate }: { onSimulate?: (id: string, name: string) => void }) {
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
    auto_close_message: ""
  });

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

  useEffect(() => {
    fetchCompanies();
  }, []);

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
    if (!isPasswordValid(newPassword)) {
      toast({ title: "Contraseña insegura", description: "La contraseña no cumple los requisitos de seguridad.", variant: "destructive" });
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
      }


    }

    // Notify external webhook
    try {
      await fetch("https://bot.dropptelecom.cl/webhook/artoriaweb", {
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
  const openEditUser = (company: CompanyConfig) => {
    setEditUserData({
      user_id: company.user_id || company.owner_id || "", // Use owner_id if user_id is null
      display_name: company.company_name || "",
      email: "", // Email is not directly in company_config, will need to fetch if required for edit
      ycloud_api_key: company.ycloud_api_key || "",
      ycloud_phone: company.ycloud_phone || "",
      config_id: company.id,
      webhook_id: company.webhook_id || "",
      auto_close_message: company.auto_close_message || ""
    });
    setEditUserDialogOpen(true);
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
            auto_close_message: editUserData.auto_close_message
          })
          .eq("id", editUserData.config_id);
        if (updateConfigError) throw new Error(updateConfigError.message);
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
      const data = JSON.parse(importJson);
      if (!Array.isArray(data)) throw new Error("El JSON debe ser un array de zonas.");

      const zonesToInsert = data.map((z: any) => {
        if (!z.name || !Array.isArray(z.polygon)) throw new Error(`Zona sin nombre o polígono inválido: ${JSON.stringify(z)}`);
        
        // Invertir [lng, lat] -> [lat, lng]
        const invertedPolygon = z.polygon.map((p: any) => {
          if (!Array.isArray(p) || p.length < 2) return p;
          return [p[1], p[0]]; // [lng, lat] -> [lat, lng]
        });

        return {
          company_id: selectedCompany.id,
          name: z.name,
          polygon: invertedPolygon,
          color: z.color || "#3b82f6", // Default blue
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
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
  -d '{
    "company_id": "${companyId}",
    "wa_id": "{{ $json.wa_id }}",
    "customer_name": "{{ $json.customer_name }}",
    "rut": "{{ $json.rut }}",
    "reason": "{{ $json.reason }}",
    "category": "{{ $json.category }}",
    "assigned_role": "{{ $json.assigned_role }}"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Derivación copiado al portapapeles" });
  };

  const copyCurlToggleAlert = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/toggle-alert" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
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
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
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
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
  -d '{"company_id": "${companyId}"}'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Estado Alerta copiado al portapapeles" });
  };

  const copyCurlSistemaAlerta = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/check-coverage" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
  -d '{
    "company_id": "${companyId}",
    "lat": -33.5281408,
    "lng": -70.6984815,
    "mode": "alert"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Sistema Alerta copiado al portapapeles" });
  };

  const copyCurlVerificarTicket = (companyId: string) => {
    const curl = `curl -X POST "http://192.168.102.3:8000/functions/v1/check-ticket" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
  -d '{
    "company_id": "${companyId}",
    "wa_id": "+56912345678"
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Verificar Ticket copiado al portapapeles" });
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
              {editUserData.config_id && (
                <div className="pt-2 border-t border-border/10 mt-2 space-y-2">
                  <Label>Webhook Derivación de Tickets (Dev)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={`POST ${import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL'}/functions/v1/create-ticket`} className="bg-secondary/30 text-[11px] font-mono text-muted-foreground" />
                  </div>
                  <div className="flex gap-2">
                    <Input readOnly value={`Authorization: Bearer SERVICE_ROLE_KEY`} className="bg-secondary/30 text-[11px] font-mono text-muted-foreground" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copyDerivationTemplate()} title="Copiar Plantilla JSON">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-border/10 mt-2 space-y-2">
                <Label>Mensaje de cierre automático (72h)</Label>
                <Textarea 
                  value={editUserData.auto_close_message} 
                  onChange={(e) => setEditUserData(prev => ({ ...prev, auto_close_message: e.target.value }))}
                  placeholder="El mensaje predeterminado se usará si este campo está vacío."
                  className="min-h-[100px] text-xs"
                />
                <p className="text-[10px] text-muted-foreground italic">Este mensaje se enviará automáticamente cuando un ticket lleve 72h sin actividad.</p>
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
                  <DropdownMenuItem onClick={() => copyCurlVerificarTicket(selectedCompany.id)} className="cursor-pointer gap-2">
                    <Copy className="w-4 h-4" /> cURL Verificar Ticket
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
                onOpenResetPassword={(userId) => openResetPassword(userId)} // Pass the handler
                onSimulate={onSimulate} // Pass through if available
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

              <div className="rounded-xl border border-border/30 bg-card p-6 space-y-4">
                <div className="flex items-center gap-2 border-b border-border/10 pb-3">
                  <Clock className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Automatización de Cierre</h3>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase">Mensaje de cierre automático (72h)</Label>
                  <div className="bg-muted/10 rounded-md p-3 border border-border/20 min-h-[80px]">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap italic">
                      {selectedCompany.auto_close_message || "Usando mensaje predeterminado del sistema (72h sin actividad)..."}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">Este mensaje se enviará automáticamente si el ticket no tiene actividad por 72 horas.</p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => {
                    setEditUserData({
                      user_id: selectedCompany.user_id || selectedCompany.owner_id || "",
                      display_name: selectedCompany.company_name,
                      email: "", // We don't have email in config directly, but we can fetch it if needed
                      ycloud_api_key: selectedCompany.ycloud_api_key,
                      ycloud_phone: selectedCompany.ycloud_phone,
                      config_id: selectedCompany.id,
                      webhook_id: selectedCompany.webhook_id,
                      auto_close_message: selectedCompany.auto_close_message || ""
                    });
                    setEditUserDialogOpen(true);
                  }}
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
                <strong className="text-foreground">¡Atención!</strong> Al importar, se <span className="text-destructive font-bold">borrarán todas las zonas actuales</span> de esta empresa para reemplazarlas por las nuevas. El formato debe ser un array de objetos JSON con <code className="bg-secondary px-1 rounded">name</code> y <code className="bg-secondary px-1 rounded">polygon</code> como [[lng, lat], ...].
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
