import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  KeyRound,
  Shield,
  ShieldCheck,
  UserCog,
  Eye,
  EyeOff,
  Boxes,
} from "lucide-react";

const generatePassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

interface CompanyUser {
  user_id: string;
  role: string;
  email: string;
  display_name: string;
  rut?: string;
  phone?: string;
  start_hour?: string;
  end_hour?: string;
  must_change_password: boolean;
  operator_roles?: string[]; // Para la lista de especialidades de los operadores
  created_at: string;
  is_online?: boolean; // We'll simulate this for now
}

const ROLE_CONFIG = {
  administrador: {
    label: "Administrador",
    icon: ShieldCheck,
    color: "bg-red-500/15 text-red-500 border-red-500/30",
    order: 1,
    permissions: ["Control total", "Gestión de personal", "Configuración ISP"],
  },
  supervisor: {
    label: "Supervisor",
    icon: Shield,
    color: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    order: 2,
    permissions: ["Monitorizar chats", "Reasignar tickets", "Ver historial"],
  },
  operador: {
    label: "Operador",
    icon: UserCog,
    color: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    order: 3,
    permissions: ["Responder chats", "Resolver tickets", "Atención cliente"],
  },
};

interface Props {
  companyId: string;
  companyName: string;
  onOpenEditModules?: (userId: string) => void;
  onOpenResetPassword?: (userId: string) => void;
  onSimulate?: (userId: string, name: string) => void;
}

export default function CompanyTeamManager({ 
  companyId, 
  companyName,
  onOpenEditModules,
  onOpenResetPassword,
  onSimulate 
}: Props) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<string>("operador");
  const [operatorRoles, setOperatorRoles] = useState<string[]>([]);
  const [newRut, setNewRut] = useState("");
  const [countryPrefix, setCountryPrefix] = useState("+56");
  const [newPhone, setNewPhone] = useState("");
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("18:00");

  // Edit dialog
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<CompanyUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<string>("operador");
  const [editOperatorRoles, setEditOperatorRoles] = useState<string[]>([]);
  const [editRut, setEditRut] = useState("");
  const [editCountryPrefix, setEditCountryPrefix] = useState("+56");
  const [editPhone, setEditPhone] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");

  // Reset password dialog
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetPwUserId, setResetPwUserId] = useState("");
  const [resetPwValue, setResetPwValue] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [companyId]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("manage-company-user", {
        body: { action: "list", company_id: companyId },
      });

      if (error) throw error;

      const sortedUsers = (data.users || []).map((u: any) => ({
        ...u,
        is_online: Math.random() > 0.6 // Simulated connection status
      })).sort((a: any, b: any) => {
        // First by role order (Admin < Sup < Op)
        const orderA = ROLE_CONFIG[a.role as keyof typeof ROLE_CONFIG]?.order || 99;
        const orderB = ROLE_CONFIG[b.role as keyof typeof ROLE_CONFIG]?.order || 99;
        if (orderA !== orderB) return orderA - orderB;
        // Then by connection status
        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
        return 0;
      });

      setUsers(sortedUsers);
    } catch (err: any) {
      toast.error("Error cargando equipo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmail || !newName || !newRut || !newPhone) {
      toast.error("Por favor, completa todos los campos obligatorios (Nombre, Email, RUT y Teléfono).");
      return;
    }
    if (newRole === "operador" && operatorRoles.length === 0) {
      toast.error("Debes seleccionar al menos una especialidad para el Operador (Soporte Técnico, Consultas o Ventas).");
      return;
    }
    
    setSaving(true);
    const fullPhone = `${countryPrefix}${newPhone.replace(/^\+/, '')}`;
    
    try {
      const { data, error } = await supabase.functions.invoke("manage-company-user", {
        body: {
          action: "create",
          company_id: companyId,
          email: newEmail,
          display_name: newName,
          password: newPassword || undefined,
          role: newRole,
          operator_roles: newRole === "operador" ? operatorRoles : [],
          rut: newRut,
          phone: fullPhone,
          start_hour: newStart,
          end_hour: newEnd,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Notify external webhook
      try {
        await fetch("https://bot.dropptelecom.cl/webhook/artoriaweb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "team_member_created",
            company_id: companyId,
            company_name: companyName,
            user_name: newName,
            email: newEmail,
            role: newRole,
            operator_roles: newRole === "operador" ? operatorRoles : [],
            temporary_password: newPassword,
            timestamp: new Date().toISOString()
          })
        });
        console.log("External webhook notified successfully");
      } catch (webhookErr) {
        console.error("Failed to notify external webhook:", webhookErr);
      }

      toast.success("Usuario creado");
      setShowCreate(false);
      setNewEmail("");
      setNewName("");
      setNewPassword("");
      setNewRole("operador");
      setOperatorRoles([]);
      setNewPhone("");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editUser) return;
    if (editRole === "operador" && editOperatorRoles.length === 0) {
      toast.error("Debes seleccionar al menos una especialidad para el Operador (Soporte Técnico, Consultas o Ventas).");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-company-user", {
        body: {
          action: "update",
          company_id: companyId,
          user_id: editUser.user_id,
          email: editEmail !== editUser.email ? editEmail : undefined,
          display_name: editName,
          role: editRole,
          operator_roles: editRole === "operador" ? editOperatorRoles : [],
          rut: editRut,
          phone: editPhone ? `${editCountryPrefix}${editPhone.replace(/^\+/, '')}` : undefined,
          start_hour: editStart,
          end_hour: editEnd,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Usuario actualizado");
      setShowEdit(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("¿Eliminar este usuario del equipo?")) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-company-user", {
        body: { action: "delete", company_id: companyId, user_id: userId },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Usuario eliminado");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwValue || resetPwValue.length < 6) {
      toast.error("Mínimo 6 caracteres");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-company-user", {
        body: {
          action: "update",
          company_id: companyId,
          user_id: resetPwUserId,
          password: resetPwValue,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("Contraseña actualizada");
      setShowResetPw(false);
      setResetPwValue("");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (user: CompanyUser) => {
    setEditUser(user);
    setEditName(user.display_name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditOperatorRoles(user.operator_roles || []);
    setEditRut(user.rut || "");
    setEditPhone(user.phone ? user.phone.replace(/^\+\d+/, '') : "");
    // Simplificación cruda para extraer el código, idealmente debiese buscar en un array
    if (user.phone && user.phone.startsWith("+")) {
      const prefix = user.phone.slice(0, 3); // Puede ser +56 etc..
      setEditCountryPrefix(prefix);
    }
    setEditStart(user.start_hour || "08:00");
    setEditEnd(user.end_hour || "18:00");
    setShowEdit(true);
  };

  const roleConfig = (role: string) => ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] || ROLE_CONFIG.operador;

  return (
    <div className="tour-team-manager">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Equipo — {companyName}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona los usuarios y roles de tu empresa
          </p>
        </div>
        <Button onClick={() => { setShowCreate(true); setNewPassword(generatePassword()); setOperatorRoles([]); setCountryPrefix("+56"); setNewPhone(""); }} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Nuevo Usuario
        </Button>
      </div>

      {/* Permissions legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="rounded-lg border border-border/50 p-3 bg-card/50">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4" />
                <span className="font-semibold text-sm">{cfg.label}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {cfg.permissions.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Users table */}
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card/30">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No hay usuarios en el equipo
                </TableCell>
              </TableRow>
            ) : (
              users.map(u => {
                const rc = roleConfig(u.role);
                const Icon = rc.icon;
                return (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${u.is_online ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-muted-foreground/30'}`} />
                        <div className="flex flex-col">
                          <span className="font-bold text-[13px]">{u.display_name}</span>
                          <span className="text-[10px] text-muted-foreground">{u.rut || 'RUT no reg.'}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{u.email}</span>
                        <span className="text-[10px] text-muted-foreground">{u.phone || 'Sin fono'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={rc.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {rc.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                          <span>🕒</span> {u.start_hour || '08:00'} - {u.end_hour || '18:00'}
                        </div>
                        {u.must_change_password && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] w-fit">
                            Reset req.
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(u)} className="cursor-pointer gap-2">
                          <Pencil className="w-4 h-4" /> Detalle / Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onOpenEditModules?.(u.user_id)} 
                          className="cursor-pointer gap-2 text-sm"
                        >
                          <Boxes className="w-4 h-4" /> Asignar módulos
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onOpenResetPassword?.(u.user_id)} 
                          className="cursor-pointer gap-2 text-sm"
                        >
                          <KeyRound className="w-4 h-4" /> Restablecer contraseña
                        </DropdownMenuItem>
                        {onSimulate && (
                          <DropdownMenuItem 
                            onClick={() => onSimulate(u.user_id, u.display_name)} 
                            className="cursor-pointer gap-2 text-sm text-primary font-medium focus:text-primary"
                          >
                            <Eye className="w-4 h-4" /> Simular vista empresa
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(u.user_id)} className="cursor-pointer gap-2 text-destructive focus:text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Nombre Completo <span className="text-destructive">*</span></Label>
              <Input className="mt-1" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Juan Pérez" required />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Email <span className="text-destructive">*</span></Label>
              <Input className="mt-1" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="juan@isp.cl" required />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">RUT <span className="text-destructive">*</span></Label>
              <Input className="mt-1" value={newRut} onChange={e => setNewRut(e.target.value)} placeholder="12.345.678-9" required />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Teléfono <span className="text-destructive">*</span></Label>
              <div className="flex gap-2 mt-1">
                <Select value={countryPrefix} onValueChange={setCountryPrefix}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue placeholder="Pref" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+56">🇨🇱 +56</SelectItem>
                    <SelectItem value="+54">🇦🇷 +54</SelectItem>
                    <SelectItem value="+51">🇵🇪 +51</SelectItem>
                    <SelectItem value="+57">🇨🇴 +57</SelectItem>
                    <SelectItem value="+52">🇲🇽 +52</SelectItem>
                    <SelectItem value="+34">🇪🇸 +34</SelectItem>
                    <SelectItem value="+1">🇺🇸 +1</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={newPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    if (val.length <= 15) setNewPhone(val);
                  }}
                  placeholder="9 1234 5678"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Contraseña</Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Contraseña Temporal"
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
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Rango Horario de Acceso</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} />
                <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Cargo y Privilegios</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrador">Administrador del ISP</SelectItem>
                  <SelectItem value="supervisor">Supervisor de Operaciones</SelectItem>
                  <SelectItem value="operador">Operador de Turno</SelectItem>
                </SelectContent>
              </Select>
              <div className="mt-2 flex flex-wrap gap-1">
                {roleConfig(newRole).permissions.map(p => (
                  <Badge key={p} variant="secondary" className="text-[9px] py-0">{p}</Badge>
                ))}
              </div>

              {newRole === "operador" && (
                <div className="mt-4 border border-border/40 bg-card p-3 rounded-lg shadow-sm">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 block">
                    Especialidad de Atención (Mínimo 1)
                  </Label>
                  <div className="flex flex-col gap-2">
                    {[
                      { id: "soporte_tecnico", label: "Soporte Técnico" },
                      { id: "consultas", label: "Consultas" },
                      { id: "ventas", label: "Ventas" },
                      { id: "pagos", label: "Pagos" },
                      { id: "consulta_comercial", label: "Consulta Comercial" }
                    ].map(especialidad => (
                      <label key={especialidad.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/30 p-1.5 rounded-md transition-colors border border-transparent hover:border-border/30">
                        <input
                          type="checkbox"
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-background"
                          checked={operatorRoles.includes(especialidad.id)}
                          onChange={(e) => {
                            if (e.target.checked) setOperatorRoles([...operatorRoles, especialidad.id]);
                            else setOperatorRoles(operatorRoles.filter(r => r !== especialidad.id));
                          }}
                        />
                        {especialidad.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !newEmail || !newName || !newRut || !newPhone}>
              {saving ? "Creando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Nombre</Label>
              <Input className="mt-1" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Email</Label>
              <Input className="mt-1" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">RUT</Label>
              <Input className="mt-1" value={editRut} onChange={e => setEditRut(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Teléfono</Label>
              <div className="flex gap-2 mt-1">
                <Select value={editCountryPrefix} onValueChange={setEditCountryPrefix}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue placeholder="Pref" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="+56">🇨🇱 +56</SelectItem>
                    <SelectItem value="+54">🇦🇷 +54</SelectItem>
                    <SelectItem value="+51">🇵🇪 +51</SelectItem>
                    <SelectItem value="+57">🇨🇴 +57</SelectItem>
                    <SelectItem value="+52">🇲🇽 +52</SelectItem>
                    <SelectItem value="+34">🇪🇸 +34</SelectItem>
                    <SelectItem value="+1">🇺🇸 +1</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={editPhone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    if (val.length <= 15) setEditPhone(val);
                  }}
                />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Jornada Laboral</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Input type="time" value={editStart} onChange={e => setEditStart(e.target.value)} />
                <Input type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
              </div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-60">Rol</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrador">Administrador del ISP</SelectItem>
                  <SelectItem value="supervisor">Supervisor de Operaciones</SelectItem>
                  <SelectItem value="operador">Operador de Turno</SelectItem>
                </SelectContent>
              </Select>

              {editRole === "operador" && (
                <div className="mt-4 border border-border/40 bg-card p-3 rounded-lg shadow-sm">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-primary mb-2 block">
                    Especialidad de Atención (Mínimo 1)
                  </Label>
                  <div className="flex flex-col gap-2">
                    {[
                      { id: "soporte_tecnico", label: "Soporte Técnico" },
                      { id: "consultas", label: "Consultas" },
                      { id: "ventas", label: "Ventas" },
                      { id: "pagos", label: "Pagos" },
                      { id: "consulta_comercial", label: "Consulta Comercial" }
                    ].map(especialidad => (
                      <label key={especialidad.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/30 p-1.5 rounded-md transition-colors border border-transparent hover:border-border/30">
                        <input
                          type="checkbox"
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4 bg-background"
                          checked={editOperatorRoles.includes(especialidad.id)}
                          onChange={(e) => {
                            if (e.target.checked) setEditOperatorRoles([...editOperatorRoles, especialidad.id]);
                            else setEditOperatorRoles(editOperatorRoles.filter(r => r !== especialidad.id));
                          }}
                        />
                        {especialidad.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={showResetPw} onOpenChange={setShowResetPw}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nueva contraseña</Label>
            <div className="relative mt-1">
              <Input
                type={showResetPassword ? "text" : "password"}
                value={resetPwValue}
                onChange={(e) => setResetPwValue(e.target.value)}
                placeholder="Mínimo 6 caracteres"
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPw(false)}>Cancelar</Button>
            <Button onClick={handleResetPassword} disabled={saving}>
              {saving ? "Guardando..." : "Cambiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
