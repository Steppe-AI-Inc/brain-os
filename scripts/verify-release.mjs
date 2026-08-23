import fs from 'fs';
const required = [
  'index.html',
  'styles.css',
  'vercel.json',
  'package.json',
  'supabase/schema-v0.7-production-core.sql',
  'supabase/migrations/202606190001_sem_brain_v071_production_core.sql',
  'supabase/functions/sem-ai-command/index.ts',
  'js/modules/deploymentCenter.js',
  'js/modules/productionCore.js',
  'api/ai-command.js'
];
let ok = true;
for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    ok = false;
  }
}
const html = fs.readFileSync('index.html', 'utf8');
for (const file of ['js/modules/deploymentCenter.js','js/modules/productionCore.js','js/modules/chatOps.js','js/modules/mindmap.js','js/modules/qaLab.js']) {
  if (!html.includes(file)) {
    console.error(`Script not loaded in index.html: ${file}`);
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log('SEM Brain v0.7.1 release verification passed.');
