const fs = require('fs');
const path = "c:/Users/lakeb/Downloads/ArtoriaPortal/spotlight-ai-friend-main/src/components/dashboard/WhatsAppInbox.tsx";

try {
  let content = fs.readFileSync(path, 'utf-8');

  // 1. Central Header Replacement
  const regex1 = /<span className="font-bold text-\[15px\] tracking-wide text-foreground">\s*\{selectedConv\.profile_name\s*\|\|\s*selectedConv\.wa_id\}\s*<\/span>/;
  if (!regex1.test(content)) {
    console.log("Regex 1 failed to match");
  } else {
    content = content.replace(regex1, 
`<span className="font-bold text-[14px] tracking-wide text-foreground leading-snug">
                      {selectedConv.profile_name || "Contacto Desconocido"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono font-medium leading-none mb-0.5">
                      {selectedConv.wa_id}
                    </span>`);
     console.log("Regex 1 replaced!");
  }

  // 2. Sidebar Header Replacement 
  const regex2 = /<p className="text-\[11px\] text-muted-foreground mt-1 tracking-widest uppercase font-semibold relative z-10">\s*\{selectedConv\.wa_id\}\s*<\/p>/;
  
  if (!regex2.test(content)) {
     console.log("Regex 2 failed to match");
  } else {
     content = content.replace(regex2, `<p className="text-[12px] text-muted-foreground/80 mt-0.5 font-mono font-medium relative z-10">{selectedConv.wa_id}</p>`);
     console.log("Regex 2 replaced!");
  }

  fs.writeFileSync(path, content, 'utf-8');
  console.log("File saved!");

} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
