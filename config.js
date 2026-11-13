// ---------------------------------------------------------------
//  Website <-> Supabase connection
//  Leave both values empty to run the website as a plain static
//  page (no admin, no database). Fill them in after you follow
//  SETUP-GUIDE.md. These two values are SAFE to be public:
//  the database rules (setup.sql) decide who can change data.
// ---------------------------------------------------------------
window.CMS_CONFIG = {
  url: "https://wzyeloegynricfmwkjrj.supabase.co",      // e.g. "https://wzyeloegynricfmwkjrj.supabase.co"
  anonKey: "sb_publishable_6PP-9l-7p2If8xTnOaPmiw_fQziqEHx"   // the "anon" / "publishable" key from Supabase > Project Settings > API
};
