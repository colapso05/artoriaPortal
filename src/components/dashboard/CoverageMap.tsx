import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  Trash2,
  Bell,
  BellOff,
  MapPin,
  HelpCircle,
  PencilLine,
  Save,
  XCircle,
  WandSparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Undo2,
  MousePointerClick,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

interface CoverageZone {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  polygon: number[][];
  color: string;
  technician_name: string | null;
  technician_phone: string | null;
  alert_active: boolean;
  alert_message: string | null;
  created_at: string;
}

interface CompanyOption {
  id: string;
  company_name: string;
}

function GuideTip({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const tutorialSteps = [
  {
    icon: <MousePointerClick className="h-5 w-5 text-primary" />,
    title: "Trazado Inteligente",
    description: "Haz clic punto a punto para bordear la zona. Al finalizar, haz doble clic o pulsa en el primer punto.",
  },
  {
    icon: <CheckCircle2 className="h-5 w-5 text-primary" />,
    title: "Confirmación Rápida",
    description: "Al cerrar el área, aparecerá automáticamente el formulario para guardar los detalles técnicos.",
  },
  {
    icon: <PencilLine className="h-5 w-5 text-primary" />,
    title: "Edición Dinámica",
    description: "Selecciona una zona y arrastra los vértices para ajustarla con precisión quirúrgica.",
  },
];

function TutorialCard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const current = tutorialSteps[step];
  const progress = ((step + 1) / tutorialSteps.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          Guía paso a paso
        </span>
        <button onClick={onClose} className="text-[10px] text-muted-foreground hover:text-foreground">
          Cerrar
        </button>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-primary"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>

      <motion.div
        key={step}
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        className="mt-3 flex items-start gap-2.5"
      >
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {current.icon}
        </div>
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-foreground">{current.title}</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{current.description}</p>
        </div>
      </motion.div>

      <div className="mt-3 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Anterior
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setStep((s) => Math.min(tutorialSteps.length - 1, s + 1))}
          disabled={step === tutorialSteps.length - 1}
        >
          Siguiente
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function CoverageMap({ companyId }: { companyId?: string }) {
  const { theme, resolvedTheme } = useTheme();
  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const isDark = currentTheme === "dark";

  const [zones, setZones] = useState<CoverageZone[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [pendingPolygon, setPendingPolygon] = useState<number[][]>([]);
  const [tempDrawingLayer, setTempDrawingLayer] = useState<any>(null);
  const [geomanLoaded, setGeomanLoaded] = useState(false);

  const [showTutorial, setShowTutorial] = useState(true);

  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#2563eb",
    company_id: "",
    technician_name: "",
    technician_phone: "",
    alert_message:
      "Estamos experimentando problemas en su zona. Estamos trabajando para resolver la situación.",
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const zonesGroupRef = useRef<any>(null);
  const zoneLayersRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);

  // Drawing layer refs
  const drawingGroupRef = useRef<any>(null);
  const drawingModeRef = useRef(false);

  const { toast } = useToast();

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;

  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(
        isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      );
    }
  }, [isDark]);

  // Keep refs in sync
  useEffect(() => {
    drawingModeRef.current = drawingMode;
  }, [drawingMode]);

  useEffect(() => {
    loadZones();
    loadCompanies();
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return;

    initMap();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void renderZones();
  }, [zones, selectedZoneId, editingZoneId]);

  // Re-render drawing preview when points change
  // Deprecated for custom drawing in favor of Leaflet.Draw

  const extractPolygonPoints = useCallback((layer: any) => {
    const latLngs = layer.getLatLngs();
    const ring = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
    return ring.map((ll: any) => [ll.lat, ll.lng]);
  }, []);

  const initMap = () => {
    try {
      if (!mapRef.current || leafletMapRef.current) return;

      leafletRef.current = L;
      setGeomanLoaded(true);

      const map = L.map(mapRef.current, {
        center: [-33.45, -70.65],
        zoom: 12,
        zoomControl: false,
      });
      leafletMapRef.current = map;

      const tileL = L.tileLayer(
        isDark ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: '© CARTO',
          maxZoom: 19,
        }
      );
      tileL.addTo(map);
      tileLayerRef.current = tileL;

      L.control.zoom({ position: "bottomright" }).addTo(map);

      if (map.pm) {
        map.pm.setLang('es');
        map.pm.addControls({
          position: 'topleft',
          drawCircle: false,
          drawCircleMarker: false,
          drawPolyline: false,
          drawRectangle: false,
          drawPolygon: false,
          drawText: false,
          drawMarker: false,
          editMode: false,
          dragMode: false,
          cutPolygon: false,
          removalMode: false,
        });
        map.pm.setPathOptions({
          color: 'hsl(var(--primary))',
          fillColor: 'hsl(var(--primary))',
          fillOpacity: 0.3,
          weight: 3,
        });
      }

      const group = new L.FeatureGroup();
      group.addTo(map);

      map.on("pm:create", (e: any) => {
        const layer = e.layer;
        setTempDrawingLayer(layer);
        setPendingPolygon(extractPolygonPoints(layer));
        setDrawingMode(false);
        setCreateOpen(true);
      });

      leafletMapRef.current = map;
      zonesGroupRef.current = group;

      setTimeout(() => map.invalidateSize(), 250);
    } catch (err) {
      console.error("Map init fail:", err);
    }
  };

  const renderZones = async () => {
    const map = leafletMapRef.current;
    if (!map || !leafletRef.current || !zonesGroupRef.current) return;
    const L = leafletRef.current;
    const group = zonesGroupRef.current;

    group.clearLayers();
    zoneLayersRef.current.clear();

    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length < 3) return;
      const isSelected = zone.id === selectedZoneId;
      const isEditing = zone.id === editingZoneId;

      const layer = L.polygon(zone.polygon as any, {
        color: zone.color || "#2563eb",
        fillColor: zone.color || "#2563eb",
        fillOpacity: isSelected ? 0.3 : 0.14,
        weight: isSelected ? 3 : 2,
        dashArray: isSelected ? "" : "6 4",
      });

      layer.on("click", () => {
        if (!drawingMode && !isEditing) setSelectedZoneId(zone.id);
      });

      layer.bindTooltip(
        `<div style="font-size:12px;font-weight:700;">${escapeHtml(zone.name)}</div>
         ${zone.alert_active ? '<div style="font-size:11px;margin-top:3px;color:hsl(var(--primary));">⚠ Alerta activa</div>' : ""}`,
        { sticky: true, className: "leaflet-tooltip-custom" }
      );

      layer.addTo(group);
      zoneLayersRef.current.set(zone.id, layer);

      if (isEditing && layer.pm) {
        layer.pm.enable({ allowSelfIntersection: false, snappable: true });
      }
    });

    if (selectedZoneId) {
      const selectedLayer = zoneLayersRef.current.get(selectedZoneId);
      selectedLayer?.bringToFront();
    }
  };

  const loadZones = async () => {
    let query = supabase.from("coverage_zones").select("*").order("created_at", { ascending: false });
    if (companyId) {
      query = query.eq("company_id", companyId);
    }
    const { data, error } = await query;
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else if (data) setZones(data as unknown as CoverageZone[]);
    setLoading(false);
  };

  const loadCompanies = async () => {
    let query = supabase.from("company_config").select("id, company_name");
    if (companyId) {
      query = query.eq("id", companyId);
    }
    const { data } = await query;
    if (data) setCompanies(data as unknown as CompanyOption[]);
  };

  const focusZone = (zone: CoverageZone) => {
    setSelectedZoneId(zone.id);
    if (leafletMapRef.current && zone.polygon?.length >= 3 && leafletRef.current) {
      const bounds = leafletRef.current.latLngBounds(zone.polygon.map((p: number[]) => [p[0], p[1]]));
      leafletMapRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  };

  const startDrawing = () => {
    if (editingZoneId) cancelEditZone();
    setSelectedZoneId(null);
    setDrawingMode(true);
    setPendingPolygon([]);

    const map = leafletMapRef.current;
    if (map && map.pm) {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        finishOn: 'dblclick',
        allowSelfIntersection: false,
        templineStyle: { color: 'hsl(var(--primary))' }
      });
    }
  };

  const stopDrawing = () => {
    setDrawingMode(false);
    if (leafletMapRef.current?.pm) leafletMapRef.current.pm.disableDraw();
  };

  const cancelTempDrawing = () => {
    stopDrawing();
    setPendingPolygon([]);
    if (tempDrawingLayer) {
      tempDrawingLayer.remove();
      setTempDrawingLayer(null);
    }
  };

  const startEditSelectedZone = () => {
    if (!selectedZoneId) return;
    const layer = zoneLayersRef.current.get(selectedZoneId);
    if (!layer) return;
    stopDrawing();
    setEditingZoneId(selectedZoneId);
  };

  const cancelEditZone = async () => {
    if (editingZoneId) {
      const layer = zoneLayersRef.current.get(editingZoneId);
      if (layer?.pm) layer.pm.disable();
    }
    setEditingZoneId(null);
    await loadZones();
  };

  const saveEditZone = async () => {
    if (!editingZoneId) return;
    const layer = zoneLayersRef.current.get(editingZoneId);
    if (!layer) return;
    if (layer.pm) layer.pm.disable();
    const polygon = extractPolygonPoints(layer);
    const { error } = await supabase.from("coverage_zones").update({ polygon } as any).eq("id", editingZoneId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setEditingZoneId(null);
    await loadZones();
  };

  const handleCreate = async () => {
    if (!form.name || !form.company_id) {
      toast({ title: "Nombre y empresa requeridos", variant: "destructive" });
      return;
    }

    if (pendingPolygon.length < 3) {
      toast({ title: "La zona no tiene suficientes puntos", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("coverage_zones").insert({
      name: form.name,
      description: form.description || null,
      company_id: form.company_id,
      polygon: pendingPolygon,
      color: form.color,
      technician_name: form.technician_name || null,
      technician_phone: form.technician_phone || null,
      alert_message: form.alert_message,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Zona creada exitosamente" });

    setCreateOpen(false);
    setPendingPolygon([]);
    if (tempDrawingLayer) setTempDrawingLayer(null);

    setForm({
      name: "",
      description: "",
      color: "#2563eb",
      company_id: "",
      technician_name: "",
      technician_phone: "",
      alert_message:
        "Estamos experimentando problemas en su zona. Estamos trabajando para resolver la situación.",
    });

    await loadZones();
  };

  const toggleAlert = async (zone: CoverageZone) => {
    const { error } = await supabase
      .from("coverage_zones")
      .update({ alert_active: !zone.alert_active } as any)
      .eq("id", zone.id);

    if (error) {
      toast({ title: "No se pudo actualizar la alerta", description: error.message, variant: "destructive" });
      return;
    }

    await loadZones();
    setSelectedZoneId(zone.id);
    toast({ title: zone.alert_active ? "Alerta desactivada" : "Alerta activada" });
  };

  const deleteZone = async (id: string) => {
    if (!confirm("¿Eliminar esta zona de cobertura?")) return;

    const { error } = await supabase.from("coverage_zones").delete().eq("id", id);
    if (error) {
      toast({ title: "No se pudo eliminar la zona", description: error.message, variant: "destructive" });
      return;
    }

    setSelectedZoneId(null);
    setEditingZoneId(null);
    await loadZones();
    toast({ title: "Zona eliminada" });
  };

  const updateAlertMessage = async (zone: CoverageZone, message: string) => {
    const { error } = await supabase
      .from("coverage_zones")
      .update({ alert_message: message } as any)
      .eq("id", zone.id);

    if (error) {
      toast({ title: "No se pudo guardar el mensaje", description: error.message, variant: "destructive" });
      return;
    }

    await loadZones();
    setSelectedZoneId(zone.id);
  };



  return (
    <Tabs defaultValue="map" className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">Zonas e Incidencias</h2>
        <TabsList>
          <TabsTrigger value="map" className="gap-2"><MapPin className="w-4 h-4" /> Mapa de Cobertura</TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2"><Bell className="w-4 h-4" /> Sistema de Alertas</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="map" className="flex-1 mt-0 m-0">
        <div className="flex h-full overflow-hidden rounded-2xl border border-border/10 mix-blend-normal relative">
          {/* Sidebar */}
          <div className="flex w-[340px] flex-shrink-0 flex-col border-r border-border/10 glass z-10 shadow-2xl">
            <div className="border-b border-border/10 p-5 sticky top-0 bg-background/50 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                  </div>
                  Cobertura
                </h3>

                <GuideTip tip="Ver tutorial paso a paso">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowTutorial((v) => !v)}
                  >
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </GuideTip>
              </div>

              <AnimatePresence>
                <TutorialCard
                  open={showTutorial}
                  onClose={() => setShowTutorial(false)}
                />
              </AnimatePresence>

              <div className="space-y-2">
                <Button
                  size="sm"
                  className="h-8 w-full gap-1.5 text-xs"
                  onClick={startDrawing}
                  disabled={drawingMode}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dibujar zona
                </Button>

                {drawingMode && (
                  <Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={stopDrawing}>
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar dibujo
                  </Button>
                )}

                {selectedZone && !drawingMode && editingZoneId !== selectedZone.id && (
                  <Button variant="secondary" size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={startEditSelectedZone}>
                    <PencilLine className="h-3.5 w-3.5" />
                    Editar forma
                  </Button>
                )}

                {editingZoneId && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button size="sm" className="h-8 gap-1 text-xs" onClick={saveEditZone}>
                      <Save className="h-3.5 w-3.5" /> Guardar
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={cancelEditZone}>
                      <XCircle className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {zones.map((zone) => {
                  const isSelected = selectedZoneId === zone.id;
                  return (
                    <motion.button
                      key={zone.id}
                      type="button"
                      onClick={() => focusZone(zone)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all ${isSelected
                        ? "border-primary/25 bg-primary/10"
                        : "border-transparent hover:bg-secondary/30"
                        }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: zone.color, boxShadow: `0 0 10px ${zone.color}` }}
                        />
                        <span className={`truncate text-[13px] font-bold tracking-wide ${isSelected ? "text-primary" : "text-foreground/90"}`}>
                          {zone.name}
                        </span>
                        {zone.alert_active && <Bell className="ml-auto h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="ml-5.5 mt-1 truncate text-[10px] text-muted-foreground">
                        {zone.technician_name || "Sin técnico asignado"}
                      </p>
                    </motion.button>
                  );
                })}

                {zones.length === 0 && !loading && (
                  <div className="space-y-3 py-10 flex flex-col items-center justify-center h-full text-center px-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-2 glow-box">
                      <MapPin className="h-8 w-8 text-primary shadow-primary/50 drop-shadow-lg" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold glow-text mb-1 tracking-wide">Sin Sectores Activos</h4>
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed font-medium">Utilice la herramienta del panel para demarcar las primeras anomalías geográficas en el escáner.</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Selected zone detail */}
            <AnimatePresence>
              {selectedZone && !drawingMode && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-border/20"
                >
                  <div className="space-y-3 bg-card/80 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedZone.color }} />
                        <h4 className="truncate text-sm font-bold">{selectedZone.name}</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteZone(selectedZone.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {selectedZone.description && (
                      <p className="text-[11px] text-muted-foreground">{selectedZone.description}</p>
                    )}

                    {selectedZone.technician_name && (
                      <div className="flex items-center gap-2 rounded-md bg-secondary/30 px-2.5 py-1.5 text-xs text-muted-foreground">
                        <span>🔧</span>
                        <span>{selectedZone.technician_name}</span>
                        {selectedZone.technician_phone && (
                          <span className="ml-auto text-muted-foreground/70">{selectedZone.technician_phone}</span>
                        )}
                      </div>
                    )}

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Map area */}
          <div className="relative flex-1 z-0">
            <div ref={mapRef} className="h-full w-full" />

            {/* Drawing HUD */}
            <AnimatePresence>
              {drawingMode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500]"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-background/90 backdrop-blur-2xl border border-primary/30 py-3 px-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.3)] flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                        <Plus className="h-5 w-5 text-primary animate-pulse" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-foreground">Modo Trazado Activo</span>
                        <span className="text-[11px] text-muted-foreground">Haz clics en el mapa. Doble clic para cerrar.</span>
                      </div>
                      <div className="h-8 w-[1px] bg-border/50 mx-2" />
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={cancelTempDrawing}
                        className="rounded-xl px-4 h-9 font-bold tracking-tight shadow-xl"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {editingZoneId && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="absolute right-6 top-6 z-[500] pointer-events-auto"
                >
                  <div className="bg-secondary/95 backdrop-blur-2xl border border-primary/20 p-5 rounded-3xl shadow-2xl w-[300px]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <PencilLine className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm tracking-tight text-primary uppercase">Refinado Geométrico</h4>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                      Los puntos de control están activos. Mueve cualquier vértice para recalibrar el área de cobertura.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button onClick={saveEditZone} size="sm" className="w-full rounded-xl bg-primary hover:bg-primary/90 shadow-lg font-bold">
                        <Save className="h-4 w-4 mr-2" /> Aplicar Cambios
                      </Button>
                      <Button onClick={cancelEditZone} variant="ghost" size="sm" className="w-full rounded-xl text-muted-foreground">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Zone counter */}
            {!drawingMode && zones.length > 0 && !showTutorial && (
              <div className="absolute left-4 top-4 z-[500] rounded-lg border border-border/20 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <WandSparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium">
                    {zones.length} zona{zones.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Create dialog */}
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) setPendingPolygon([]);
            }}
          >
            <DialogContent className="max-w-md border-border/20 bg-card z-[1100]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  Nueva Zona de Cobertura
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                  Zona delimitada con <span className="font-semibold text-primary">{pendingPolygon.length} puntos</span>.
                </div>

                <div>
                  <Label className="text-xs">Nombre de la zona *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="mt-1.5"
                    placeholder="Ej: Sector Norte"
                  />
                </div>

                <div>
                  <Label className="text-xs">Empresa *</Label>
                  <select
                    value={form.company_id}
                    onChange={(e) => setForm((p) => ({ ...p, company_id: e.target.value }))}
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Seleccionar empresa</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs">Descripción</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="mt-1.5"
                    placeholder="Descripción opcional"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Técnico responsable</Label>
                    <Input
                      value={form.technician_name}
                      onChange={(e) => setForm((p) => ({ ...p, technician_name: e.target.value }))}
                      className="mt-1.5"
                      placeholder="Nombre"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Teléfono técnico</Label>
                    <Input
                      value={form.technician_phone}
                      onChange={(e) => setForm((p) => ({ ...p, technician_phone: e.target.value }))}
                      className="mt-1.5"
                      placeholder="+56 9..."
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Color de la zona</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                      className="h-9 w-12 cursor-pointer rounded-md border border-input"
                    />
                    <span className="text-xs text-muted-foreground">{form.color}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Mensaje de alerta predeterminado</Label>
                  <Textarea
                    value={form.alert_message}
                    onChange={(e) => setForm((p) => ({ ...p, alert_message: e.target.value }))}
                    className="mt-1.5 text-xs"
                    rows={2}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    setPendingPolygon([]);
                    cancelTempDrawing();
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleCreate}>Crear Zona</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TabsContent>

      <TabsContent value="alerts" className="flex-1 mt-0 m-0">
        <div className="h-full rounded-xl border border-border/20 bg-card shadow-lg p-6 overflow-y-auto">
          <div className="mb-6 max-w-2xl">
            <h3 className="text-lg font-semibold mb-1">Alertas Criticas por Zona</h3>
            <p className="text-sm text-muted-foreground">Activa una alerta para notificar automáticamente al Bot de IA o a la plataforma que hay incidencias o mantenimientos en ciertas zonas. Al activarla, el cliente recibirá el aviso cuando interactúe.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {zones.map(zone => (
              <div key={zone.id} className="p-5 rounded-xl border border-border/40 bg-secondary/10 flex flex-col gap-4 transition-all hover:bg-secondary/20">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                    <div>
                      <h3 className="font-semibold text-sm">{zone.name}</h3>
                      <p className="text-xs text-muted-foreground">{companies.find(c => c.id === zone.company_id)?.company_name || "Múltiples empresas..."}</p>
                    </div>
                  </div>
                  <Switch checked={zone.alert_active} onCheckedChange={() => toggleAlert(zone)} />
                </div>

                <div className={`space-y-2 transition-all overflow-hidden ${zone.alert_active ? 'opacity-100 max-h-40' : 'opacity-50 max-h-24'}`}>
                  <Label className="text-xs font-semibold text-muted-foreground">Mensaje Automático</Label>
                  <Textarea
                    value={zone.alert_message || ""}
                    onChange={e => setZones(prev => prev.map(z => z.id === zone.id ? { ...z, alert_message: e.target.value } : z))}
                    onBlur={e => updateAlertMessage(zone, e.target.value)}
                    disabled={!zone.alert_active}
                    className="text-xs bg-background h-20 resize-none"
                    placeholder="Ej: Estamos experimentando intermitencias..."
                  />
                </div>
              </div>
            ))}

            {zones.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-border/50 rounded-xl">
                <BellOff className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No hay zonas configuradas</p>
                <p className="text-xs text-muted-foreground/60">Ve al mapa de cobertura y dibuja una zona primero.</p>
              </div>
            )}
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-background/80 backdrop-blur-md px-4 py-2 rounded-full border border-border/10 shadow-lg z-[400]">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-primary">Map Engine Active</span>
            </div>
          </div>
        </div>
      </TabsContent>

      <style>{`
        .leaflet-container {
          background: hsl(var(--muted) / 0.35) !important;
        }

        .leaflet-tooltip-custom {
          background: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--border) / 0.3) !important;
          border-radius: 8px !important;
          padding: 8px 12px !important;
          box-shadow: 0 4px 12px hsl(var(--foreground) / 0.08) !important;
          color: hsl(var(--foreground)) !important;
        }

        .leaflet-tooltip-custom::before {
          display: none !important;
        }

        .drawing-point-label {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
        }

        .drawing-point-label span {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          font-size: 10px;
          font-weight: 700;
        }

        /* Geoman specific overrides */
        .leaflet-pm-toolbar {
          display: none !important;
        }

        .leaflet-marker-icon.marker-icon {
          background-color: hsl(var(--primary)) !important;
          border-radius: 50% !important;
          border: 2px solid white !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4) !important;
          opacity: 0.9 !important;
        }

        .leaflet-marker-icon.marker-icon:hover {
          transform: scale(1.1) !important;
          background-color: hsl(var(--primary)) !important;
        }

        .leaflet-container {
          background: transparent !important;
        }
      `}</style>
    </Tabs>
  );
}
