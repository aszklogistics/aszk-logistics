# Panduan Pemasangan Admin (Setup Guide)

This turns the website into one the client can edit themselves: login, edit all text and numbers, replace photos, add/delete gallery photos. All free.

How it works: the website stays on GitHub Pages. Content and photos are stored in **Supabase** (free database + login + file storage). The page loads the saved content when visitors open it. The admin logs in at `admin.html`, which opens the same page in **edit mode**.

Until you finish this guide, the website still works as a normal static page (all original text is built in).

---

## Part 1: Create the Supabase project (about 5 minutes)

1. Go to **supabase.com** → **Start your project** → sign up (the client can use their own account, so they own the data).
2. **New project**: name it `aszk-logistics`, set a database password (save it somewhere safe), choose a region near Malaysia (e.g. **Southeast Asia (Singapore)**), plan **Free**.
3. Wait about 2 minutes until the project is ready.

## Part 2: Create the database (1 minute)

1. In Supabase, open **SQL Editor** → **New query**.
2. Open `setup.sql` from this folder, copy everything, paste it, click **Run**. You should see "Success".

## Part 3: Create the admin user

1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Enter the admin's e-mail and a password. Tick **Auto Confirm User**.
3. Go back to **SQL Editor**, run this (change the e-mail to the one you just created):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'admin@example.com'
on conflict do nothing;
```

Only users listed in this `admins` table can change anything. Anyone else who somehow signs up can still only read.

4. **Turn off public sign-ups** so nobody else can create accounts: **Authentication → Sign In / Providers** (or Settings) → disable **Allow new users to sign up**.

## Part 4: Connect the website

1. Supabase → **Project Settings → API**. Copy:
   - **Project URL**
   - the **anon / publishable** key (never the `service_role` key, which must stay secret)
2. Open `config.js` and paste them:

```js
window.CMS_CONFIG = {
  url: "https://xxxxxxxx.supabase.co",
  anonKey: "eyJ...your anon key..."
};
```

These two values are safe to be public. The database rules from `setup.sql` decide who can change data.

3. Supabase → **Authentication → URL Configuration**: set **Site URL** to your website address, e.g. `https://aszklogistics.github.io/aszk-logistics/` and add the same address plus `admin.html` under **Redirect URLs** (needed for "forgot password").

## Part 5: Upload to GitHub

Upload all files in this folder to your repository (replace the old ones), including the `.github` folder and `.nojekyll`. Wait 1–2 minutes.

> Tip: the `.github` folder is hidden on some computers. If drag-and-drop skips it, on GitHub use **Add file → Create new file**, type `.github/workflows/keepalive.yml`, and paste the file contents.

## Part 6: Keep the free database awake

Free Supabase projects pause after about a week without activity. The included `keepalive.yml` pings the database twice a week.

1. GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Add `SUPABASE_URL` (the Project URL) and `SUPABASE_ANON_KEY` (the anon key).
3. Open the **Actions** tab, select **keep-supabase-awake** → **Run workflow** once to confirm it shows a green tick.

(If a project ever pauses, open Supabase and click **Restore**. Content is not lost.)

---

## How the admin uses it

1. Open `https://<your-site>/admin.html` (or click the small **Admin** link at the very bottom of the website).
2. Log in with e-mail and password.
3. The website opens in **Edit Mode**:
   - **Click any text or number** and type. Orange dashed outlines show what is editable. Bold and italic via Ctrl+B / Ctrl+I.
   - **Click any picture** (orange dashed border) to replace it.
   - **Gallery:** press ✕ on a photo to delete it, or **+ Tambah gambar** to add one or many photos. Gallery changes save immediately.
   - Press **Simpan** at the bottom to save text and picture changes. Visitors see them straight away.
4. **Log keluar** when done.

Phone and email links update automatically when the number or address text is edited.

## What the admin cannot do (by design)
- Add or remove whole sections or cards. That is a design change, so ask the developer.
- Edit the top menu names.
- Paste in HTML or scripts. Only plain text with bold/italic is kept, for safety.

## For you (the developer): reuse for another client
1. Replace `index.html` content, logos and images for the new company.
2. Run the included `transform.py` on the new index.html (`python3 transform.py old.html new.html`), or add by hand: every text element needs a `data-key="kNNN"` attribute and every editable picture a `data-img="img_xxx"`. Keys must not change after the client starts editing, or their saved text will land in the wrong place.
3. Create a new Supabase project for that client and repeat Parts 1–6.

## Notes and limits
- Supabase and GitHub free-plan limits change. Check their current terms. At the time of writing, free Supabase includes about 500 MB database and 1 GB file storage. Photos are resized to 1600 px before upload to save space.
- Use a strong admin password. For a more private setup, the client can enable 2-factor auth in their own Supabase account.
- If a text edit ever looks wrong, in Supabase **Table Editor → site_content** delete that row to go back to the original built-in text.
