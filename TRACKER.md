# Vettly launch tracker

Where the public-launch work stands, so anyone (or any new session) can pick up exactly where it stopped.
Work happens on the `dev` branch; each phase lands on `main` through one pull request. Rules for commits are in `CLAUDE.md`.

**Resume here:** the first unchecked box below. Update this file in the same commit as the work it describes.

## Decisions (approved)

- Names: Home → **Daybook** · layouts & shortcuts tab → **Atelier** · recycle bin → **The Attic** · API keys → **Key Ring** · manage account → **Passport**
- Sidebar: Daybook → Agent Toolbelt → Prep Studio → Brain Bento → Live Copilot → The Attic (hideable) → Atelier → Settings → About me
- AI provider order: **Gemini → Groq → Claude → OpenAI**. Users can save one key per provider; their own keys are used first, then the free daily allowance (25/day, `FREE_DAILY_AI`).
- Resume, job description and GitHub are optional. A new account starts completely empty.
- Must work on iPhone, iPad, Android, Mac and Windows (phone, tablet, laptop, desktop widths; touch and mouse).
- Stack stays plain HTML/CSS/JS + FastAPI (no framework rewrite). GSAP (pinned, cdnjs) only for the register page turns and the Bento topic cloud.

## Phase 0 · Groundwork

- [x] `dev` branch from `main`, commits unsigned as the repo owner
- [x] Backend runs locally against SQLite with fake Clerk users (`backend/test_accounts.py` passes)
- [x] Fresh-account audit: the API returns empty data; the pre-filled data came from `web/index.html`
- [x] This tracker

## Phase 1 · Launch blockers

- [ ] Remove the unauthenticated history sync from `acemate-backend.onrender.com` (`web/dashboard.js` `loadHistory`)
- [ ] Remove baked-in personal data: GitHub username, job description (title, company, text, chips, "SPEC ACTIVE"), resume pills, Copilot suggestions, `RADAR`/`WebVory` examples, mock conversations, backend "shailesh"/"radar" matchers, old "Acemate" naming
- [ ] Empty states for a new account; resume / JD / GitHub clearly optional
- [ ] Onboarding save: timeout, "Saving…", readable error with Retry (never stuck)
- [ ] One saved key per provider; router order Gemini → Groq → Claude → OpenAI
- [ ] CORS from `ALLOWED_ORIGINS`; `vercel.json` time limits for long AI routes
- [ ] Link previews (Open Graph / Twitter), icons, web manifest
- [ ] Hide the local "server URL" card on the hosted site

## Phase 2 · Structure, names, shortcuts

- [ ] Sidebar order and new names; phone More sheet
- [ ] Atelier tab: Theme Studio, chat looks, shortcuts, tab visibility
- [ ] The Attic tab with "Hide this tab" (saved per user)
- [ ] One shortcut registry driving real shortcuts + the list; command palette (Ctrl/⌘ K)
- [ ] Animated sun/moon theme switch (sign-in, onboarding, sidebar)

## Phase 3 · Key Ring, Passport, key guide

- [ ] Key Ring: provider cards, masked keys, show/hide, Test, Remove, deep links
- [ ] Illustrated step-by-step guide modal for Gemini, Groq, Claude, OpenAI
- [ ] Passport: account card, manage security (Clerk), export my data, delete, sign out

## Phase 4 · Daybook (home)

- [ ] Greeting, streak, today, stats, quick actions (registry), setup checklist, key health

## Phase 5 · Live Copilot register

- [ ] Chat threads in the backend (`chats` store + routes), old history migrated
- [ ] Book UI: page edges, chapters index, archive shelf, page-turn new chat, delete to The Attic
- [ ] Handwriting streaming with pen nib; chapter clock + answer stopwatch, synced
- [ ] Chat looks in Atelier

## Phase 6 · Brain Bento for every field

- [ ] Built-in lesson packs per field + Prep Studio category tiles per field
- [ ] Floating, bouncing topic cloud that expands into the lesson

## Phase 7 · Onboarding and tour

- [ ] "Power it up" page (Gemini + Groq free, fallback), router scene reordered
- [ ] "Make it yours" page (Atelier, shortcuts, hide The Attic)
- [ ] Tour stops for the new tabs and the Key Ring (with the AI Studio link)

## Phase 8 · Launch hardening

- [ ] Security review, accessibility audit, Lighthouse on the Vercel preview
- [ ] Device matrix: iPhone SE/15, Pixel, iPad portrait/landscape, 13" laptop, 1080p/1440p desktop
- [ ] Launch kit: share image, public README, privacy note on stored keys

## Settings only the owner can change (Vercel / Clerk)

- [ ] Clerk **production** instance and keys (removes "Development mode"); add the final domain
- [ ] `KEY_ENCRYPTION_SECRET` set in Vercel (without it, nobody can save their own key)
- [ ] `DATABASE_URL` (Neon Postgres) set in Vercel
- [ ] `ALLOWED_ORIGINS` = your domain(s), once Phase 1 lands
