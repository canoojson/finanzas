import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TEAM_DOMAIN: string; // https://<equipo>.cloudflareaccess.com
  POLICY_AUD: string; // AUD de la aplicación de Access (admite varios separados por comas)
  ALLOWED_EMAILS: string; // lista blanca separada por comas (segunda barrera además de Access)
  DEV_EMAIL?: string; // solo en .dev.vars para desarrollo local
  VAPID_PUBLIC_KEY: string;
  VAPID_SUBJECT: string;
  VAPID_PRIVATE_JWK: string; // secreto
  BROWSER: Fetcher; // Browser Rendering (PDF de los informes)
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/** Devuelve el email del usuario autenticado por Cloudflare Access, o null. */
export async function authenticate(req: Request, env: Env): Promise<string | null> {
  const host = new URL(req.url).hostname;
  if (env.DEV_EMAIL && (host === 'localhost' || host === '127.0.0.1')) return env.DEV_EMAIL.toLowerCase();

  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  try {
    const { payload } = await jwtVerify(token, jwks(env.TEAM_DOMAIN), {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD.split(',').map((s) => s.trim()),
    });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    if (!email) return null;
    const allowed = env.ALLOWED_EMAILS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(email) ? email : null;
  } catch {
    return null;
  }
}
