import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'server', '.data');
const FILE = path.join(DATA_DIR, 'usage.json');

type Usage = { [month: string]: number };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readUsage(): Usage {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    return JSON.parse(raw) as Usage;
  } catch {
    return {};
  }
}

function writeUsage(u: Usage) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(u), 'utf8');
}

export function checkAndIncrementMonthly(limit: number): { ok: boolean; remaining: number } {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const usage = readUsage();
  const count = usage[month] ?? 0;
  if (count >= limit) return { ok: false, remaining: 0 };
  usage[month] = count + 1;
  writeUsage(usage);
  return { ok: true, remaining: limit - usage[month] };
}




