import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  MapPin,
  HelpCircle,
  PencilLine,
  Save,
  XCircle,
  WandSparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  MousePointerClick,
  RotateCw,
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
  alert_active: boolean;
  alert_message: string | null;
  alert_zones: string[];
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

function TutorialCard({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  // Estado local para evitar el error de react "read-only textarea"
  const [localAlertMessage, setLocalAlertMessage] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [pendingPolygon, setPendingPolygon] = useState<number[][]>([]);
  const [tempDrawingLayer, setTempDrawingLayer] = useState<any>(null);

  const [showTutorial, setShowTutorial] = useState(() => {
    return localStorage.getItem('coverage_tutorial_done') === null;
  });
  const [activeTab, setActiveTab] = useState("map");

  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#2563eb");
  const [isUpdating, setIsUpdating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    color: "#2563eb",
    company_id: companyId || "",
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const zonesGroupRef = useRef<any>(null);
  const zoneLayersRef = useRef<Map<string, any>>(new Map());
  const tileLayerRef = useRef<any>(null);

  const { toast } = useToast();

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;

  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setUrl(
        isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
      );
    }
  }, [isDark]);

  useEffect(() => {
    loadZones();
    loadCompanies();
  }, []);

  // Sincronizar estado local del Textarea cuando las empresas cambian
  useEffect(() => {
    const company = companies.find(c => companyId ? c.id === companyId : true);
    if (company) {
      setLocalAlertMessage(company.alert_message || "");
    }
  }, [companies, companyId]);

  // Sincronizar estado de edición cuando cambia la zona seleccionada
  useEffect(() => {
    if (selectedZone) {
      setEditName(selectedZone.name);
      setEditColor(selectedZone.color);
    }
  }, [selectedZoneId, selectedZone]);

  // Inicialización sincrónica directa (bulletproof)
  useEffect(() => {
    if (mapRef.current && !leafletMapRef.current) {
      initMap();
    }

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

  useEffect(() => {
    if (activeTab === "map" && leafletMapRef.current) {
      let timeoutId: NodeJS.Timeout;
      requestAnimationFrame(() => {
        leafletMapRef.current?.invalidateSize(false);
        timeoutId = setTimeout(() => {
          leafletMapRef.current?.invalidateSize(false);
        }, 200);
      });

      return () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
    }
  }, [activeTab]);

  const extractPolygonPoints = useCallback((layer: any) => {
    const latLngs = layer.getLatLngs();
    const ring = Array.isArray(latLngs[0]) ? latLngs[0] : latLngs;
    return ring.map((ll: any) => [ll.lat, ll.lng]);
  }, []);

  const initMap = () => {
    if (!mapRef.current || leafletMapRef.current) return;

    try {
      leafletRef.current = L;

      const map = L.map(mapRef.current, {
        center: [-33.45, -70.65],
        zoom: 12,
        zoomControl: false,
      });
      leafletMapRef.current = map;

      const tileL = L.tileLayer(
        isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        {
          attribution: '© CARTO',
          maxZoom: 19,
          subdomains: 'abcd',
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

      // Invalidation post-mount
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
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      const zData = data as unknown as CoverageZone[];
      setZones(zData);

      if (leafletMapRef.current && leafletRef.current && zData.length > 0) {
        const L = leafletRef.current;
        const allPoints: number[][] = [];
        zData.forEach(z => {
          if (Array.isArray(z.polygon)) {
            allPoints.push(...z.polygon);
          }
        });

        if (allPoints.length > 0) {
          try {
            const bounds = L.latLngBounds(allPoints.map(p => [p[0], p[1]]));
            leafletMapRef.current.fitBounds(bounds, { padding: [40, 40] });
            requestAnimationFrame(() => leafletMapRef.current?.invalidateSize());
          } catch (e) {
            console.error("Error fitting bounds:", e);
          }
        }
      } else if (leafletMapRef.current && zData.length === 0) {
        leafletMapRef.current.setView([-33.4489, -70.6693], 12);
        requestAnimationFrame(() => leafletMapRef.current?.invalidateSize());
      }
    }
    setLoading(false);
  };

  const loadCompanies = async () => {
    let query = supabase.from("company_config").select("id, company_name, alert_active, alert_message, alert_zones");
    if (companyId) {
      query = query.eq("id", companyId);
    }
    const { data } = await query;
    if (data) {
      const formatted = (data as any[]).map(c => ({
        ...c,
        alert_zones: c.alert_zones || []
      }));
      setCompanies(formatted);
    }
  };

  const focusZone = (zone: CoverageZone) => {
    setSelectedZoneId(zone.id);
    if (showTutorial) setShowTutorial(false);
    if (leafletMapRef.current && zone.polygon?.length >= 3 && leafletRef.current) {
      const bounds = leafletRef.current.latLngBounds(zone.polygon.map((p: number[]) => [p[0], p[1]]));
      leafletMapRef.current.fitBounds(bounds, { padding: [60, 60] });
      requestAnimationFrame(() => leafletMapRef.current?.invalidateSize());
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
      company_id: form.company_id || companyId,
      polygon: pendingPolygon,
      color: form.color,
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
      company_id: companyId || "",
    });

    await loadZones();
  };

  const updateGlobalAlert = async (updates: Partial<CompanyOption>) => {
    console.log("[Alert] Actualizando:", updates, "company:", companyId);
    if (!companyId && companies.length > 1 && !companies[0]?.id) {
      toast({ title: "Seleccione una empresa primero", variant: "destructive" });
      return;
    }

    const targetCompanyId = companyId || companies[0]?.id;
    console.log("[Alert] Target company_id:", targetCompanyId);

    const { data, error } = await supabase
      .from("company_config")
      .update(updates as any)
      .eq("id", targetCompanyId)
      .select();

    console.log("[Alert] Resultado:", data, "Error:", error);

    if (error) {
      toast({ title: "Error al actualizar alerta", description: error.message, variant: "destructive" });
    } else {
      await loadCompanies();
      toast({ title: "Configuración de alerta actualizada" });
    }
  };

  const toggleZoneInAlert = (zoneId: string) => {
    const company = companies.find(c => companyId ? c.id === companyId : true);
    if (!company) return;

    let newZones = [...(company.alert_zones || [])];
    if (newZones.includes(zoneId)) {
      newZones = newZones.filter(id => id !== zoneId);
    } else {
      newZones.push(zoneId);
    }

    updateGlobalAlert({ alert_zones: newZones });
  };

  const handleSaveZoneEdit = async () => {
    if (!selectedZoneId) return;
    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from("coverage_zones")
        .update({ name: editName, color: editColor })
        .eq("id", selectedZoneId);

      if (error) throw error;

      // Actualizar estado local SIN recargar todo el mapa
      setZones(prev => prev.map(z =>
        z.id === selectedZoneId ? { ...z, name: editName, color: editColor } : z
      ));

      toast({ title: "Zona actualizada" });
    } catch (error: any) {
      toast({ title: "Error al actualizar la zona", description: error.message, variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
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

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">Zonas e Incidencias</h2>
        <div className="flex p-1 bg-muted/50 rounded-lg border border-border/20 gap-1">
          <button
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${activeTab === 'map'
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-card/50'
              }`}
          >
            <MapPin className="w-4 h-4" /> Mapa de Cobertura
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all flex items-center gap-2 ${activeTab === 'alerts'
              ? 'bg-card text-primary shadow-sm'
              : 'text-muted-foreground hover:bg-card/50'
              }`}
          >
            <Bell className="w-4 h-4" /> Sistema de Alertas
          </button>
        </div>
      </div>

      <div style={{ display: activeTab === 'map' ? 'flex' : 'none' }} className="flex-1 mt-0 m-0 min-h-0">
        <div className="flex w-full h-full overflow-hidden rounded-2xl border border-border/10 mix-blend-normal relative">

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
                    onClick={() => {
                      localStorage.removeItem('coverage_tutorial_done');
                      setShowTutorial(true);
                    }}
                  >
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </GuideTip>
              </div>

              <AnimatePresence>
                <TutorialCard
                  open={showTutorial}
                  onClose={() => {
                    localStorage.setItem('coverage_tutorial_done', 'true');
                    setShowTutorial(false);
                  }}
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
              <div className="p-4">
                <div className="grid grid-cols-2 gap-2">
                  {zones.map((zone) => {
                    const isSelected = selectedZoneId === zone.id;
                    return (
                      <Badge
                        key={zone.id}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer h-auto py-1.5 px-3 block truncate text-center transition-all hover:scale-[1.02] active:scale-[0.98] ${isSelected
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 border-primary"
                          : "bg-background/50 hover:bg-secondary/50 border-border/40"
                          }`}
                        onClick={() => focusZone(zone)}
                        title={zone.name}
                      >
                        <div className="flex items-center gap-1.5 justify-center">
                          <div
                            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: zone.color, boxShadow: isSelected ? '0 0 5px white' : 'none' }}
                          />
                          <span className="truncate text-[10px] font-bold uppercase tracking-tight">
                            {zone.name}
                          </span>
                        </div>
                      </Badge>
                    );
                  })}
                </div>

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
                        <h4 className="truncate text-sm font-bold uppercase tracking-tight">Detalle de Zona</h4>
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

                    <div className="space-y-3 bg-secondary/20 p-3 rounded-xl border border-border/10">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Nombre Identificador</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-xs bg-background/50 border-border/20"
                          placeholder="Ej: Sector Norte A"
                        />
                      </div>

                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Color Radial</Label>
                          <div className="flex gap-2 items-center">
                            <Input
                              type="color"
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value)}
                              className="h-8 w-12 p-0.5 border-border/20 cursor-pointer bg-background/50"
                            />
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">{editColor}</span>
                          </div>
                        </div>

                        <div className="flex items-end">
                          <Button
                            size="sm"
                            className="h-8 px-3 gap-1.5 text-xs font-bold"
                            onClick={handleSaveZoneEdit}
                            disabled={isUpdating || (editName === selectedZone.name && editColor === selectedZone.color)}
                          >
                            {isUpdating ? <RotateCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Guardar
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 h-8 gap-1.5 text-xs font-bold uppercase tracking-wider"
                        onClick={startEditSelectedZone}
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Editar Vértices
                      </Button>
                    </div>

                    {selectedZone.technician_name && (
                      <div className="flex items-center gap-2 rounded-md bg-secondary/30 px-2.5 py-1.5 text-xs text-muted-foreground mt-2 border border-border/10">
                        <span>🔧</span>
                        <span className="font-medium text-[11px]">{selectedZone.technician_name}</span>
                        {selectedZone.technician_phone && (
                          <span className="ml-auto text-muted-foreground/70 font-mono">{selectedZone.technician_phone}</span>
                        )}
                      </div>
                    )}

                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Map area: Estructura absoluta para evitar colapso flex */}
          <div className="relative flex-1 bg-muted/10 overflow-hidden">
            <div ref={mapRef} className="absolute inset-0 z-0" />

            {/* Capa de interfaces sobre el mapa */}
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Drawing HUD */}
              <AnimatePresence>
                {drawingMode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-auto"
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
                    className="absolute right-6 top-6 pointer-events-auto"
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
                <div className="absolute left-4 top-4 pointer-events-auto rounded-lg border border-border/20 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <WandSparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">
                      {zones.length} zona{zones.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Create dialog */}
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) cancelTempDrawing();
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
                <DialogDescription className="sr-only">
                  Formulario para establecer el nombre y configuraciones de una nueva zona trazada.
                </DialogDescription>
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

                {!companyId && (
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
                )}

                <div>
                  <Label className="text-xs">Descripción</Label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    className="mt-1.5"
                    placeholder="Descripción opcional"
                  />
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
      </div>

      <div style={{ display: activeTab === 'alerts' ? 'block' : 'none' }} className="flex-1 mt-0 m-0 min-h-0">
        <div className="h-full rounded-xl border border-border/20 bg-card shadow-lg p-6 overflow-y-auto">
          {(() => {
            const company = companies.find(c => companyId ? c.id === companyId : true);
            if (!company) return (
              <div className="flex items-center justify-center h-full text-muted-foreground italic">
                Cargando configuración de empresa...
              </div>
            );

            return (
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex justify-between items-start border-b border-border/10 pb-6">
                  <div>
                    <h3 className="text-xl font-bold tracking-tight mb-1">Sistema Global de Alertas</h3>
                    <p className="text-sm text-muted-foreground">Configure una única alerta para múltiples zonas de cobertura.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-secondary/20 px-4 py-2 rounded-2xl border border-border/40">
                    <Label className="text-xs font-bold uppercase tracking-wider cursor-pointer" htmlFor="global-alert">Estado Global</Label>
                    <Switch
                      id="global-alert"
                      checked={company.alert_active}
                      onCheckedChange={(val) => updateGlobalAlert({ alert_active: val })}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Bell className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm uppercase tracking-wide">Mensaje de Alerta</h4>
                    </div>
                    {/* Control local del estado para evitar warnings y permitir edición correcta */}
                    <Textarea
                      value={localAlertMessage}
                      onChange={(e) => setLocalAlertMessage(e.target.value)}
                      onBlur={() => updateGlobalAlert({ alert_message: localAlertMessage })}
                      placeholder="Ej: Estamos experimentando intermitencias técnicas en su sector. Las brigadas están trabajando en terreno."
                      className="min-h-[180px] text-sm bg-muted/10 border-border/20 focus:border-primary/50 transition-all resize-none rounded-xl"
                    />
                    <p className="text-[10px] text-muted-foreground italic">Este mensaje se enviará automáticamente si el cliente se encuentra en alguna de las zonas marcadas.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm uppercase tracking-wide">Zonas Afectadas</h4>
                    </div>

                    <div className="bg-muted/5 border border-border/20 rounded-xl overflow-hidden">
                      <ScrollArea className="h-[200px]">
                        <div className="p-4 grid gap-2">
                          {zones.map(zone => (
                            <div
                              key={zone.id}
                              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${company.alert_zones?.includes(zone.id)
                                ? 'bg-primary/10 border-primary/30'
                                : 'bg-background/50 border-transparent hover:border-border/30'
                                }`}
                              onClick={() => toggleZoneInAlert(zone.id)}
                            >
                              <div className="h-4 w-4 rounded-full" style={{ backgroundColor: zone.color }} />
                              <span className="text-xs font-semibold flex-1">{zone.name}</span>
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${company.alert_zones?.includes(zone.id) ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                                }`}>
                                {company.alert_zones?.includes(zone.id) && <Save className="w-3 h-3 text-white" />}
                              </div>
                            </div>
                          ))}
                          {zones.length === 0 && (
                            <div className="py-8 text-center text-muted-foreground text-xs italic">
                              No hay zonas creadas aún.
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                    <p className="text-[10px] text-muted-foreground italic text-right">Haga clic en una zona para incluirla o excluirla de la alerta activa.</p>
                  </div>
                </div>

                {company.alert_active && company.alert_zones.length > 0 && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide">Alerta Activa</p>
                      <p className="text-[11px] text-emerald-500/80">Actualmente notificando en {company.alert_zones.length} sectores.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
      <style>{`
        /* Evitar que el contenedor base de Leaflet quede invisible */
        .leaflet-container {
          background-color: hsl(var(--muted) / 0.35) !important;
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
      `}</style>
    </div>
  );
}