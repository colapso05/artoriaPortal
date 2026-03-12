import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Layers, Trash2, Link, ArrowLeft, Building2, FolderOpen, Database, Pencil, Bot, ToggleLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Module {
  id: string;
  name: string;
  description: string | null;
  nocodb_table_id: string;
  nocodb_base_id: string;
  icon: string;
  color: string;
}

interface UserToggle {
  id: string;
  user_id: string;
  name: string;
  nocodb_table_id: string;
}

interface Empresa {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export default function AdminModuleManager() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [userModulesMap, setUserModulesMap] = useState<Record<string, string[]>>({});
  const [userToggles, setUserToggles] = useState<UserToggle[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);

  // Create module form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tableId, setTableId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [nocodbUrl, setNocodbUrl] = useState("");
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create toggle form
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [toggleName, setToggleName] = useState("Control de Agente");
  const [toggleUrl, setToggleUrl] = useState("");
  const [toggleTableId, setToggleTableId] = useState("");

  // Edit module
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editModule, setEditModule] = useState<Module | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTableId, setEditTableId] = useState("");
  const [editBaseId, setEditBaseId] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [{ data: profilesData }, { data: modulesData }, { data: umData }, { data: togglesData }] = await Promise.all([
      supabase.from("profiles").select("id, user_id, display_name, email").order("display_name"),
      supabase.from("modules").select("*").order("name"),
      supabase.from("user_modules").select("*"),
      supabase.from("user_toggles").select("*"),
    ]);
    setEmpresas(profilesData || []);
    setAllModules(modulesData || []);
    setUserToggles(togglesData || []);
    if (umData) {
      const map: Record<string, string[]> = {};
      umData.forEach((um: any) => {
        if (!map[um.user_id]) map[um.user_id] = [];
        map[um.user_id].push(um.module_id);
      });
      setUserModulesMap(map);
    }
  };

  const empresaModules = selectedEmpresa
    ? allModules.filter(m => (userModulesMap[selectedEmpresa.user_id] || []).includes(m.id))
    : [];

  const empresaToggles = selectedEmpresa
    ? userToggles.filter(t => t.user_id === selectedEmpresa.user_id)
    : [];

  const parseNocoDbUrl = (url: string) => {
    const match = url.match(/(?:#\/(?:nc\/)?)([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)/);
    if (match) {
      setBaseId(match[1]);
      setTableId(match[2]);
      toast({ title: "URL parseada", description: `Base: ${match[1]}, Table: ${match[2]}` });
    } else {
      toast({ title: "No se pudo parsear la URL", variant: "destructive" });
    }
  };

  const parseToggleUrl = (url: string) => {
    const match = url.match(/(?:#\/(?:nc\/)?)([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)/);
    if (match) {
      setToggleTableId(match[2]);
      toast({ title: "URL parseada", description: `Table ID: ${match[2]}` });
    } else {
      toast({ title: "No se pudo parsear la URL", variant: "destructive" });
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpresa) return;
    setLoading(true);

    const { data: newMod, error } = await supabase.from("modules").insert({
      name,
      description: description || null,
      nocodb_table_id: tableId,
      nocodb_base_id: baseId,
    }).select().single();

    if (error || !newMod) {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    await supabase.from("user_modules").insert({
      user_id: selectedEmpresa.user_id,
      module_id: newMod.id,
    });

    toast({ title: "Módulo creado y asignado" });
    setName(""); setDescription(""); setTableId(""); setBaseId(""); setNocodbUrl("");
    setModuleDialogOpen(false);
    fetchData();
    setLoading(false);
  };

  const handleCreateToggle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpresa || !toggleTableId) return;
    setLoading(true);

    const { error } = await supabase.from("user_toggles").insert({
      user_id: selectedEmpresa.user_id,
      name: toggleName,
      nocodb_table_id: toggleTableId,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Toggle creado y asignado" });
      setToggleName("Control de Agente"); setToggleUrl(""); setToggleTableId("");
      setToggleDialogOpen(false);
      fetchData();
    }
    setLoading(false);
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!selectedEmpresa) return;
    await supabase.from("user_modules").delete()
      .eq("user_id", selectedEmpresa.user_id)
      .eq("module_id", moduleId);

    const { data: otherUsers } = await supabase.from("user_modules").select("id").eq("module_id", moduleId);
    if (!otherUsers || otherUsers.length === 0) {
      await supabase.from("modules").delete().eq("id", moduleId);
    }

    toast({ title: "Módulo eliminado" });
    fetchData();
  };

  const handleDeleteToggle = async (toggleId: string) => {
    await supabase.from("user_toggles").delete().eq("id", toggleId);
    toast({ title: "Toggle eliminado" });
    fetchData();
  };

  const openEditModule = (mod: Module) => {
    setEditModule(mod);
    setEditName(mod.name);
    setEditDescription(mod.description || "");
    setEditTableId(mod.nocodb_table_id);
    setEditBaseId(mod.nocodb_base_id);
    setEditDialogOpen(true);
  };

  const handleEditModule = async () => {
    if (!editModule) return;
    setLoading(true);
    const { error } = await supabase.from("modules").update({
      name: editName,
      description: editDescription || null,
      nocodb_table_id: editTableId,
      nocodb_base_id: editBaseId,
    }).eq("id", editModule.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Módulo actualizado" });
      setEditDialogOpen(false);
      fetchData();
    }
    setLoading(false);
  };

  // --- RENDER: Empresa list ---
  if (!selectedEmpresa) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" />
            Módulos por Empresa
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empresas.map(emp => {
            const modCount = (userModulesMap[emp.user_id] || []).length;
            const togCount = userToggles.filter(t => t.user_id === emp.user_id).length;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedEmpresa(emp)}
                className="text-left rounded-xl border border-border/30 bg-card/50 p-5 hover:border-primary/40 hover:bg-primary/5 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{emp.display_name || emp.email || "Sin nombre"}</h3>
                    <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                    <div className="flex items-center gap-1">
                      <FolderOpen className="w-4 h-4" />
                      <span className="text-sm font-medium">{modCount}</span>
                    </div>
                    {togCount > 0 && (
                      <div className="flex items-center gap-1">
                        <ToggleLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">{togCount}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {empresas.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No hay empresas registradas.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDER: Inside an Empresa ---
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedEmpresa(null)} className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {selectedEmpresa.display_name || selectedEmpresa.email}
            </h2>
            <p className="text-sm text-muted-foreground">
              {empresaModules.length} módulo{empresaModules.length !== 1 ? "s" : ""}, {empresaToggles.length} toggle{empresaToggles.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2 h-10 px-4">
              <Plus className="w-4 h-4" />
              Agregar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setModuleDialogOpen(true)} className="gap-2">
              <Database className="w-4 h-4" />
              Módulo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setToggleDialogOpen(true)} className="gap-2">
              <Bot className="w-4 h-4" />
              Toggle de Agente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Create Module Dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent className="border-border/30 bg-card">
          <DialogHeader>
            <DialogTitle>Crear Módulo para {selectedEmpresa.display_name || selectedEmpresa.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateModule} className="space-y-4 mt-4">
            <div>
              <Label>Nombre del módulo</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Gestión de Casos" className="mt-1" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción breve..." className="mt-1" />
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 space-y-3">
              <Label className="flex items-center gap-2">
                <Link className="w-4 h-4" />
                Pegar URL de NocoDB (auto-extrae IDs)
              </Label>
              <Input
                value={nocodbUrl}
                onChange={(e) => {
                  setNocodbUrl(e.target.value);
                  if (e.target.value.length > 20) parseNocoDbUrl(e.target.value);
                }}
                placeholder="http://.../#/nc/base_id/table_id/..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>NocoDB Table ID</Label>
              <Input value={tableId} onChange={(e) => setTableId(e.target.value)} required placeholder="Se auto-completa con la URL" className="mt-1" />
            </div>
            <div>
              <Label>NocoDB Base ID</Label>
              <Input value={baseId} onChange={(e) => setBaseId(e.target.value)} required placeholder="Se auto-completa con la URL" className="mt-1" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Creando..." : "Crear Módulo"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Toggle Dialog */}
      <Dialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <DialogContent className="border-border/30 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-500" />
              Crear Toggle de Agente
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateToggle} className="space-y-4 mt-4">
            <div>
              <Label>Nombre</Label>
              <Input value={toggleName} onChange={(e) => setToggleName(e.target.value)} required placeholder="Ej: Control de Agente" className="mt-1" />
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <Label className="flex items-center gap-2 text-emerald-600">
                <Link className="w-4 h-4" />
                Pegar URL de NocoDB con campo "Activo"
              </Label>
              <Input
                value={toggleUrl}
                onChange={(e) => {
                  setToggleUrl(e.target.value);
                  if (e.target.value.length > 20) parseToggleUrl(e.target.value);
                }}
                placeholder="http://.../#/nc/base_id/table_id/..."
                className="mt-1"
              />
              {toggleTableId && (
                <p className="text-xs text-muted-foreground">Table ID: <span className="font-mono">{toggleTableId}</span></p>
              )}
            </div>
            <Button type="submit" disabled={loading || !toggleTableId} className="w-full">
              {loading ? "Creando..." : "Crear Toggle"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Module Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="border-border/30 bg-card">
          <DialogHeader>
            <DialogTitle>Editar Módulo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>NocoDB Table ID</Label>
              <Input value={editTableId} onChange={(e) => setEditTableId(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>NocoDB Base ID</Label>
              <Input value={editBaseId} onChange={(e) => setEditBaseId(e.target.value)} className="mt-1" />
            </div>
            <Button onClick={handleEditModule} disabled={loading} className="w-full">
              {loading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toggle cards */}
      {empresaToggles.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Toggles de Agente
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresaToggles.map(tog => (
              <div key={tog.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 group hover:border-emerald-500/40 transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                      <ToggleLeft className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{tog.name}</h3>
                      <span className="text-xs text-muted-foreground font-mono">{tog.nocodb_table_id}</span>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar toggle?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará "{tog.name}" de esta empresa.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteToggle(tog.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module cards */}
      <div>
        {empresaModules.length > 0 && empresaToggles.length > 0 && (
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Database className="w-4 h-4" />
            Módulos
          </h3>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empresaModules.map(mod => (
            <div key={mod.id} className="rounded-xl border border-border/30 bg-card/50 p-5 group hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Database className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{mod.name}</h3>
                    {mod.description && <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModule(mod)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar módulo?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará "{mod.name}" de esta empresa. Si ninguna otra empresa lo usa, se borrará permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteModule(mod.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-3">
                <span className="text-xs bg-secondary px-2 py-1 rounded text-muted-foreground font-mono">{mod.nocodb_table_id}</span>
              </div>
            </div>
          ))}
          {empresaModules.length === 0 && empresaToggles.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              Esta empresa no tiene módulos ni toggles asignados. Usa el botón "Agregar" para vincular uno.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
