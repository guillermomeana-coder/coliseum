// The shared cast. Final colors/descriptions are owned by the art track in assets-src/cast.json
// ({id,name,role,color,accent,description}[]); we read it if present and fall back to placeholders.
import fs from 'node:fs';
import path from 'node:path';
import type { AgentRole } from './protocol.js';

export interface CastMember {
  id: string;
  name: string;
  role: AgentRole;
  title: string;
  color: string;
  accent?: string;
  description: string;
}

export const LEAD_ID = 'carlos';
export const WORKER_IDS = ['lucia', 'mateo', 'vale', 'nico', 'sol'] as const;

const PLACEHOLDER: CastMember[] = [
  { id: 'carlos', name: 'Carlos', role: 'lead', title: 'Jefe', color: '#D97757', accent: '#3B2A20', description: 'Planifica el trabajo, divide en tareas, revisa y pregunta cuando importa.' },
  { id: 'lucia', name: 'Lucia', role: 'worker', title: 'Dev', color: '#8FA98B', accent: '#F4EFE6', description: 'Generalista cuidadosa; le gustan los CLIs y detalles de UX.' },
  { id: 'mateo', name: 'Mateo', role: 'worker', title: 'Dev', color: '#2FA3A0', accent: '#1F1E1D', description: 'Backend rapido; escribe los tests primero.' },
  { id: 'vale', name: 'Vale', role: 'worker', title: 'Dev', color: '#C9A227', accent: '#3B2A20', description: 'Pulido visual: output, colores, docs.' },
  { id: 'nico', name: 'Nico', role: 'worker', title: 'Dev', color: '#B4553A', accent: '#E9E1D3', description: 'Documentacion y release.' },
  { id: 'sol', name: 'Sol', role: 'worker', title: 'Dev', color: '#6F8FB5', accent: '#F4EFE6', description: 'Performance y herramientas.' },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function loadCast(projectRoot: string | undefined): { cast: CastMember[]; source: string } {
  const file = projectRoot ? path.join(projectRoot, 'assets-src', 'cast.json') : undefined;
  if (!file || !fs.existsSync(file)) return { cast: PLACEHOLDER, source: 'placeholder' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    // accepted shapes: [...], {agents:[...]}, {cast:[...]}
    const obj = raw as { agents?: unknown; cast?: unknown };
    const arr = Array.isArray(raw) ? raw : Array.isArray(obj.agents) ? obj.agents : Array.isArray(obj.cast) ? obj.cast : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const r of arr as Array<Record<string, unknown>>) if (typeof r?.id === 'string') byId.set(r.id, r);
    const cast = PLACEHOLDER.map((p) => {
      const r = byId.get(p.id);
      if (!r) return p;
      const title =
        typeof r.title === 'string' && r.title ? r.title : typeof r.role === 'string' && !['lead', 'worker'].includes(r.role) ? r.role : p.title;
      return {
        ...p,
        name: typeof r.name === 'string' && r.name ? r.name : p.name,
        title,
        color: typeof r.color === 'string' && HEX.test(r.color) ? r.color : p.color,
        accent: typeof r.accent === 'string' && HEX.test(r.accent) ? r.accent : p.accent,
        description: typeof r.description === 'string' ? r.description : p.description,
      } satisfies CastMember;
    });
    return { cast, source: file };
  } catch {
    return { cast: PLACEHOLDER, source: 'placeholder (cast.json unreadable)' };
  }
}
