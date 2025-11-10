<!-- // [ADD] -->
# Supabase inicializálási lépések

1. **Supabase CLI telepítése (ha még nincs):**
   ```bash
   npm install -g supabase
   ```
2. **Projekt inicializálása helyben:**
   ```bash
   supabase init
   supabase start
   ```
3. **Környezeti változók felvétele:**
   - Másold a `.env.example` fájlt `.env` néven.
   - Töltsd ki a `VITE_SUPABASE_URL` és `VITE_SUPABASE_ANON_KEY` értékeket a Supabase projekted adataival.
   - Állítsd `VITE_ADMIN_MODE=true`-ra, ha az admin felületet teszteled.
4. **Adatbázis séma alkalmazása:**
   ```bash
   supabase db push --file supabase.sql
   ```
5. **Storage bucket létrehozása és nyilvánosra állítása:**
   ```bash
   supabase storage create-bucket videos --public
   ```
   - A fájlok a bucketben a `videos/{uuid}.mp4` útvonalon jelennek meg.
6. **Helyi fejlesztés:**
   - Indítsd el a statikus fájlokat kiszolgáló fejlesztői szervert (pl. `npm install -g serve && serve .`).
   - A frontendre a `.env` változókat egy egyszerű `env.js` scriptben is betöltheted:
     ```html
     <script>window.__ENV__ = { SUPABASE_URL: 'https://...', SUPABASE_ANON_KEY: '...' };</script>
     ```

A fenti lépésekkel a frontend képes lesz a Supabase Auth/Database/Storage szolgáltatásokat használni.
<!-- // [END] -->
