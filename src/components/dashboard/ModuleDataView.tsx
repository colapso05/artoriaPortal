import { useState, useEffect, useCallback, useMemo } from "react";
import { useNocoDb, NocoRecord, NocoFieldMeta } from "@/hooks/useNocoDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Search, Plus, ChevronLeft, ChevronRight, Pencil, Trash2,
  Save, Eye, FileText, RefreshCw, MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ModuleDataViewProps {
  moduleId: string;
  moduleName: string;
  tableId: string;
}

export default function ModuleDataView({ moduleId, moduleName, tableId }: ModuleDataViewProps) {
  const { listRecords, createRecord, updateRecord, deleteRecord, getTableMeta, loading } = useNocoDb();
  const [records, setRecords] = useState<NocoRecord[]>([]);
  const [fields, setFields] = useState<NocoFieldMeta[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<NocoRecord | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newData, setNewData] = useState<Record<string, any>>({});
  const [viewMode, setViewMode] = useState<"view" | "edit">("view");
  const [initialLoad, setInitialLoad] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<NocoRecord | null>(null);
  const { toast } = useToast();
  const pageSize = 10;

  const visibleFields = useMemo(
    () => fields.filter(f => !f.system && f.title !== "Id"),
    [fields]
  );

  // Show up to 7 columns in the table
  const tableColumns = useMemo(() => visibleFields.slice(0, 7), [visibleFields]);

  // Detect SingleSelect fields and their options
  const fieldOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    fields.forEach(f => {
      if (f.uidt === "SingleSelect" && f.colOptions?.options) {
        map[f.title] = f.colOptions.options.map(o => o.title);
      } else if (f.uidt === "SingleSelect" && f.dtxp) {
        // dtxp can contain comma-separated options like 'opt1','opt2'
        const opts = f.dtxp.split(",").map(s => s.replace(/'/g, "").trim()).filter(Boolean);
        if (opts.length > 0) map[f.title] = opts;
      }
    });
    return map;
  }, [fields]);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await getTableMeta(tableId);
      if (meta?.columns) setFields(meta.columns);
    } catch (err: any) {
      toast({ title: "Error cargando metadatos", description: err.message, variant: "destructive" });
    }
  }, [tableId, getTableMeta, toast]);

  const loadRecords = useCallback(async () => {
    try {
      const firstField = visibleFields[0]?.title;
      const result = await listRecords(tableId, {
        limit: pageSize,
        offset: page * pageSize,
        ...(search && firstField ? { where: `(${firstField},like,${search}%)` } : {}),
      });
      setRecords(result.list || []);
      setTotalRows(result.pageInfo?.totalRows || 0);
    } catch (err: any) {
      toast({ title: "Error cargando datos", description: err.message, variant: "destructive" });
    } finally {
      setInitialLoad(false);
    }
  }, [tableId, page, search, visibleFields, listRecords, toast]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (visibleFields.length > 0) loadRecords(); }, [visibleFields, page, loadRecords]);

  const handleSearch = () => { setPage(0); loadRecords(); };

  const cleanData = (data: Record<string, any>) => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const field = visibleFields.find(f => f.title === key);
      if (!field) continue;
      const isDateField = ["Date", "DateTime", "CreatedTime", "LastModifiedTime"].includes(field.uidt);
      if (isDateField && (value === "" || value === null || value === undefined)) {
        cleaned[key] = null;
      } else if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const handleCreate = async () => {
    try {
      await createRecord(tableId, cleanData(newData));
      toast({ title: "Registro creado exitosamente" });
      setIsCreating(false);
      setNewData({});
      loadRecords();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!selectedRecord) return;
    try {
      await updateRecord(tableId, { Id: selectedRecord.Id, ...cleanData(editData) });
      toast({ title: "Registro actualizado" });
      setSelectedRecord(null);
      setViewMode("view");
      loadRecords();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (record: NocoRecord) => {
    try {
      await deleteRecord(tableId, [{ Id: record.Id }]);
      toast({ title: "Registro eliminado" });
      if (selectedRecord?.Id === record.Id) setSelectedRecord(null);
      setDeleteTarget(null);
      loadRecords();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openView = (record: NocoRecord) => {
    setSelectedRecord(record);
    const data: Record<string, any> = {};
    visibleFields.forEach(f => { data[f.title] = record[f.title] ?? ""; });
    setEditData(data);
    setViewMode("view");
  };

  const openEdit = (record: NocoRecord) => {
    setSelectedRecord(record);
    const data: Record<string, any> = {};
    visibleFields.forEach(f => { data[f.title] = record[f.title] ?? ""; });
    setEditData(data);
    setViewMode("edit");
  };

  const totalPages = Math.ceil(totalRows / pageSize);

  const truncate = (text: string, max = 40) => {
    if (!text || text.length <= max) return text || "—";
    return text.substring(0, max) + "…";
  };

  const getStatusBadge = (value: string) => {
    const lower = (value || "").toLowerCase();
    if (lower === "resuelto" || lower === "completado" || lower === "activo") {
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">{value}</Badge>;
    }
    if (lower === "pendiente" || lower === "en proceso") {
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">{value}</Badge>;
    }
    if (lower === "derivado") {
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">{value}</Badge>;
    }
    if (lower === "cerrado" || lower === "cancelado" || lower === "inactivo") {
      return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">{value}</Badge>;
    }
    return null;
  };

  const renderCellValue = (field: NocoFieldMeta, value: any) => {
    const str = String(value ?? "");
    // Check if this is a SingleSelect field with known options
    if (fieldOptions[field.title]) {
      const badge = getStatusBadge(str);
      if (badge) return badge;
      if (str) return <Badge variant="secondary" className="text-xs font-normal">{str}</Badge>;
      return "—";
    }
    const badge = getStatusBadge(str);
    if (badge) return badge;
    return truncate(str);
  };

  // Render field input for edit/create - uses Select for SingleSelect fields
  const renderFieldInput = (field: NocoFieldMeta, value: any, onChange: (val: string) => void) => {
    const options = fieldOptions[field.title];
    if (options && options.length > 0) {
      return (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className="bg-secondary/20 border-border/30 focus:border-primary/30 h-10">
            <SelectValue placeholder={`Seleccione ${field.title.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (String(value ?? "").length > 100) {
      return (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-border/30 bg-secondary/20 px-3 py-2.5 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/30 transition-colors"
          rows={4}
        />
      );
    }
    return (
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-secondary/20 border-border/30 focus:border-primary/30 h-10"
        placeholder={`Ingrese ${field.title.toLowerCase()}`}
      />
    );
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Buscar registros..."
            className="pl-9 h-10 bg-secondary/30 border-border/30 focus:bg-secondary/50 transition-colors"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-foreground"
          onClick={loadRecords}
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button onClick={() => { setIsCreating(true); setNewData({}); }} size="sm" className="h-10 gap-2 px-4">
          <Plus className="w-4 h-4" />
          Nuevo
        </Button>
      </div>

      {/* Data Table Card */}
      <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden">
        {/* Table header bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-card/30">
          <span className="text-sm font-medium text-foreground/80">
            {totalRows} registro{totalRows !== 1 ? "s" : ""}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[60px] text-center">
                {page + 1} de {totalPages}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Table content */}
        {initialLoad ? (
          <div className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-secondary/40 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No se encontraron registros</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Crea uno nuevo para empezar</p>
          </div>
        ) : (
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow className="border-border/15 hover:bg-transparent">
                  {tableColumns.map(f => (
                    <TableHead key={f.id} className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-semibold h-10 whitespace-nowrap">
                      {f.title}
                    </TableHead>
                  ))}
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map(record => (
                  <TableRow
                    key={record.Id}
                    className="border-border/10 cursor-pointer transition-all hover:bg-primary/5 group"
                    onClick={() => openView(record)}
                  >
                    {tableColumns.map((f, idx) => (
                      <TableCell key={f.id} className={`py-3 ${idx === 0 ? "font-medium text-foreground" : "text-muted-foreground text-sm"}`}>
                        {renderCellValue(f, record[f.title])}
                      </TableCell>
                    ))}
                    <TableCell className="py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-card border-border/40">
                          <DropdownMenuItem onClick={() => openView(record)} className="cursor-pointer gap-2 text-sm">
                            <Eye className="w-3.5 h-3.5" /> Ver detalle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(record)} className="cursor-pointer gap-2 text-sm">
                            <Pencil className="w-3.5 h-3.5" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(record); }}
                            className="cursor-pointer gap-2 text-sm text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente este registro. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View / Edit Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => { if (!open) { setSelectedRecord(null); setViewMode("view"); } }}>
        <DialogContent className="sm:max-w-xl border-border/30 bg-card max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b border-border/20">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base font-semibold">
                {viewMode === "edit" ? "Editar Registro" : "Detalle del Registro"}
              </DialogTitle>
              {viewMode === "view" && (
                <Button variant="outline" size="sm" onClick={() => setViewMode("edit")} className="gap-1.5 h-8 text-xs">
                  <Pencil className="w-3 h-3" />
                  Editar
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-5 py-4">
              {visibleFields.map(f => (
                <div key={f.id}>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-semibold mb-2 block">
                    {f.title}
                  </Label>
                  {viewMode === "edit" ? (
                    renderFieldInput(f, editData[f.title], (val) => setEditData(prev => ({ ...prev, [f.title]: val })))
                  ) : (
                    <div className="text-sm bg-secondary/15 rounded-lg px-3 py-2.5 border border-border/15 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto leading-relaxed">
                      {fieldOptions[f.title] ? (
                        getStatusBadge(String(editData[f.title] ?? "")) || String(editData[f.title] ?? "—")
                      ) : (
                        String(editData[f.title] ?? "—")
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {viewMode === "edit" && (
            <div className="flex gap-2 pt-4 flex-shrink-0 border-t border-border/20">
              <Button variant="outline" className="flex-1 h-10" onClick={() => setViewMode("view")}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} className="flex-1 h-10 gap-2">
                <Save className="w-4 h-4" />
                Guardar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-xl border-border/30 bg-card max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b border-border/20">
            <DialogTitle className="text-base font-semibold">Nuevo Registro</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-5 py-4">
              {visibleFields.map(f => (
                <div key={f.id}>
                  <Label className="text-[11px] uppercase tracking-wider text-muted-foreground/50 font-semibold mb-2 block">
                    {f.title}
                  </Label>
                  {renderFieldInput(f, newData[f.title], (val) => setNewData(prev => ({ ...prev, [f.title]: val })))}
                </div>
              ))}
            </div>
          </div>
          <div className="pt-4 flex-shrink-0 border-t border-border/20">
            <Button onClick={handleCreate} className="w-full h-10 gap-2">
              <Plus className="w-4 h-4" />
              Crear Registro
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
