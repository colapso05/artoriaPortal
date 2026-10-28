import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Copy, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDolar } from "@/lib/dolar";
import { BANK_DETAILS } from "@/lib/datosBancarios";

/** Lo que va en el mensaje de la transferencia, para saber a qué corresponde. */
const REFERENCIA = "Saldo de WSP";

const soloDigitos = (t: string) => t.replace(/\D/g, "");
const miles = (n: number) => Math.round(n).toLocaleString("es-CL");
const pesos = (n: number) => "$" + miles(n);
/** "12,34": coma decimal, que es como se escribe acá. */
const dolares = (n: number) => n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaCorta = (iso: string) => {
  // Se arma desde el texto y no con Date: "2026-10-07" como Date es medianoche UTC,
  // y en Chile eso es el día anterior.
  const [a, m, d] = iso.split("-").map(Number);
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return a && m && d ? `${d} ${meses[m - 1]}` : iso;
};

/**
 * Convertidor de pesos a dólares y botón para cargar saldo.
 *
 * Va dentro de la tarjeta del saldo, que es donde nace la pregunta "¿cuánto pongo?".
 * El saldo está en dólares y quien va a transferir piensa en pesos.
 */
export default function CargarSaldo({ empresa }: { empresa?: string }) {
  const { dolar, cargando } = useDolar();
  const { toast } = useToast();
  const [clp, setClp] = useState("");
  const [usd, setUsd] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const monto = Number(soloDigitos(clp)) || 0;
  const mensaje = empresa ? `${REFERENCIA} - ${empresa}` : REFERENCIA;

  /*
   * Dos campos enlazados: se escribe en uno y el otro se calcula.
   *
   * Cada uno guarda lo que se tipeó tal cual y solo el opuesto se recalcula. Si los
   * dos se recalcularan desde un valor común, escribir "12," en dólares reescribiría
   * el campo a "12,00" a mitad de tecla.
   */
  const alEscribirPesos = (texto: string) => {
    const n = Number(soloDigitos(texto)) || 0;
    setClp(n ? miles(n) : "");
    setUsd(n && dolar ? dolares(n / dolar.valor) : "");
  };
  const alEscribirDolares = (texto: string) => {
    setUsd(texto.replace(/[^\d.,]/g, ""));
    const n = parseFloat(texto.replace(/\./g, "").replace(",", "."));
    setClp(Number.isFinite(n) && n > 0 && dolar ? miles(n * dolar.valor) : "");
  };

  const copiar = async (clave: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(clave);
      setTimeout(() => setCopiado(c => (c === clave ? null : c)), 1800);
    } catch {
      toast({ title: "No se pudo copiar", description: "Selecciónalo y cópialo a mano.", variant: "destructive" });
    }
  };

  const copiarTodo = () => {
    const lineas = [
      ...BANK_DETAILS.map(d => `${d.label}: ${d.value}`),
      monto > 0 ? `Monto: ${pesos(monto)}` : null,
      `Mensaje: ${mensaje}`,
    ].filter(Boolean) as string[];
    copiar("todo", lineas.join("\n"));
  };

  return (
    <div className="mt-4 pt-3 border-t border-border/15">
      <div className="flex items-center gap-1.5 mb-2">
        <ArrowLeftRight className="w-3 h-3 text-muted-foreground/50" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">
          Pesos y dólares
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <label className="relative block">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground/50 pointer-events-none">$</span>
          <input
            inputMode="numeric" value={clp} placeholder="CLP"
            onChange={e => alEscribirPesos(e.target.value)}
            aria-label="Monto en pesos chilenos"
            className="w-full h-9 rounded-lg border border-border/30 bg-background/50 pl-6 pr-2 text-[13px] font-semibold tabular-nums focus:outline-none focus:border-primary/50"
          />
        </label>
        <ArrowLeftRight className="w-3 h-3 text-muted-foreground/30" />
        <label className="relative block">
          <input
            inputMode="decimal" value={usd} placeholder="USD" disabled={!dolar}
            onChange={e => alEscribirDolares(e.target.value)}
            aria-label="Monto en dólares"
            className="w-full h-9 rounded-lg border border-border/30 bg-background/50 px-2.5 text-[13px] font-semibold tabular-nums focus:outline-none focus:border-primary/50 disabled:opacity-40"
          />
        </label>
      </div>

      <p className="text-[10.5px] text-muted-foreground/55 mt-1.5 leading-relaxed">
        {dolar ? (
          <>Dólar observado: <strong className="text-foreground/80 tabular-nums">${dolares(dolar.valor)}</strong>
            {" "}({fechaCorta(dolar.fecha)}). Es una referencia: el saldo se mide en dólares.</>
        ) : cargando ? "Consultando el dólar…"
          : "No se pudo consultar el dólar ahora. Puedes cargar saldo igual."}
      </p>

      <Button className="w-full h-9 mt-3 gap-2 text-[12.5px] font-bold" onClick={() => setAbierto(true)}>
        <Landmark className="w-3.5 h-3.5" /> Cargar saldo
      </Button>
      <p className="text-[10.5px] font-semibold text-amber-600 dark:text-amber-400 mt-1.5 leading-snug flex items-start gap-1">
        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
        Se acredita en hasta 24 horas: carga con anticipación.
      </p>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cargar saldo de mensajes</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Transfiere el monto que quieras cargar con los datos de abajo.
            </DialogDescription>
          </DialogHeader>

          {/*
            * El aviso que evita el reclamo: la carga no es instantánea.
            *
            * Va antes que todo lo demás y con el borde marcado, porque es lo que
            * alguien tiene que haber leído antes de que se le acabe el saldo y no lo
            * que le molesta enterarse después.
            */}
          <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/15 px-3.5 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-[12.5px] leading-relaxed">
              <p className="font-bold">El pago puede demorar hasta 24 horas en acreditarse en tu cuenta.</p>
              <p className="mt-0.5">
                Hazlo con anticipación. <strong>Siempre verifica tu saldo de mensajes para no tener problemas.</strong>
              </p>
            </div>
          </div>

          {/*
            * Qué pasa con la plata, dicho sin adornos.
            *
            * Se dice lo que se puede afirmar: el monto transferido es el que se carga y
            * lo único que baja el saldo es lo que cobra Meta. No se dice que la plata
            * "no pasa por Artoria" porque la transferencia va a una cuenta nuestra: ese
            * es el tipo de frase que un cliente desconfía en cuanto lee los datos.
            */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3 text-[12px] leading-relaxed">
            <p>
              <strong>El monto que transfieras es el que se carga a tu saldo, tal cual.</strong>{" "}
              Lo único que se descuenta después es lo que cobra Meta por tus mensajes, y todo ese
              consumo lo ves desglosado en este mismo panel: cuántos mensajes, de qué tipo y
              qué plantillas.
            </p>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Monto a transferir</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/50">$</span>
              <input
                inputMode="numeric" value={clp} placeholder="Por ejemplo, 20.000"
                onChange={e => alEscribirPesos(e.target.value)}
                className="w-full h-10 rounded-xl border border-border/40 bg-background pl-7 pr-3 text-[15px] font-bold tabular-nums focus:outline-none focus:border-primary/50"
              />
            </div>
            {monto > 0 && dolar && (
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                ≈ US$ {dolares(monto / dolar.valor)} al dólar observado de {fechaCorta(dolar.fecha)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border/30 bg-muted/40 divide-y divide-border/20 overflow-hidden">
            {BANK_DETAILS.map(d => (
              <div key={d.label} className="flex items-center justify-between gap-2 px-3.5 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">{d.label}</p>
                  <p className="text-[13px] font-semibold break-all">{d.value}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copiar(d.label, d.value)}>
                  {copiado === d.label ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </Button>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/90 mb-1">
              Escribe esto en el mensaje de la transferencia
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-[13px] font-bold break-all">{mensaje}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copiar("mensaje", mensaje)}>
                {copiado === "mensaje" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          <Button variant="outline" className="w-full h-10 gap-2 text-[12.5px]" onClick={copiarTodo}>
            {copiado === "todo" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copiar todos los datos
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
