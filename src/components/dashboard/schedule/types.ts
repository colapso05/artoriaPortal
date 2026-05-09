export type AppointmentStatus = 'pendiente' | 'en_camino' | 'completado' | 'cancelado' | 'en_espera';

export interface Technician {
  id: string;
  company_id: string;
  name: string;
  color: string;
  phone?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TechnicianSchedule {
  id?: string;
  technician_id: string;
  day_of_week: number; // 0=Dom, 1=Lun … 6=Sáb
  start_time: string;  // "HH:MM"
  end_time: string;
  is_day_off: boolean;
}

export interface TechnicianException {
  id: string;
  technician_id: string;
  exception_date: string; // "YYYY-MM-DD"
  is_available: boolean;
  reason?: string | null;
}

export interface Appointment {
  id: string;
  company_id: string;
  technician_id: string;
  conversation_id?: string | null;
  client_name: string;
  client_rut?: string | null;
  client_address: string;
  client_phone?: string | null;
  service_type: string;
  notes?: string | null;
  start_datetime: string; // ISO
  duration_minutes: number;
  status: AppointmentStatus;
  created_by: string;
  created_at: string;
  technician?: Technician;
}

export const TECH_COLORS = [
  '#6366f1', '#ec4899', '#10b981', '#f59e0b',
  '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4',
  '#84cc16', '#f97316',
];

export const DEFAULT_SERVICE_TYPES = [
  'Instalación', 'Reparación', 'Retiro', 'Mantenimiento', 'Visita técnica', 'Configuración',
];

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente:  'Pendiente',
  en_camino:  'En camino',
  completado: 'Completado',
  cancelado:  'Cancelado',
  en_espera:  'En espera',
};

export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pendiente:  'text-amber-500 bg-amber-500/10 border-amber-500/30',
  en_camino:  'text-blue-500 bg-blue-500/10 border-blue-500/30',
  completado: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  cancelado:  'text-red-500 bg-red-500/10 border-red-500/30',
  en_espera:  'text-violet-500 bg-violet-500/10 border-violet-500/30',
};

export const DAY_NAMES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export const DAY_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
