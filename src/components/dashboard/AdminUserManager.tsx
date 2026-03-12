import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Trash2, Settings2, Pencil, Building2, KeyRound, Copy, Eye, EyeOff,
  MoreHorizontal, Link2, Phone, Key, Boxes, RotateCw, ChevronLeft, Map, Users as UsersIcon, Settings
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


interface Module {
  id: string;
  name: string;
  description: string | null;
  nocodb_table_id: string;
  nocodb_base_id: string;
  icon: string;
  color: string;
}

interface CompanyConfig {
  id: string;
  company_name: string;
  ycloud_api_key: string;
  ycloud_phone: string;
  webhook_id: string;
  user_id: string | null;
  owner_id?: string;
}

export default function AdminUserManager({ onSimulate }: { onSimulate?: (id: string, name: string) => void }) {
  const [companies, setCompanies] = useState<CompanyConfig[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyConfig | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [userModules, setUserModules] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [newYcloudKey, setNewYcloudKey] = useState("");
  const [newYcloudPhone, setNewYcloudPhone] = useState("");
  const [countryPrefix, setCountryPrefix] = useState("+56");


  // Edit modules
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editModules, setEditModules] = useState<string[]>([]);
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
    webhook_id: ""
  });

  // Reset password
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [resetPwUserId, setResetPwUserId] = useState("");
  const [resetPwValue, setResetPwValue] = useState("");



  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showYcloudKey, setShowYcloudKey] = useState(false);
  const [showEditYcloudKey, setShowEditYcloudKey] = useState(false);

  const { toast } = useToast();
  const webhookBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ycloud-webhook`;

  useEffect(() => {
    fetchCompanies();
    fetchModules();
  }, []);

  const fetchCompanies = async () => {
    setLoading(true);
    const { data: configs } = await supabase.from("company_config").select("*").order("company_name");
    const validConfigs = configs || [];
    setCompanies(validConfigs);

    // Load modules mapped to owners/admins
    const { data: umData } = await supabase.from("user_modules").select("*");
    if (umData) {
      const map: Record<string, string[]> = {};
      umData.forEach((um: any) => {
        if (!map[um.user_id]) map[um.user_id] = [];
        map[um.user_id].push(um.module_id);
      });
      setUserModules(map);
    }
    setLoading(false);
  };

  const fetchModules = async () => {
    const { data } = await supabase.from("modules").select("*").order("name");
    setModules(data || []);
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
      }

      // 2. Assign modules
      if (selectedModules.length > 0) {
        const inserts = selectedModules.map(moduleId => ({ user_id: userId, module_id: moduleId }));
        await supabase.from("user_modules").insert(inserts);
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
    setSelectedModules([]); setNewYcloudKey(""); setNewYcloudPhone("");
    setDialogOpen(false);
    fetchCompanies();
    setLoading(false);
  };

  const handleDeleteUser = async (userId: string) => {
    // Also delete company config
    if (companyConfigs[userId]) {
      await supabase.from("company_config").delete().eq("id", companyConfigs[userId].id);
    }
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
    if (error || data?.error) {
      toast({ title: "Error", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Empresa eliminada" });
      fetchCompanies();
    }
  };

  // Modules
  const openEditModules = (userId: string) => {
    setEditingUserId(userId);
    setEditModules(userModules[userId] || []);
    setEditDialogOpen(true);
  };
  const handleSaveModules = async () => {
    if (!editingUserId) return;
    setLoading(true);
    await supabase.from("user_modules").delete().eq("user_id", editingUserId);
    if (editModules.length > 0) {
      const inserts = editModules.map(moduleId => ({ user_id: editingUserId, module_id: moduleId }));
      await supabase.from("user_modules").insert(inserts);
    }
    toast({ title: "Configuración actualizada" });
    setEditDialogOpen(false);
    fetchCompanies();
    setLoading(false);
  };
  const toggleModule = (moduleId: string) => setSelectedModules(prev => prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]);
  const toggleEditModule = (moduleId: string) => setEditModules(prev => prev.includes(moduleId) ? prev.filter(m => m !== moduleId) : [...prev, moduleId]);

  // Edit user/company
  const openEditUser = (company: CompanyConfig) => {
    setEditUserData({
      user_id: company.user_id || company.owner_id || "", // Use owner_id if user_id is null
      display_name: company.company_name || "",
      email: "", // Email is not directly in company_config, will need to fetch if required for edit
      ycloud_api_key: company.ycloud_api_key || "",
      ycloud_phone: company.ycloud_phone || "",
      config_id: company.id,
      webhook_id: company.webhook_id || ""
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
            company_name: editUserData.display_name
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


  const copyWebhook = (webhookId: string) => {
    navigator.clipboard.writeText(`${webhookBaseUrl}?cid=${webhookId}`);
    toast({ title: "URL copiada", description: "Pégala en la configuración de webhook de YCloud" });
  };

  const copyCurlDerivacion = (companyId: string) => {
    const curl = `curl -X POST "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-ticket" \\
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

  const copyCurlCobertura = (companyId: string) => {
    const curl = `curl -X POST "${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-coverage" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzEwMzgwMDAsImV4cCI6MTkyODgwNDQwMH0.cJkRSxkbTHXdUBJRT7GMPP2Qid9bROifddFxkMFu_hk" \\
  -d '{
    "company_id": "${companyId}",
    "lat": {{ $json.lat }},
    "lng": {{ $json.lng }}
  }'`;
    navigator.clipboard.writeText(curl);
    toast({ title: "¡Copiado!", description: "cURL de Cobertura copiado al portapapeles" });
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
                        placeholder="Contraseña segura"
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

              {/* Sección Módulos */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-border/20">
                  <Boxes className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Módulos Asignados</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {modules.map(mod => (
                    <button key={mod.id} type="button" onClick={() => toggleModule(mod.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all border ${selectedModules.includes(mod.id)
                        ? "bg-primary/20 text-primary border-primary/40 shadow-sm"
                        : "bg-secondary/40 text-muted-foreground border-border/30 hover:bg-secondary/60"
                        }`}>
                      {mod.name}
                    </button>
                  ))}
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

      {/* Edit Modules Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="border-border/30 bg-card">
          <DialogHeader><DialogTitle>Asignar Módulos</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2">
              {modules.map(mod => (
                <button key={mod.id} type="button" onClick={() => toggleEditModule(mod.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${editModules.includes(mod.id) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}>{mod.name}</button>
              ))}
            </div>
            <Button onClick={handleSaveModules} disabled={loading} className="w-full">{loading ? "Guardando..." : "Guardar Módulos"}</Button>
          </div>
        </DialogContent>
      </Dialog>

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
        <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
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
                onOpenEditModules={(userId) => openEditModules(userId)} // Pass the handler
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

                    <div className="flex gap-3 pt-2">
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
                        onClick={() => copyCurlCobertura(selectedCompany.id)}
                      >
                        <Copy className="w-3.5 h-3.5" /> cURL Cobertura
                      </Button>
                    </div>
                  </div>
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
                      webhook_id: selectedCompany.webhook_id
                    });
                    setEditUserDialogOpen(true);
                  }}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" /> Editar Configuración Real
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="map" className="outline-none">
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden h-[600px]">
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
                <th className="px-6 py-4 text-[11px] uppercase tracking-wider text-muted-foreground/60 font-bold">Módulos</th>
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
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(userModules[c.user_id || c.owner_id || ""] || []).map(modId => {
                        const mod = modules.find(m => m.id === modId);
                        return mod ? (
                          <Badge key={modId} variant="outline" className="text-[10px] h-5 bg-primary/5 text-primary border-primary/20">
                            {mod.name}
                          </Badge>
                        ) : null;
                      })}
                      {(!userModules[c.user_id || c.owner_id || ""] || userModules[c.user_id || c.owner_id || ""].length === 0) && (
                        <span className="text-xs text-muted-foreground/50 italic">Sin módulos</span>
                      )}
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
                        <DropdownMenuSeparator className="bg-border/20" />
                        <DropdownMenuItem onClick={() => copyWebhook(c.webhook_id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> Copiar Webhook
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlDerivacion(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Derivación
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyCurlCobertura(c.id)} className="cursor-pointer gap-2">
                          <Copy className="w-4 h-4" /> cURL Cobertura
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
    </div>
  );
}
