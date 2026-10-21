import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Env } from './auth';

export type AppEnv = { Bindings: Env; Variables: { email: string } };

type Field =
  | { type: 'text'; required?: boolean; max?: number }
  | { type: 'int'; required?: boolean; min?: number; max?: number }
  | { type: 'real'; required?: boolean; min?: number; max?: number }
  | { type: 'bool' }
  | { type: 'date'; required?: boolean }
  | { type: 'enum'; values: string[]; required?: boolean }
  | { type: 'ref'; table: 'accounts' | 'categories' | 'loans'; required?: boolean };

export type Spec = Record<string, Field>;

const bad = (msg: string) => new HTTPException(400, { message: msg });

/** Valida y normaliza el cuerpo según la especificación. `partial` permite omitir campos. */
export async function validate(
  db: D1Database,
  owner: string,
  body: Record<string, unknown>,
  spec: Spec,
  partial = false,
): Promise<Record<string, string | number | null>> {
  const out: Record<string, string | number | null> = {};
  for (const [key, f] of Object.entries(spec)) {
    if (!(key in body)) {
      if (!partial && 'required' in f && f.required) throw bad(`Falta el campo ${key}`);
      continue;
    }
    let v = body[key];
    if (v === '' || v === undefined) v = null;
    if (v === null) {
      if ('required' in f && f.required) throw bad(`El campo ${key} es obligatorio`);
      out[key] = f.type === 'bool' ? 0 : null;
      continue;
    }
    switch (f.type) {
      case 'text':
        if (typeof v !== 'string') throw bad(`${key} debe ser texto`);
        out[key] = v.trim().slice(0, f.max ?? 200);
        break;
      case 'int':
      case 'real': {
        const n = Number(v);
        if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) throw bad(`${key} no es un número válido`);
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw bad(`${key} fuera de rango`);
        out[key] = n;
        break;
      }
      case 'bool':
        out[key] = v ? 1 : 0;
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${key} debe ser una fecha AAAA-MM-DD`);
        out[key] = v;
        break;
      case 'enum':
        if (!f.values.includes(v as string)) throw bad(`${key} no válido`);
        out[key] = v as string;
        break;
      case 'ref': {
        const id = Number(v);
        const row = await db.prepare(`SELECT id FROM ${f.table} WHERE id = ? AND owner = ?`).bind(id, owner).first();
        if (!row) throw bad(`${key} no existe`);
        out[key] = id;
        break;
      }
    }
  }
  return out;
}

interface CrudOptions {
  table: string;
  spec: Spec;
  order: string;
  /** false para definir un listado propio. */
  list?: boolean;
  /** Ajustes y comprobaciones extra antes de guardar. */
  before?: (data: Record<string, any>, ctx: { db: D1Database; owner: string; id?: number }) => Promise<void> | void;
}

/** Rutas REST básicas (listar, crear, editar, borrar) limitadas al usuario actual. */
export function crud({ table, spec, order, list = true, before }: CrudOptions) {
  const app = new Hono<AppEnv>();

  if (list) app.get('/', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE owner = ? ORDER BY ${order}`)
      .bind(c.var.email)
      .all();
    return c.json(results);
  });

  app.post('/', async (c) => {
    const db = c.env.DB;
    const data = await validate(db, c.var.email, await c.req.json(), spec);
    await before?.(data, { db, owner: c.var.email });
    const cols = Object.keys(data);
    const row = await db
      .prepare(
        `INSERT INTO ${table} (owner, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')}) RETURNING *`,
      )
      .bind(c.var.email, ...Object.values(data))
      .first();
    return c.json(row, 201);
  });

  app.put('/:id{[0-9]+}', async (c) => {
    const db = c.env.DB;
    const id = Number(c.req.param('id'));
    const data = await validate(db, c.var.email, await c.req.json(), spec, true);
    await before?.(data, { db, owner: c.var.email, id });
    const cols = Object.keys(data);
    if (!cols.length) throw bad('Nada que actualizar');
    const row = await db
      .prepare(`UPDATE ${table} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND owner = ? RETURNING *`)
      .bind(...Object.values(data), id, c.var.email)
      .first();
    if (!row) throw new HTTPException(404, { message: 'No encontrado' });
    return c.json(row);
  });

  app.delete('/:id{[0-9]+}', async (c) => {
    try {
      const res = await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND owner = ?`)
        .bind(Number(c.req.param('id')), c.var.email)
        .run();
      if (!res.meta.changes) throw new HTTPException(404, { message: 'No encontrado' });
    } catch (e) {
      if (e instanceof Error && /FOREIGN KEY/i.test(e.message))
        throw new HTTPException(409, { message: 'Está en uso por otros datos. Archívalo en lugar de borrarlo.' });
      throw e;
    }
    return c.body(null, 204);
  });

  return app;
}
