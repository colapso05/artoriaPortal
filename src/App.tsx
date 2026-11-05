import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Suspense, lazy } from "react";
import Index from "./pages/Index";
import { AppUpdater } from "./components/AppUpdater";

// El inicio (/) queda estatico: es la primera pantalla y no queremos un salto extra
// de red antes del primer render. El resto entra por lazy(): el dashboard arrastra
// recharts y los mapas, y el portal/login no los necesita.
const Portal = lazy(() => import("./pages/Portal"));
const PortalTecnicos = lazy(() => import("./pages/PortalTecnicos"));
const PortalSoporte = lazy(() => import("./pages/PortalSoporte"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Demo = lazy(() => import("./pages/Demo"));
const BillingReturn = lazy(() => import("./pages/BillingReturn"));
const Privacidad = lazy(() => import("./pages/Privacidad"));
const Terminos = lazy(() => import("./pages/Terminos"));
const Cookies = lazy(() => import("./pages/Cookies"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Fallback sobrio: evita el salto visual mientras baja el chunk de la ruta.
const CargandoRuta = () => <div className="min-h-screen bg-background" aria-busy="true" />

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppUpdater />
          <Suspense fallback={<CargandoRuta />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/portal" element={<Portal />} />
              <Route path="/demo" element={<Demo />} />
              {/* El login vive en /portal, pero /login es lo que alguien escribe de memoria.
                  Antes caia en el 404 generico. */}
              <Route path="/login" element={<Navigate to="/portal" replace />} />
              <Route path="/ingresar" element={<Navigate to="/portal" replace />} />
              <Route path="/portal-tecnicos" element={<PortalTecnicos />} />
              <Route path="/soporte" element={<PortalSoporte />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/billing/return" element={<BillingReturn />} />
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/terminos" element={<Terminos />} />
              <Route path="/cookies" element={<Cookies />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
