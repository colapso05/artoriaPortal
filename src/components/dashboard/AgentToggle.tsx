import { useState, useEffect, useCallback } from "react";
import { useNocoDb } from "@/hooks/useNocoDb";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bot, Loader2 } from "lucide-react";

interface AgentToggleProps {
  tableId: string;
  name?: string;
}

export default function AgentToggle({ tableId, name }: AgentToggleProps) {
  const { listRecords, updateRecord } = useNocoDb();
  const [active, setActive] = useState(false);
  const [recordId, setRecordId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listRecords(tableId, { limit: 1 });
      if (result.list && result.list.length > 0) {
        const record = result.list[0];
        setRecordId(record.Id);
        setActive(!!record["Activo"]);
      }
    } catch (err: any) {
      toast({ title: "Error cargando estado del agente", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tableId, listRecords, toast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = async (checked: boolean) => {
    if (recordId === null) return;
    setToggling(true);
    setActive(checked);
    try {
      await updateRecord(tableId, { Id: recordId, Activo: checked });
      toast({ title: checked ? "Agente activado" : "Agente desactivado" });
    } catch (err: any) {
      setActive(!checked); // revert
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Cargando estado del agente...</span>
      </div>
    );
  }

  if (recordId === null) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/50 p-6 text-center text-sm text-muted-foreground">
        No se encontró el registro del agente.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/30 bg-card/50 p-6 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
            active ? "bg-emerald-500/15" : "bg-muted/30"
          }`}>
            <Bot className={`w-6 h-6 transition-colors ${active ? "text-emerald-500" : "text-muted-foreground/50"}`} />
          </div>
          <div>
            <h3 className="font-semibold text-base">{name || "Estado del Agente"}</h3>
            <p className="text-sm text-muted-foreground">
              {active ? "El agente está activo y operando" : "El agente está desactivado"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold uppercase tracking-wider ${
            active ? "text-emerald-500" : "text-muted-foreground/50"
          }`}>
            {active ? "Activo" : "Inactivo"}
          </span>
          <Switch
            checked={active}
            onCheckedChange={handleToggle}
            disabled={toggling}
            className="data-[state=checked]:bg-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
