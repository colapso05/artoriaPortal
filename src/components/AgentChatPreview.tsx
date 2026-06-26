import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoMark } from "@/components/Logo";

const CONVERSATION = [
  { from: "client", text: "Hola, llevo unos días con problemas de WiFi 😕", time: "11:02" },
  { from: "agent",  text: "¡Hola! Lamento escuchar eso. Para revisar tu conexión, ¿me indicas el RUT del titular?", time: "11:03" },
  { from: "client", text: "14.567.832-1", time: "11:04" },
  { from: "agent",  text: "Gracias, Valeria 😊 He revisado tu cuenta y está todo en orden. ¿Qué problemas estás notando exactamente con el WiFi?", time: "11:05" },
  { from: "client", text: "El WiFi 5G desaparece y solo queda el 2.4G", time: "11:10" },
  { from: "agent",  text: "Entendido. He derivado tu caso a un especialista que lo revisará a la brevedad 🛠️\n\n¡Gracias por tu paciencia, Valeria! 😊", time: "11:11" },
];

// Delay (ms) antes de mostrar cada mensaje
const DELAYS = [600, 2200, 1400, 2800, 1600, 3000];
const RESTART_DELAY = 4000;

function Bubble({ msg, visible }: { msg: typeof CONVERSATION[0]; visible: boolean }) {
  const isAgent = msg.from === "agent";
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className={`flex items-end gap-1.5 ${isAgent ? "justify-end" : "justify-start"}`}
        >
          <div className={`max-w-[80%] px-3.5 py-2 text-[12.5px] leading-snug rounded-2xl whitespace-pre-wrap ${
            isAgent
              ? "bg-gradient-to-br from-sky-500 to-cyan-500 text-white rounded-br-sm"
              : "bg-white/10 text-foreground/90 border border-white/10 rounded-bl-sm"
          }`}>
            {msg.text}
            <span className={`block text-right text-[10px] mt-0.5 ${isAgent ? "text-white/60" : "text-foreground/40"}`}>
              {msg.time}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TypingIndicator({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.2 }}
          className="flex justify-start"
        >
          <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex gap-1">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="w-1.5 h-1.5 rounded-full bg-foreground/50"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: d * 0.12 }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AgentChatPreview() {
  const [shown, setShown] = useState<number[]>([]);
  const [typing, setTyping] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    function clearAll() {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    }

    function runConversation() {
      setShown([]);
      setTyping(false);

      let accumulated = 0;
      CONVERSATION.forEach((msg, i) => {
        accumulated += DELAYS[i];
        const t = accumulated;

        if (msg.from === "client") {
          // Mostrar "escribiendo..." 800ms antes del mensaje del cliente
          const tt = setTimeout(() => setTyping(true), t - 800);
          timeoutsRef.current.push(tt);
        }

        const tm = setTimeout(() => {
          setTyping(false);
          setShown((prev) => [...prev, i]);
        }, t);
        timeoutsRef.current.push(tm);
      });

      // Reiniciar después de la última burbuja
      const total = accumulated + RESTART_DELAY;
      const tr = setTimeout(() => runConversation(), total);
      timeoutsRef.current.push(tr);
    }

    runConversation();
    return clearAll;
  }, []);

  return (
    <div className="relative w-full max-w-[400px] mx-auto">
      <div className="absolute inset-0 -m-6 rounded-[2rem] bg-sky-500/20 blur-[60px] pointer-events-none" />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative glass rounded-[1.75rem] overflow-hidden border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400/30 to-slate-300/20 flex items-center justify-center">
              <span className="text-sm font-bold text-foreground/60">V</span>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0b1322]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Cliente</p>
            <p className="text-[11px] text-emerald-400 leading-tight">en línea</p>
          </div>
          <LogoMark size={20} idSuffix="-chat-header" />
        </div>

        {/* Mensajes */}
        <div className="p-4 space-y-2.5 min-h-[320px] flex flex-col justify-end">
          {CONVERSATION.map((msg, i) => (
            <Bubble key={i} msg={msg} visible={shown.includes(i)} />
          ))}
          <TypingIndicator visible={typing} />
        </div>

        {/* Input fake */}
        <div className="px-4 py-3 border-t border-white/10 bg-white/5 flex items-center gap-2">
          <div className="flex-1 h-9 rounded-full bg-white/8 border border-white/10 flex items-center px-4">
            <span className="text-[12px] text-foreground/40">Escribe un mensaje…</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default AgentChatPreview;
