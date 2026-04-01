import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPath = path.join(__dirname, 'src', 'components', 'dashboard', 'WhatsAppInbox.tsx');

try {
  const content = fs.readFileSync(targetPath, 'utf-8');
  const lines = content.split('\n');
  
  console.log("Printing lines 975-995: ");
  for (let i = 975; i < Math.min(lines.length, 995); i++) {
    console.log(`[Line ${i + 1}]: |${lines[i]}|`);
  }

} catch (err) {
  console.error("Error:", err);
  process.exit(1);
}
