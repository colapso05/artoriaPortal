import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Portal from "./pages/Portal";
import PortalTecnicos from "./pages/PortalTecnicos";
import PortalSoporte from "./pages/PortalSoporte";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import BillingReturn from "./pages/BillingReturn";
import Privacidad from "./pages/Privacidad";
import Terminos from "./pages/Terminos";
import Cookies from "./pages/Cookies";
import { AppUpdater } from "./components/AppUpdater";
import Demo from "./pages/Demo";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppUpdater />
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
