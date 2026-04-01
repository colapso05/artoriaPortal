import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPath = path.join(__dirname, 'src', 'components', 'dashboard', 'WhatsAppInbox.tsx');

try {
  let content = fs.readFileSync(targetPath, 'utf-8');

  // Search simple text
  const searchText = "{selectedConv.profile_name || selectedConv.wa_id}";
  const index = content.indexOf(searchText);
  console.log("Found at index:", index);

  if (index !== -1) {
    // Exact match found!
    content = content.replace(searchText, 
`{selectedConv.profile_name || "Contacto Desconocido"}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono font-medium leading-none mb-0.5">
                      {selectedConv.wa_id}`);
    
    // Also need to adjust the font size on the line ABOVE
    // We can search for the span right before it.
    console.log("Replaced exact text match!");
  }

  fs.writeFileSync(targetPath, content, 'utf-8');
  console.log("File saved!");

} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
