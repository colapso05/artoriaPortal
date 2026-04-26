import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Trash2, Pencil, MousePointer, WandSparkles,
  ArrowLeft, CheckCircle2, Loader2, XCircle, PencilLine, Save,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

/* ─── Interfaces ─────────────────────────────────────────── */
export interface AlertZone {
  id: string;
  company_id: string | null;
  polygon: number[][];
  created_at: string;
}
interface ReferenceCoverageZone {
  polygon: number[][];
  color: string;
  name: string;
}

/* ─── Douglas-Peucker (light, just removes hand tremor) ───── */
function perpDist(pt: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}
function rdp(pts: number[][], eps: number): number[][] {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) return [...rdp(pts.slice(0, maxI + 1), eps).slice(0, -1), ...rdp(pts.slice(maxI), eps)];
  return [pts[0], pts[pts.length - 1]];
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─── Component ──────────────────────────────────────────── */
interface Props {
  companyId?: string;
  onClose?: () => void;
  coverageZones?: ReferenceCoverageZone[];
}

export default function AlertZonesMap({ companyId, onClose, coverageZones = [] }: Props) {
  const { theme, resolvedTheme } = useTheme();
  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  const [zones, setZones] = useState<AlertZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<"none" | "click" | "freehand">("none");
  const [mapMsg, setMapMsg] = useState<{ type: "error" | "ok"; text: string } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const zonesGroupRef = useRef<any>(null);
  const coverageGroupRef = useRef<any>(null);
  const zoneLayersRef = useRef<Map<string, any>>(new Map());
  const hasInitialFit = useRef(false); // ← only fit on first load

  // Freehand
  const freehandActive = useRef(false);
  const freehandPoints = useRef<L.LatLng[]>([]);
  const freehandPolyline = useRef<any>(null);

  /* ─── Inline message ──────────────────────────────────── */
  const showMsg = (type: "error" | "ok", text: string, ms = 3000) => {
    setMapMsg({ type, text });
    setTimeout(() => setMapMsg(null), ms);
  };

  /* ─── Theme sync ──────────────────────────────────────── */
  useEffect(() => {
    tileLayerRef.current?.setUrl(
      isDark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
        : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
    );
  }, [isDark]);

  /* ─── Load zones (no fit on reload, only on first load) ── */
  useEffect(() => { loadZones(true); }, []);

  const loadZones = async (isInitial = false) => {
    setLoading(true);
    let q = (supabase.from as any)("alert_zones")
      .select("id, company_id, polygon, created_at")
      .order("created_at", { ascending: true });
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q;
    setLoading(false);
    if (error) { showMsg("error", "Error al cargar zonas: " + error.message); return; }
    const loaded = (data as AlertZone[]) || [];
    setZones(loaded);
    // Only auto-fit on the very first load, never on reloads after delete/save
    if (isInitial && !hasInitialFit.current) {
      hasInitialFit.current = true;
      fitMapToBestView(loaded);
    }
  };

  /* ─── Auto-fit (initial only) ─────────────────────────── */
  const fitMapToBestView = (alertZones: AlertZone[], retries = 0) => {
    const map = leafletMapRef.current;
    if (!map) {
      if (retries < 6) setTimeout(() => fitMapToBestView(alertZones, retries + 1), 200);
      return;
    }
    const allPoints: [number, number][] = [];
    alertZones.forEach(z => z.polygon?.forEach(p => allPoints.push([p[0], p[1]])));
    if (allPoints.length === 0) {
      coverageZones.forEach(z => z.polygon?.forEach(p => allPoints.push([p[0], p[1]])));
    }
    if (allPoints.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50], maxZoom: 15 });
        requestAnimationFrame(() => map.invalidateSize());
      } catch { /* ignore */ }
    }
  };

  /* ─── Map init ────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current && !leafletMapRef.current) initMap();
    return () => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; } };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      leafletMapRef.current?.invalidateSize();
      if (!hasInitialFit.current) fitMapToBestView(zones);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  const initMap = () => {
    if (!mapRef.current || leafletMapRef.current) return;
    try {
      const map = L.map(mapRef.current, { center: [-33.45, -70.65], zoom: 12, zoomControl: false });
      leafletMapRef.current = map;

      const tile = L.tileLayer(
        isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        { attribution: "© CARTO", maxZoom: 19, subdomains: "abcd" }
      );
      tile.addTo(map);
      tileLayerRef.current = tile;
      L.control.zoom({ position: "bottomright" }).addTo(map);

      if (map.pm) {
        map.pm.setLang("es");
        map.pm.addControls({
          position: "topleft",
          drawPolygon: false, drawCircle: false, drawCircleMarker: false,
          drawPolyline: false, drawRectangle: false, drawText: false, drawMarker: false,
          editMode: false, dragMode: false, cutPolygon: false, removalMode: false,
        });
        map.pm.setPathOptions({ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.25, weight: 2 });
      }

      map.on("pm:create", (e: any) => {
        e.layer.remove();
        // Reset to "none" so the user must press the button again to draw another zone
        // (same UX as freehand — no stuck "click" mode after completing a polygon)
        setDrawMode("none");
        autoSave(closePolygon(rdp(extractPoints(e.layer), 0.00005)));
      });

      const covGroup = new L.FeatureGroup().addTo(map);
      coverageGroupRef.current = covGroup;
      const group = new L.FeatureGroup().addTo(map);
      zonesGroupRef.current = group;

      setTimeout(() => map.invalidateSize(), 300);
    } catch (err) { console.error("AlertZonesMap init:", err); }
  };

  /* ─── Render coverage zones (reference) ──────────────── */
  useEffect(() => {
    const group = coverageGroupRef.current;
    if (!group) return;
    group.clearLayers();
    coverageZones.forEach(z => {
      if (!z.polygon?.length) return;
      L.polygon(z.polygon as any, {
        color: z.color, fillColor: z.color, fillOpacity: 0.06,
        weight: 1.5, dashArray: "5 5", opacity: 0.35,
        // Tell Geoman to completely ignore these layers —
        // prevents snap-to-coverage-zone and any drag interference.
        pmIgnore: true,
        interactive: false,
      } as any)
        .bindTooltip(`<span style="font-size:11px;opacity:0.7">${escHtml(z.name)}</span>`, { sticky: true })
        .addTo(group);
    });
  }, [coverageZones, leafletMapRef.current]);

  /* ─── Render alert zones ──────────────────────────────── */
  useEffect(() => {
    const group = zonesGroupRef.current;
    if (!group) return;

    group.clearLayers();
    zoneLayersRef.current.clear();

    zones.forEach((zone, idx) => {
      if (!zone.polygon?.length || zone.polygon.length < 3) return;
      const isSelected = zone.id === selectedId;
      const isEditing = zone.id === editingId;

      const cleanedPolygon = cleanPolygon(zone.polygon as number[][]);
      const layer = L.polygon(cleanedPolygon as any, {
        color: isEditing ? "#f97316" : "#ef4444",
        fillColor: isEditing ? "#f97316" : "#ef4444",
        fillOpacity: isSelected || isEditing ? 0.35 : 0.18,
        weight: isSelected || isEditing ? 3 : 2,
        dashArray: isSelected || isEditing ? "" : "6 4",
      });

      layer.bindTooltip(
        `<span style="font-size:11px;font-weight:700;">Zona ${idx + 1}</span>`,
        { sticky: true, className: "leaflet-tooltip-custom" }
      );
      layer.on("click", () => {
        if (drawMode !== "none" || editingId) return;
        setSelectedId(prev => prev === zone.id ? null : zone.id);
      });
      layer.addTo(group);
      zoneLayersRef.current.set(zone.id, layer);

      if (isEditing && layer.pm) {
        layer.pm.enable({ allowSelfIntersection: false, snappable: false });
      }

      if (isSelected || isEditing) layer.bringToFront();
    });
  }, [zones, selectedId, editingId, drawMode]);

  /* ─── Geometry helpers ────────────────────────────────── */
  const extractPoints = (layer: any): number[][] => {
    const lls = layer.getLatLngs();
    const ring = Array.isArray(lls[0]) ? lls[0] : lls;
    return ring.map((ll: any) => [ll.lat, ll.lng]);
  };

  // Prevent Geoman double-vertex bug by ensuring start and end points are not identical
  const cleanPolygon = (pts: number[][]): number[][] => {
    if (pts.length < 3) return pts;
    const first = pts[0], last = pts[pts.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      return pts.slice(0, -1);
    }
    return pts;
  };

  /* ─── Auto-save (no dialog) ───────────────────────────── */
  const autoSave = async (polygon: number[][]) => {
    if (polygon.length < 3) { showMsg("error", "La zona tiene muy pocos puntos. Intenta de nuevo."); return; }
    setSaving(true);
    const { error } = await (supabase.from as any)("alert_zones").insert({
      company_id: companyId || null,
      polygon,
      color: "#ef4444",
      active: true,
      name: "zona",
    });
    setSaving(false);
    if (error) { showMsg("error", "Error al guardar: " + error.message); return; }
    showMsg("ok", "Zona guardada.");
    loadZones(false); // ← false = don't re-fit
  };

  /* ─── Edit zone vertices ──────────────────────────────── */
  const startEdit = (id: string) => {
    setSelectedId(null);
    setEditingId(id);
    // Setting editingId triggers the zones useEffect to re-render all layers.
    // The editing layer is recreated fresh and pm.enable() is called right
    // after addTo() inside the render loop — exactly as CoverageMap does it.
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const layer = zoneLayersRef.current.get(editingId);
    if (!layer) return;
    if (layer.pm) layer.pm.disable();
    const polygon = cleanPolygon(extractPoints(layer));
    setSaving(true);
    const { error } = await (supabase.from as any)("alert_zones").update({ polygon }).eq("id", editingId);
    setSaving(false);
    setEditingId(null);
    if (error) { showMsg("error", "Error al guardar edición: " + error.message); return; }
    showMsg("ok", "Zona actualizada.");
    loadZones(false);
  };

  const cancelEdit = () => {
    const layer = zoneLayersRef.current.get(editingId!);
    if (layer?.pm) layer.pm.disable();
    setEditingId(null);
    loadZones(false); // restore original shape without re-fitting
  };

  /* ─── Delete ──────────────────────────────────────────── */
  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from as any)("alert_zones").delete().eq("id", id);
    if (error) { showMsg("error", "Error al eliminar: " + error.message); return; }
    setSelectedId(null);
    loadZones(false); // ← no re-fit, stay at current zoom
  };

  const handleDeleteAll = async () => {
    if (zones.length === 0) return;
    let q = (supabase.from as any)("alert_zones").delete();
    q = companyId
      ? q.eq("company_id", companyId)
      : q.neq("id", "00000000-0000-0000-0000-000000000000");
    const { error } = await q;
    if (error) { showMsg("error", "Error: " + error.message); return; }
    setSelectedId(null);
    loadZones(false); // ← no re-fit
  };

  /* ─── Drawing ─────────────────────────────────────────── */
  const activateClickDraw = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    setDrawMode("click");
    map.pm.enableDraw("Polygon", { snappable: false, allowSelfIntersection: false });
  };

  const activateFreehand = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    setDrawMode("freehand");
    map.dragging.disable();
    freehandActive.current = true;
    freehandPoints.current = [];
    freehandPolyline.current = L.polyline([], {
      color: "#ef4444", weight: 2.5, dashArray: "4 3", opacity: 0.85,
    }).addTo(map);

    // Throttle: only capture a new point if moved at least ~20m from last
    // (reduces point density dramatically without losing the shape)
    const MIN_DIST = 0.00018;

    const onDown = (e: any) => { if (freehandActive.current) freehandPoints.current = [e.latlng]; };
    const onMove = (e: any) => {
      if (!freehandActive.current || !freehandPoints.current.length) return;
      const last = freehandPoints.current[freehandPoints.current.length - 1];
      if (Math.hypot(e.latlng.lat - last.lat, e.latlng.lng - last.lng) < MIN_DIST) return;
      freehandPoints.current.push(e.latlng);
      freehandPolyline.current?.setLatLngs(freehandPoints.current);
    };
    const onUp = () => {
      if (!freehandActive.current) return;
      freehandActive.current = false;
      map.dragging.enable();
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      freehandPolyline.current?.remove();
      freehandPolyline.current = null;
      setDrawMode("none");

      const pts = freehandPoints.current.map(ll => [ll.lat, ll.lng]);
      if (pts.length < 5) {
        showMsg("error", "Dibuja un área más grande: mantén presionado y arrastra.");
        return;
      }
      // RDP removes remaining tremor/redundant points without changing the shape.
      // NO Chaikin — keeps squares as squares, not ovals.
      autoSave(cleanPolygon(rdp(pts, 0.00022)));
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
  }, []);

  const cancelDraw = () => {
    const map = leafletMapRef.current;
    if (map) { map.pm.disableDraw(); map.dragging.enable(); }
    freehandActive.current = false;
    freehandPolyline.current?.remove();
    freehandPolyline.current = null;
    setDrawMode("none");
  };

  /* ─── Render ──────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Ensure Geoman vertex markers sit above all Leaflet layers */}
      <style>{`
        .leaflet-pm-draggable-helper { cursor: grabbing !important; }
        .leaflet-vertex-icon,
        .leaflet-marker-icon.leaflet-pm-draggable {
          z-index: 9000 !important;
          cursor: grab !important;
          pointer-events: all !important;
        }
      `}</style>
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-3 flex-shrink-0">
        {onClose && (
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground h-8" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        )}
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-sm">Zonas de Alerta en Mapa</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />Guardando...
            </span>
          )}
          {!loading && zones.length > 0 && !editingId && (
            <Button size="sm" variant="ghost"
              className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
              onClick={handleDeleteAll}>
              <Trash2 className="w-3 h-3" />
              Borrar todas
            </Button>
          )}
        </div>
      </div>

      {/* Map — isolate creates a new stacking context so Leaflet z-indexes (400-700)
           don't escape and overlap the sticky header (z-30) */}
      <div className="flex-1 relative rounded-xl overflow-hidden border border-border/20 min-h-[450px] isolate">
        <div ref={mapRef} className="w-full h-full" />

        {/* Zone counter — top right */}
        <div className="absolute top-3 right-3 z-[999] rounded-lg bg-background/90 backdrop-blur-sm border border-border/20 px-3 py-1.5 shadow text-xs font-semibold flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
          {loading ? "..." : `${zones.length} zona${zones.length !== 1 ? "s" : ""} dibujada${zones.length !== 1 ? "s" : ""}`}
        </div>

        {/* Draw buttons — bottom left (hidden while editing) */}
        {!editingId && (
          <div className="absolute bottom-8 left-3 z-[999]">
            {drawMode === "none" ? (
              <div className="flex gap-2">
                <button onClick={activateClickDraw}
                  className="flex items-center gap-1.5 rounded-lg bg-background/90 backdrop-blur-sm border border-red-500/40 px-3 py-2 text-xs font-medium text-red-400 shadow hover:bg-red-500/10 transition-colors">
                  <MousePointer className="w-3.5 h-3.5" />
                  Clic a clic
                </button>
                <button onClick={activateFreehand}
                  className="flex items-center gap-1.5 rounded-lg bg-background/90 backdrop-blur-sm border border-red-500/40 px-3 py-2 text-xs font-medium text-red-400 shadow hover:bg-red-500/10 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                  Mano libre
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-background/90 backdrop-blur-sm border border-red-500/30 px-3 py-2 shadow">
                {drawMode === "click"
                  ? <MousePointer className="w-4 h-4 text-red-400 flex-shrink-0" />
                  : <Pencil className="w-4 h-4 text-red-400 animate-pulse flex-shrink-0" />}
                <span className="text-xs text-red-400 font-medium">
                  {drawMode === "click" ? "Clic a clic · doble clic para cerrar" : "Mantén presionado y arrastra"}
                </span>
                <button onClick={cancelDraw} className="ml-2 text-muted-foreground hover:text-foreground">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Edit mode HUD — bottom center */}
        {editingId && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 rounded-xl bg-background/92 backdrop-blur-sm border border-orange-500/40 px-5 py-3 shadow-lg">
            <PencilLine className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <span className="text-sm font-medium text-orange-400">
              Arrastra los vértices para ajustar la zona
            </span>
            <div className="h-5 w-px bg-border/50 mx-1" />
            <Button size="sm" className="h-7 gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white" onClick={saveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEdit}>
              <XCircle className="w-3 h-3" />
              Cancelar
            </Button>
          </div>
        )}

        {/* Auto-simplify hint */}
        <div className="absolute bottom-8 right-3 z-[999] flex items-center gap-1.5 rounded-lg bg-background/80 backdrop-blur-sm border border-amber-500/20 px-2.5 py-1.5 shadow text-[10px] text-amber-400/80">
          <WandSparkles className="w-3 h-3 flex-shrink-0" />
          Se cierra automáticamente
        </div>

        {/* Legend */}
        <div className="absolute bottom-[3.5rem] right-3 z-[999] flex flex-col gap-1 rounded-lg bg-background/85 backdrop-blur-sm border border-border/20 px-2.5 py-1.5 shadow text-[10px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-5 border-t border-dashed border-primary/50" />
            Zonas de cobertura
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <div className="w-5 h-2 rounded-sm bg-red-500/35 border border-red-500/50" />
            Zonas de alerta
          </div>
        </div>

        {/* Selected zone actions — top left */}
        {selectedId && !editingId && (
          <div className="absolute top-3 left-3 z-[999] flex items-center gap-2 rounded-lg bg-background/92 backdrop-blur-sm border border-red-500/30 px-3 py-2 shadow">
            <span className="text-xs text-muted-foreground">
              Zona {zones.findIndex(z => z.id === selectedId) + 1}
            </span>
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 text-orange-400 hover:bg-orange-500/10"
              onClick={() => startEdit(selectedId)}>
              <PencilLine className="w-3 h-3" />
              Editar
            </Button>
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 text-destructive hover:bg-destructive/10"
              onClick={() => handleDelete(selectedId)}>
              <Trash2 className="w-3 h-3" />
              Eliminar
            </Button>
            <button onClick={() => setSelectedId(null)} className="text-muted-foreground/50 hover:text-muted-foreground ml-1">
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Inline message — top center */}
        {mapMsg && (
          <div className={`absolute top-12 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm text-sm font-medium border
            ${mapMsg.type === "error"
              ? "bg-destructive/15 border-destructive/30 text-destructive"
              : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"}`}>
            {mapMsg.type === "error"
              ? <XCircle className="w-4 h-4 flex-shrink-0" />
              : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {mapMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}
