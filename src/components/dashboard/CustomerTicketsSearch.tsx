import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Ticket, Loader2, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export function CustomerTicketsSearch({ defaultRut = "" }: { defaultRut?: string }) {
    const [rut, setRut] = useState(defaultRut);
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [openSheet, setOpenSheet] = useState(false);
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
    const [ticketNotes, setTicketNotes] = useState<any[]>([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const { toast } = useToast();

    const formatRut = (value: string) => {
        const cleaned = value.replace(/[^0-9kK]/g, '').toUpperCase();
        if (cleaned.length <= 1) return cleaned;
        return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
    };

    const searchTickets = async () => {
        if (!rut.trim()) return;
        setLoading(true);
        setSearched(true);
        try {
            const { data, error } = await supabase
                .from("tickets")
                .select("*")
                .eq("customer_rut", rut.trim())
                .order("created_at", { ascending: false });

            if (error) throw error;
            setTickets(data || []);
            setOpenSheet(true);
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'abierto': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'en_progreso': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            case 'resuelto': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'cerrado': return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
            default: return 'bg-primary/10 text-primary border-primary/20';
        }
    };

    const toggleTicketDetails = async (ticketId: string) => {
        if (expandedTicketId === ticketId) {
            setExpandedTicketId(null);
            return;
        }

        setExpandedTicketId(ticketId);
        setLoadingNotes(true);
        try {
            const { data, error } = await supabase
                .from("ticket_notes")
                .select("*")
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: true });

            if (error) throw error;
            setTicketNotes(data || []);
        } catch (err: any) {
            toast({ title: "Error", description: "No se pudieron cargar las notas.", variant: "destructive" });
        } finally {
            setLoadingNotes(false);
        }
    };

    return (
        <>
            <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary" />
                        Buscador de Tickets
                    </h4>
                </div>
                <div className="bento-card p-4 space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                            <Input
                                placeholder="Buscar por RUT..."
                                value={rut}
                                onChange={(e) => setRut(formatRut(e.target.value))}
                                onKeyDown={(e) => e.key === "Enter" && searchTickets()}
                                className="pl-9 h-9 text-[12px] bg-card border-border/50 hover:border-primary/20 focus-visible:ring-primary"
                            />
                        </div>
                        <Button onClick={searchTickets} disabled={loading || !rut.trim()} size="icon" className="h-9 w-9 shrink-0">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        </Button>
                    </div>

                    {searched && !loading && tickets.length === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">No se encontraron tickets para este RUT.</p>
                    )}

                    {searched && !loading && tickets.length > 0 && (
                        <Button onClick={() => setOpenSheet(true)} variant="outline" className="w-full h-8 text-[11px] justify-between border-primary/20 hover:bg-primary/10 text-primary">
                            Ver {tickets.length} ticket{tickets.length > 1 ? 's' : ''} encontrados
                            <Ticket className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            <Sheet open={openSheet} onOpenChange={setOpenSheet}>
                <SheetContent side="right" className="w-[400px] sm:w-[540px] border-l border-border bg-background/95 backdrop-blur-xl">
                    <SheetHeader className="mb-6">
                        <SheetTitle>Historial de Tickets</SheetTitle>
                        <SheetDescription>
                            Mostrando tickets asociados al RUT <strong className="text-foreground">{rut}</strong>
                        </SheetDescription>
                    </SheetHeader>

                    <div className="overflow-y-auto pr-2 space-y-4 max-h-[calc(100vh-120px)]">
                        {tickets.map(ticket => (
                            <div
                                key={ticket.id}
                                onClick={() => toggleTicketDetails(ticket.id)}
                                className={`p-4 rounded-xl border space-y-3 cursor-pointer transition-all duration-300 ${expandedTicketId === ticket.id ? 'bg-primary/5 border-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.05)]' : 'bg-card border-border/50 hover:border-primary/30'}`}
                            >
                                <div className="flex justify-between items-start gap-4">
                                    <h4 className={`text-[13px] font-bold leading-tight ${expandedTicketId === ticket.id ? 'text-primary' : ''}`}>{ticket.title}</h4>
                                    <Badge variant="outline" className={"text-[10px] uppercase tracking-wider shrink-0 " + getStatusColor(ticket.status)}>
                                        {ticket.status.replace("_", " ")}
                                    </Badge>
                                </div>

                                <p className={`text-[12px] text-muted-foreground leading-relaxed ${expandedTicketId === ticket.id ? '' : 'line-clamp-3'}`}>
                                    {ticket.description}
                                </p>

                                <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 border-t border-border/30 pt-3 mt-3">
                                    <span className="font-medium tracking-wide">ID: {ticket.id.split('-')[0]}</span>
                                    <span>{format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm")}</span>
                                </div>

                                {expandedTicketId === ticket.id && (
                                    <div className="mt-4 pt-4 border-t border-primary/10 space-y-3 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                                        <h5 className="text-[11px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-primary" /> Historial de Notas
                                        </h5>
                                        {loadingNotes ? (
                                            <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
                                        ) : ticketNotes.length > 0 ? (
                                            <div className="space-y-2">
                                                {ticketNotes.map(note => (
                                                    <div key={note.id} className="bg-card p-3 rounded-lg border border-border/50 text-[11px] shadow-sm">
                                                        <div className="flex justify-between items-center mb-1 text-muted-foreground">
                                                            <strong className="text-foreground">{note.author_name || 'Sistema'}</strong>
                                                            <span>{format(new Date(note.created_at), "dd MMM HH:mm")}</span>
                                                        </div>
                                                        <p className="text-muted-foreground whitespace-pre-wrap">{note.content}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center p-3 text-[11px] text-muted-foreground bg-card rounded-lg border border-border/50">
                                                No hay notas registradas para este ticket.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {tickets.length === 0 && (
                            <div className="text-center py-12">
                                <Ticket className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">No hay tickets registrados</p>
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}
