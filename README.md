# ARTORIA Portal

## Configuración del Proyecto

Este proyecto requiere variables de entorno para conectarse a Supabase.

### Pasos para configurar:

1.  Copia el archivo `.env.example` a un nuevo archivo llamado `.env`.
2.  El archivo `.env` ya contiene los valores necesarios para el entorno de producción/demo.
3.  Si necesitas usar tu propio proyecto de Supabase, reemplaza los valores en `.env`.

```bash
# Ejemplo de archivo .env
VITE_SUPABASE_URL=https://supabase.artoria.cl
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_aqui
```

## Desarrollo

```bash
npm install
npm run dev
```
