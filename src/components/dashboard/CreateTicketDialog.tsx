import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CreateTicketDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    conversation: any;
}

export function CreateTicketDialog({ open, onOpenChange, conversation }: CreateTicketDialogProps) {
    const [rut, setRut] = useState("");
    const [motivo, setMotivo] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const formatRut = (value: string) => {
        const cleaned = value.replace(/[^0-9kK]/g, '').toUpperCase();
        if (cleaned.length <= 1) return cleaned;
        return `${cleaned.slice(0, -1)}-${cleaned.slice(-1)}`;
    };

    const handleCreateTicket = async () => {
        if (!rut.trim() || !motivo.trim()) {
            toast({ title: "Campos requeridos", description: "Por favor ingresa RUT y Motivo.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.from("tickets").insert({
                company_id: conversation.company_id,
                conversation_id: conversation.id,
                title: motivo,
                description: `Ticket escalado desde chat. \n\nRUT: ${rut}`,
                customer_rut: rut,
                customer_phone: conversation.wa_id,
                customer_name: conversation.profile_name,
                status: "abierto",
                priority: "media",
                category: "soporte_tecnico",
            });

            if (error) throw error;

            toast({ title: "Ticket Creado", description: `Se ha escalado el ticket para el RUT ${rut} con éxito.` });
            setRut("");
            setMotivo("");
            onOpenChange(false);
        } catch (error: any) {
            toast({ title: "Error al crear ticket", description: error.message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Escalar a Ticket Central</DialogTitle>
                    <DialogDescription>
                        Crea un nuevo ticket de soporte manual asociado a este cliente.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="rut" className="text-right">
                            RUT
                        </Label>
                        <Input
                            id="rut"
                            placeholder="12.345.678-9"
                            value={rut}
                            onChange={(e) => setRut(formatRut(e.target.value))}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="motivo" className="text-right">
                            Motivo
                        </Label>
                        <Input
                            id="motivo"
                            placeholder="Breve descripción del problema..."
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            className="col-span-3"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleCreateTicket} disabled={loading}>
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Crear Ticket"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
