import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPath = path.join(__dirname, 'src', 'components', 'dashboard', 'WhatsAppInbox.tsx');

try {
  let content = fs.readFileSync(targetPath, 'utf-8');
  let lines = content.split('\n');
  let replaced = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find the line that matches exactly the conditions
    if (line.includes('selectedConv.profile_name') && line.includes('selectedConv.wa_id') && line.includes('||')) {
      console.log(`Matched line ${i + 1}: ${line}`);
      
      // Replace the exact string
      lines[i] = line.replace('{selectedConv.profile_name || selectedConv.wa_id}', '{selectedConv.profile_name || "Contacto Desconocido"}');
      
      // We also need to add the new elements inside the layout hierarchy
      // Line index i is the text line. Line i+1 is likely </span>.
      if (lines[i+1] && lines[i+1].includes('</span>')) {
          // Add the new elements below the current line but before the closing span
          lines.splice(i + 1, 0, 
`                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono font-medium leading-none mb-0.5">
                      {selectedConv.wa_id}`);
          console.log("Successfully inserted!");
          replaced = true;
          break; // Stop after first match (usually our header)
      } else {
         console.log("Line below is not </span>, skipping...");
      }
    }
  }

  if (replaced) {
    fs.writeFileSync(targetPath, lines.join('\n'), 'utf-8');
    console.log("File saved!");
  } else {
    console.log("No replacements made.");
  }

} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
