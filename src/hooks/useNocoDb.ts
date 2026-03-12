import { supabase } from "@/integrations/supabase/client";
import { useState, useCallback } from "react";

export interface NocoRecord {
  Id: number;
  [key: string]: any;
}

export interface NocoListResponse {
  list: NocoRecord[];
  pageInfo: {
    totalRows: number;
    page: number;
    pageSize: number;
    isFirstPage: boolean;
    isLastPage: boolean;
  };
}

export interface NocoFieldOption {
  id: string;
  title: string;
  color?: string;
  order?: number;
}

export interface NocoFieldMeta {
  id: string;
  title: string;
  uidt: string;
  pv?: boolean;
  system?: boolean;
  dtxp?: string;
  colOptions?: {
    options?: NocoFieldOption[];
  };
}

export function useNocoDb() {
  const [loading, setLoading] = useState(false);

  const invoke = useCallback(async (body: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("nocodb-proxy", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const listRecords = useCallback(async (tableId: string, query?: { limit?: number; offset?: number; where?: string; sort?: string }) => {
    setLoading(true);
    try {
      const result = await invoke({ action: "list", tableId, query });
      return result as NocoListResponse;
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  const createRecord = useCallback(async (tableId: string, data: Record<string, any>) => {
    return invoke({ action: "create", tableId, data });
  }, [invoke]);

  const updateRecord = useCallback(async (tableId: string, data: Record<string, any>) => {
    return invoke({ action: "update", tableId, data });
  }, [invoke]);

  const deleteRecord = useCallback(async (tableId: string, data: { Id: number }[]) => {
    return invoke({ action: "delete", tableId, data });
  }, [invoke]);

  const getTableMeta = useCallback(async (tableId: string) => {
    return invoke({ action: "meta", tableId });
  }, [invoke]);

  const listTables = useCallback(async (baseId: string) => {
    return invoke({ action: "list-tables", baseId });
  }, [invoke]);

  return { listRecords, createRecord, updateRecord, deleteRecord, getTableMeta, listTables, loading };
}
