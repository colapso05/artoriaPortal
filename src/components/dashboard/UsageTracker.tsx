import { useState, useEffect } from "react";
import { useNocoDb } from "@/hooks/useNocoDb";
import { Progress } from "@/components/ui/progress";
import { Activity, TrendingUp, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const USAGE_TABLE_ID = "mtp05dm0aoyvq94";

interface UsageRecord {
  Cliente: string;
  plan: string;
  "conversaciones_usadas": string | number;
  "Conversaciones Incluidas": string | number;
  [key: string]: any;
}

interface UsageTrackerProps {
  /** If provided, filters to a specific empresa name */
  empresaFilter?: string;
  /** Show all empresas (admin mode) or just one (client mode) */
  mode: "admin" | "client";
}

export default function UsageTracker({ empresaFilter, mode }: UsageTrackerProps) {
  const { listRecords } = useNocoDb();
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsage = async () => {
      setLoading(true);
      setError(null);
      try {
        const query: any = { limit: 100 };
        if (empresaFilter) {
          query.where = `(Cliente,eq,${empresaFilter})`;
        }
        const result = await listRecords(USAGE_TABLE_ID, query);
        setRecords((result.list || []) as unknown as UsageRecord[]);
      } catch (err: any) {
        console.error("Error loading usage:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchUsage();
  }, [empresaFilter, listRecords]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(mode === "client" ? 1 : 3)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive">Error cargando datos de uso: {error}</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No hay datos de uso disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {records.map((record, idx) => {
        const used = Number(record["conversaciones_usadas"] || 0);
        const included = Number(record["Conversaciones Incluidas"] || 1);
        const percentage = Math.min(Math.round((used / included) * 100), 100);
        const isNearLimit = percentage >= 80;
        const isOverLimit = percentage >= 100;

        return (
          <div
            key={idx}
            className="rounded-xl border border-border/30 bg-card/50 p-5 space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isOverLimit
                    ? "bg-destructive/10"
                    : isNearLimit
                    ? "bg-amber-500/10"
                    : "bg-primary/10"
                }`}>
                  <MessageSquare className={`w-5 h-5 ${
                    isOverLimit
                      ? "text-destructive"
                      : isNearLimit
                      ? "text-amber-400"
                      : "text-primary"
                  }`} />
                </div>
                <div>
                    {mode === "admin" && (
                    <p className="text-sm font-semibold">{record.Cliente || "—"}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Plan: <span className="font-medium text-foreground">{record.plan || "—"}</span>
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold tracking-tight ${
                  isOverLimit
                    ? "text-destructive"
                    : isNearLimit
                    ? "text-amber-400"
                    : "text-foreground"
                }`}>
                  {percentage}%
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">uso</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <Progress
                value={percentage}
                className={`h-2 ${
                  isOverLimit
                    ? "[&>div]:bg-destructive"
                    : isNearLimit
                    ? "[&>div]:bg-amber-400"
                    : ""
                }`}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {used} / {included} conversaciones
                </span>
                <span className="text-xs text-muted-foreground">
                  {included - used > 0 ? `${included - used} restantes` : "Límite alcanzado"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
