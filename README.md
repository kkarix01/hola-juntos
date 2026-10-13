# Hola Juntos — Spanish flashcards PWA (starter v0.1)

A mobile-first React/Vite PWA starter with Supabase authentication, a private shared flashcard group, flashcard CRUD, individual progress, five-box review, and Spanish speech synthesis. Audio recording and push notifications are planned follow-up stages, not implemented in this starter.

## Requirements
- Node.js 20.19+ or 22.12+ recommended for current Vite.
- A Supabase project.

## 1. Install and run

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows Command Prompt use `copy .env.example .env.local` instead of `cp`.

## 2. Configure Supabase
1. Create a project at https://supabase.com/dashboard.
2. In **SQL Editor**, create a new query and run the complete `supabase/schema.sql` file.
3. In **Project Settings / API** (or Connect), copy the Project URL and publishable key into `.env.local`.
4. Never put a `service_role` or secret key in a browser app.
5. In **Authentication / URL Configuration**, set the local Site URL to `http://localhost:5173`. Add your eventual production URL to the allowed redirect URLs.
6. For easy first tests, either disable email confirmation in Auth settings temporarily, or keep it enabled and confirm each test account via the email link.
7. Restart Vite after changing `.env.local` (`Ctrl+C`, then `npm run dev`).

## 3. Test two users
1. Create account A and sign in.
2. Click **Utwórz bazę**, then open **Grupa** and copy the invitation code.
3. Sign out. Create account B in a private/incognito browser window (or on the other phone), then choose **Dołącz do bazy** and enter the code.
4. Add a test card on one device. It should appear on the other after refresh. Review it on both accounts: each account's box and due date are stored separately.

## 4. Production deployment (Cloudflare Pages)
1. Create a private GitHub repository and push this folder.
2. In Cloudflare Dashboard choose **Workers & Pages → Create → Pages → Import an existing Git repository**.
3. Build command: `npm run build`; output directory: `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build environment variables.
5. Deploy, then add the deployed URL to Supabase Auth's Site URL / allowed redirect URLs.
6. Test account creation, invite joining and card sync on both phone types over HTTPS.

## Notes / known MVP limits
- One account can belong to one study group in this MVP. The invite code is a bearer invitation; share it only with people you want in the group.
- A group creator can currently share the code with additional people. There is no invite expiry/revocation UI yet.
- Audio recording and shared playback are not implemented yet.
- Push notifications (daily reminders and random vocabulary) are not implemented yet. Web push needs service-worker subscription handling and a server-side sender (for example Supabase Edge Functions plus scheduled execution); it should be added only after the basic app works.
- Review scheduling is a simple starter algorithm, not a validated spaced-repetition model.
- Do not use this as a security-audited production service without reviewing the schema and RLS policies.
