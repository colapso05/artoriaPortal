import { useState } from "react";
import { Layers, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModuleDataView from "./ModuleDataView";

interface Module {
  id: string;
  name: string;
  description: string | null;
  nocodb_table_id: string;
  nocodb_base_id: string;
  icon: string;
  color: string;
}

interface UserDashboardProps {
  activeModule: Module | null;
  onModuleUpdated?: () => void;
}

export default function UserDashboard({ activeModule, onModuleUpdated }: UserDashboardProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const { toast } = useToast();

  if (!activeModule) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-16 h-16 rounded-2xl bg-secondary/50 flex items-center justify-center mb-5">
          <Layers className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Bienvenido al Portal</h2>
        <p className="text-muted-foreground text-sm text-center max-w-sm">
          Selecciona un módulo en el menú lateral para comenzar a trabajar, o contacta al administrador si no tienes módulos asignados.
        </p>
      </div>
    );
  }

  const startEditing = () => {
    setTitleValue(activeModule.name);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!titleValue.trim()) return;
    try {
      const { error } = await supabase
        .from("modules")
        .update({ name: titleValue.trim() })
        .eq("id", activeModule.id);
      if (error) throw error;
      activeModule.name = titleValue.trim();
      toast({ title: "Título actualizado" });
      setEditingTitle(false);
      onModuleUpdated?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div>
      {/* Module header */}
      <div className="mb-6">
        {editingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              className="text-2xl font-bold h-11 max-w-md"
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-9 w-9 text-emerald-500" onClick={saveTitle}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" onClick={() => setEditingTitle(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 group">
            <h2
              className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
            >
              {activeModule.name}
            </h2>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
              onClick={startEditing}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
        {activeModule.description && (
          <p className="text-muted-foreground text-sm mt-1">{activeModule.description}</p>
        )}
      </div>

      {/* Module data */}
      <ModuleDataView
        key={activeModule.id}
        moduleId={activeModule.id}
        moduleName={activeModule.name}
        tableId={activeModule.nocodb_table_id}
      />
    </div>
  );
}
