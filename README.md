# Finanzas

PWA de finanzas personales que se despliega en tu propia cuenta de Cloudflare: cada persona instala la suya y sus datos no salen de su cuenta.

- Gastos e ingresos, cuentas y tarjetas, movimientos recurrentes y cobros pendientes.
- Financiaciones (préstamos y pagos a plazos), retenciones y objetivos de ahorro.
- Previsión de saldo, informe mensual en PDF y notificaciones push con recordatorios.
- Instalable en el móvil como app (PWA).

**Stack:** Vite + Preact (`src/`), Cloudflare Worker con Hono (`worker/`), base de datos D1 (`migrations/`), autenticación con Cloudflare Access.

## Requisitos

| Requisito | Para qué | Coste |
|---|---|---|
| [Node.js](https://nodejs.org) 22 o superior | Compilar y desplegar | — |
| Cuenta de [Cloudflare](https://dash.cloudflare.com/sign-up) | Worker, base de datos D1, cron y Browser Rendering (PDF) | Plan gratuito suficiente |
| Un dominio gestionado en Cloudflare | La app se sirve en un subdominio propio protegido por Access (no usa `workers.dev`) | El del dominio |
| Cloudflare Zero Trust | Inicio de sesión (Access) | Gratis hasta 50 usuarios |

Las notificaciones push en iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior).

## Instalación

### 1. Código y dependencias

```bash
git clone https://github.com/canoojson/finanzas.git
cd finanzas
npm install
npx wrangler login
cp wrangler.example.jsonc wrangler.jsonc
```

`wrangler.jsonc` contiene tu configuración (dominio, correos, claves) y está en `.gitignore`: no lo subas a ningún repositorio público.

### 2. Base de datos

```bash
npx wrangler d1 create finanzas
```

Copia el `database_id` que devuelve en `wrangler.jsonc` y aplica las migraciones:

```bash
npm run db:migrate:remote
```

### 3. Dominio

En `wrangler.jsonc`, cambia `routes[0].pattern` por el subdominio donde vivirá la app (por ejemplo `finanzas.tudominio.com`). El dominio tiene que estar añadido a tu cuenta de Cloudflare; el registro DNS lo crea Wrangler al desplegar.

### 4. Inicio de sesión con Cloudflare Access

1. Entra en [Zero Trust](https://one.dash.cloudflare.com) y elige un nombre de equipo. El dominio del equipo (`https://<equipo>.cloudflareaccess.com`) va en `TEAM_DOMAIN`.
2. **Access → Aplicaciones → Añadir → Autoalojada**, con el subdominio de la app.
3. Añádele una política **Permitir** con los correos que tendrán acceso (método de inicio de sesión: código por correo, Google, etc.).
4. Copia la **etiqueta de audiencia (AUD)** de la aplicación en `POLICY_AUD`.
5. Pon esos mismos correos, separados por comas, en `ALLOWED_EMAILS`. El Worker comprueba el token de Access y además esta lista; para dar acceso a alguien hay que añadirlo en los dos sitios.

### 5. Notificaciones push (VAPID)

```bash
npx @pushforge/builder vapid
```

- La clave pública va en `VAPID_PUBLIC_KEY` y tu correo de contacto en `VAPID_SUBJECT` (`mailto:tu@email.com`).
- La clave privada (JWK en JSON) se guarda como secreto, nunca en `wrangler.jsonc`:

```bash
npx wrangler secret put VAPID_PRIVATE_JWK
```

### 6. Desplegar

```bash
npm run deploy
```

Abre `https://finanzas.tudominio.com`, inicia sesión con uno de los correos permitidos y, en el móvil, usa «Añadir a pantalla de inicio».

## Actualizar

```bash
git pull
npm install
npm run db:migrate:remote   # solo si hay migraciones nuevas
npm run deploy
```

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars   # email simulado para local (sustituye a Access)
npm run db:migrate:local
npm run dev
```

Hace falta `wrangler.jsonc` (paso 1) y haber hecho `wrangler login`: el PDF de los informes usa Browser Rendering remoto incluso en local.

## Límites del plan gratuito

La app hace una petición por pantalla y un cron por hora, muy por debajo de las 100.000 peticiones diarias de Workers y de los límites de D1. Si se superan, Cloudflare no cobra: las peticiones fallan hasta el día siguiente.

## Estética Chiikawa

El código incluye la estética «Chiikawa», pero sus imágenes (© Nagano / San-X) no se distribuyen con el proyecto. Sin ellas la estética funciona igual, solo que sin ilustraciones; si quieres usarla con imágenes, coloca tus propios PNG en `public/chiikawa/` (`cabecera`, `resumen`, `movimientos`, `financiaciones`, `ahorro`, `retenciones`, `vacio`).

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE): puedes usar, modificar y compartir el código para cualquier fin no comercial (uso personal, educativo, organizaciones sin ánimo de lucro…). No está permitido venderlo ni usarlo con fines comerciales.
