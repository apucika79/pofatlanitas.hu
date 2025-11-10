# Supabase beállítási és deploy útmutató

## 1. Előkészületek
- Telepítsd a [Supabase CLI-t](https://supabase.com/docs/guides/cli):
  ```bash
  npm install -g supabase
  ```
- Hozd létre a `.env.local`, `.env.staging` és `.env.production` fájlokat (példák a repóban). Ezek tartalmazzák a következő kulcsokat:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publikus frontend kulcsok)
  - `SUPABASE_SERVICE_ROLE_KEY` (csak backend/szkriptek számára, **soha** ne add ki a frontendnek)
  - `SUPABASE_AUTH_REDIRECT_URL` (pl. `https://pofatlanitas.hu/admin.html`)
  - `VIDEO_BUCKET` (alapértelmezésben `videos`)
  - A `VITE_` előtaggal rendelkező duplikált változók biztosítják, hogy a build tool (pl. Vite) is olvassa a publikus értékeket.

## 2. Lokális fejlesztés
1. Inicializáld és indítsd a Supabase stack-et:
   ```bash
   supabase init
   supabase start
   ```
2. Másold a `.env.local` értékeit a futtatott környezetbe, vagy töltsd be őket shell-ből:
   ```bash
   source .env.local
   ```
3. Alkalmazd az adatbázis sémát és függvényeket:
   ```bash
   supabase db push --file supabase.sql
   ```
4. Hozd létre a publikus `videos` bucketet (ha még nem létezik):
   ```bash
   supabase storage create-bucket videos --public
   ```
5. Deploy-old a feltöltés utáni feldolgozást végző Edge Functiont:
   ```bash
   supabase functions deploy process-video --project-ref "<project-ref>"
   ```
   - Fejlesztés közben futtasd lokálisan: `supabase functions serve process-video`
6. Futtasd a statikus frontend kiszolgálását (például):
   ```bash
   npx serve .
   ```

## 3. Supabase Auth konfiguráció (e-mail / magic link)
1. A Supabase Dashboardon nyisd meg az **Authentication → Providers → Email** részt és engedélyezd az e-mail/Magic Link beléptetést.
2. Állítsd be a **Site URL**-t és a **Redirect URLs** mezőt úgy, hogy tartalmazza az admin felület URL-jét (pl. `https://pofatlanitas.hu/admin.html`). Ez illeszkedik az `SUPABASE_AUTH_REDIRECT_URL` értékhez.
3. A magic linkek működéséhez a frontend `config.js` a redirect URL-t használja, ezért győződj meg róla, hogy a `.env.*` fájlokban is a helyes URL szerepel.

## 4. Admin szerepkör beállítása
1. Hozz létre vagy importálj admin felhasználókat a Supabase Dashboard **Authentication → Users** menüpontjában.
2. A felhasználó(k) `app_metadata` mezőjében adj hozzá egy `roles` tömböt, amely tartalmazza az `"admin"` értéket. (Dashboard → User → Edit metadata → `{"roles": ["admin"]}`.)
3. Alternatívaként használhatod a service role kulcsot backend szkriptekhez, amelyek automatikusan beállítják az admin szerepet.
4. Csak a `roles` mezőben `admin` értékkel rendelkező felhasználók (vagy a service role) férhetnek hozzá a moderációs felülethez.

## 5. Deploy (GitHub Actions példa)
1. A GitHub repóban hozz létre a következő secret-eket:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_AUTH_REDIRECT_URL`
   - (opcionálisan) `VIDEO_BUCKET`, ha eltér az alapértelmezettől.
   - (opcionálisan) `VIDEO_MAX_FILE_SIZE` (byte-ban) és `UPLOAD_CHUNK_SIZE_MB` a nagy fájlok kezeléséhez.
   - (opcionálisan) `TRANSCODE_WEBHOOK_URL`, ha külső transzkód szolgáltatást használsz.
2. A build lépésben töltsd be a megfelelő `.env` fájlt (pl. staging deploy → `.env.staging`).
3. A deploy pipeline elején futtasd le az adatbázis migrációkat a service role kulccsal:
   ```bash
   SUPABASE_ACCESS_TOKEN="$SUPABASE_SERVICE_ROLE_KEY" supabase db push --file supabase.sql --project-ref "$SUPABASE_PROJECT_REF"
   ```
   - A `SUPABASE_PROJECT_REF` a Supabase projekt azonosítója (a URL-ben találod).
4. Ezután építsd és töltsd fel a statikus fájlokat (pl. `npm run build` → `dist/` deploy).
5. Biztosítsd, hogy a deploy-olt környezetben az `SUPABASE_*` és `VITE_SUPABASE_*` változók a hosting provider-en is be legyenek állítva.

## 6. Ellenőrzőlista
- [ ] `.env` fájlok kitöltve a megfelelő környezeti értékekkel.
- [ ] Supabase Auth (Email/Magic Link) engedélyezve.
- [ ] `SUPABASE_AUTH_REDIRECT_URL` és Dashboard redirect URL-ek egyeznek.
- [ ] Admin felhasználók `roles` mezője tartalmazza az `admin` értéket.
- [ ] Storage bucket publikus és elérhető.
- [ ] Deploy pipeline futtatja a `supabase db push`-t a service role kulccsal.
- [ ] Frontend deploy során a publikus kulcsok bekerülnek a környezetbe, a service role kulcs pedig csak a szerveroldali lépésekhez használatos.
- [ ] Edge Function `process-video` deploy-olva és engedélyezve.
- [ ] (Opcionális) Transzkód webhook URL beállítva és elérhető.
