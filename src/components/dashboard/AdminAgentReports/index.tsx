import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, FileText, CheckCircle2, Search, Filter, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AgentFeedback {
  id: string;
  created_at: string;
  conversation_id: string;
  company_id: string;
  reported_by: string;
  reported_by_name: string;
  wrong_response: string;
  expected_response: string;
  error_type: string;
  status: string; // "pendiente", "revisado", "resuelto"
  notes: string;
}

export default function AdminAgentReports() {
  const [reports, setReports] = useState<AgentFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error al cargar reportes", description: error.message, variant: "destructive" });
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("agent_feedback")
      .update({ status: newStatus })
      .eq("id", id);

    if (error) {
      toast({ title: "Error actualizando estado", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Estado actualizado exitosamente" });
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r)));
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendiente":
        return <Badge className="bg-orange-500/20 text-orange-500 hover:bg-orange-500/30">Pendiente</Badge>;
      case "revisado":
        return <Badge className="bg-blue-500/20 text-blue-500 hover:bg-blue-500/30">Revisado</Badge>;
      case "resuelto":
        return <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30">Resuelto</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatErrorType = (type: string) => {
    const map: Record<string, string> = {
      informacion_incorrecta: "Información Incorrecta",
      no_entendio: "No Entendió",
      derivo_mal: "Derivó Mal",
      otro: "Otro",
    };
    return map[type] || type;
  };

  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.reported_by_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.conversation_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.wrong_response?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col h-full bg-background rounded-2xl border border-border/20 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-border/20 glass flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            Reportes de Error de IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Revisión y seguimiento del feedback de los operadores sobre la IA.
          </p>
        </div>

        <div className="flex w-full md:w-auto items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Buscar contenido o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-secondary/50 border-white/5"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] bg-secondary/50 border-white/5">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="revisado">Revisados</SelectItem>
              <SelectItem value="resuelto">Resueltos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="text-center py-10 text-muted-foreground flex flex-col items-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin mb-4" />
            Cargando reportes...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground bg-secondary/20 rounded-xl border border-border/10">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium text-foreground/70">No hay reportes encontrados</p>
            <p className="text-sm">No hay coincidencias con los filtros actuales.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredReports.map((report) => (
              <div key={report.id} className="bento-card p-5 border border-border/30 hover:border-primary/20 transition-colors">
                <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-mono bg-secondary px-2 py-0.5 rounded text-muted-foreground">
                        {report.id.substring(0, 8)}
                      </span>
                      {getStatusBadge(report.status || "pendiente")}
                      <Badge variant="outline" className="text-xs border-white/10">
                        {formatErrorType(report.error_type)}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-2 flex items-center gap-4">
                      <span>Reportado por <strong>{report.reported_by_name || "Usuario Desconocido"}</strong></span>
                      <span>{format(new Date(report.created_at), "dd MMM, HH:mm", { locale: es })}</span>
                      {report.company_id && (
                        <span>Empresa: <span className="font-mono text-[10px]">{report.company_id.substring(0,8)}</span></span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex shrink-0 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-[11px] gap-2 border-white/10 bg-secondary/30 hover:bg-secondary/50"
                      onClick={() => navigate('/dashboard', { state: { view: 'inbox', conversationId: report.conversation_id } })}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Ver Chat
                    </Button>
                    <Select defaultValue={report.status || "pendiente"} onValueChange={(val) => updateStatus(report.id, val)}>
                      <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-white/10">
                        <SelectValue placeholder="Cambiar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente">Pendiente</SelectItem>
                        <SelectItem value="revisado">Revisado</SelectItem>
                        <SelectItem value="resuelto">Resuelto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                       ❌ Respondió Mal
                    </h4>
                    <p className="text-sm whitespace-pre-wrap text-foreground/80 font-medium">
                      {report.wrong_response}
                    </p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
                    <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                      ✅ Debió Responder
                    </h4>
                    <p className="text-sm whitespace-pre-wrap text-foreground/80 font-medium">
                      {report.expected_response}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
