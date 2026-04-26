# Portal Artoria — Frontend (React + Vite)

Al comenzar cualquier sesión, lee obligatoriamente este archivo antes de responder cualquier consulta técnica:

`C:\Users\demis\.claude\projects\C--Users-demis-Documents-PaginaWeb\memory\ARQUITECTURA_PROYECTO.md`

Contiene: stack completo, tablas de BD, edge functions, flujos clave, patrones de código, reglas de seguridad y metodología del proyecto.

## Reglas rápidas frontend
- Nunca hardcodear `service_role` key — usar edge function `get-service-key`
- Siempre filtrar por `company_id` en queries
- Vista simulada admin_isp: usar `company_id` de la empresa simulada, no del admin
- `get_company_credits` RPC retorna array → usar `Array.isArray(data) ? data[0] : data`
- Variables sensibles: usar `get-config` edge function, nunca `VITE_*`
