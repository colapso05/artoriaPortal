import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetPath = path.join(__dirname, 'src', 'components', 'dashboard', 'WhatsAppInbox.tsx');

try {
  let content = fs.readFileSync(targetPath, 'utf-8');

  // 1. Central Header Replacement - make it very robust to whitespace/scaling
  // match explicitly line 985-987
  const regex1 = /<span className="font-bold text-\[15px\][^>]*">\s*\{selectedConv\.profile_name\s*\|\|\s*selectedConv\.wa_id\}\s*<\/span>/;
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
  const regex2 = /<p className="text-\[11px\][^>]*">\s*\{selectedConv\.wa_id\}\s*<\/p>/;
  
  if (!regex2.test(content)) {
     console.log("Regex 2 failed to match");
  } else {
     content = content.replace(regex2, `<p className="text-[12px] text-muted-foreground/80 mt-0.5 font-mono font-medium relative z-10">{selectedConv.wa_id}</p>`);
     console.log("Regex 2 replaced!");
  }

  fs.writeFileSync(targetPath, content, 'utf-8');
  console.log("File saved!");

} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
