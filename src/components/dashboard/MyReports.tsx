import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Clock, CheckCircle, Eye, AlertCircle, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MyReport {
  id: string;
  created_at: string;
  error_type: string;
  status: string;
  wrong_response: string | null;
  expected_response: string | null;
  admin_response: string | null;
  resolved_at: string | null;
}

interface Props {
  userId: string;
  companyId?: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pendiente:  { label: "Pendiente",  color: "bg-muted/60 text-muted-foreground border-border/30",    icon: Clock },
  revisado:   { label: "Revisado",   color: "bg-amber-500/10 text-amber-500 border-amber-500/20",    icon: Eye },
  resuelto:   { label: "Resuelto",   color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: CheckCircle },
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  respuesta_incorrecta: "Respuesta incorrecta",
  no_entendio:          "No entendió",
  tono_inadecuado:      "Tono inadecuado",
  informacion_erronea:  "Información errónea",
  otro:                 "Otro",
};

function CollapseSection({ label, content }: { label: string; content: string | null }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <p className="mt-1.5 text-[12px] text-foreground/80 leading-relaxed bg-secondary/30 rounded-lg px-3 py-2 border border-border/20">
              {content}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MyReports({ userId, companyId }: Props) {
  const [reports, setReports] = useState<MyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .rpc("get_my_feedback_reports", { p_company_id: companyId ?? null });
    setReports(data ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Mis Reportes</h2>
          <p className="text-[12px] text-muted-foreground/70">
            Errores que has reportado al equipo de Artoria
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-16">
          <Inbox className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium opacity-60">No has enviado ningún reporte aún</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0 -mx-1 px-1">
          <div className="space-y-3 pb-4">
            {reports.map((r, i) => {
              const st = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.pendiente;
              const StatusIcon = st.icon;
              const typeLabel = ERROR_TYPE_LABELS[r.error_type] ?? r.error_type;

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-card/60 border border-border/20 rounded-xl px-4 py-3.5 shadow-sm"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 border-primary/20 text-primary bg-primary/5">
                        {typeLabel}
                      </Badge>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.color}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {st.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/75 flex-shrink-0 whitespace-nowrap">
                      {format(new Date(r.created_at), "dd MMM yyyy", { locale: es })}
                    </span>
                  </div>

                  {/* Collapsible sections */}
                  <CollapseSection label="Lo que dijo la IA" content={r.wrong_response} />
                  <CollapseSection label="Lo que esperabas" content={r.expected_response} />

                  {/* Admin response */}
                  <div className="mt-3">
                    {r.admin_response ? (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2.5">
                        <p className="text-[11px] font-bold text-emerald-500 mb-1 flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3" />
                          Respuesta del equipo
                        </p>
                        <p className="text-[12px] text-foreground/80 leading-relaxed">{r.admin_response}</p>
                        {r.resolved_at && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                            Resuelto el {format(new Date(r.resolved_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/75 italic flex items-center gap-1.5">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        En revisión — te notificaremos cuando tengamos una respuesta.
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
