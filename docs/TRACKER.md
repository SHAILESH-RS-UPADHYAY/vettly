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

- [x] Remove the unauthenticated history sync from `acemate-backend.onrender.com` (`web/dashboard.js` `loadHistory`)
- [x] Remove baked-in personal data: GitHub username, job description (title, company, text, chips, "SPEC ACTIVE"), resume pills, Copilot suggestions, `RADAR`/`WebVory` examples, mock conversations, backend "shailesh"/"radar" matchers, old "Acemate" naming
- [x] Empty states for a new account; resume / JD / GitHub clearly optional (JD skill chips detected for any field)
- [x] Onboarding save: 15 s timeout, "Saving…", readable error with Try again (never stuck)
- [x] One saved key per provider (`ai_keys`, last 4 only ever returned); router order Gemini → Groq → Claude → OpenAI; Mentor, evaluate and analyze use the chain too; `/api/ai-key/test` (no tokens spent); `backend/test_keys.py`
- [x] CORS from `ALLOWED_ORIGINS` (no credentials cross-site). Function time limit: owner checks it in Vercel (no `vercel.json`, to keep Vercel's zero-config FastAPI routing)
- [x] Link previews (Open Graph / Twitter) with `%SITE_URL%` filled per domain by `GET /`, share image, icons, web manifest; marked / DOMPurify / GSAP vendored in `web/vendor/`
- [x] Hide the local "server URL" card on the hosted site (`.hosted .local-only`)

## Phase 2 · Structure, names, shortcuts

- [x] Sidebar order and new names; phone More sheet (+ Search & commands, tour)
- [x] Atelier tab: Theme Studio, shortcuts, tab visibility (chat looks come in Phase 5)
- [x] The Attic tab with "Show this tab" switch, saved per account (`POST /api/prefs`) and cached locally
- [x] One shortcut registry (`web/shortcuts.js`) driving real shortcuts + the Atelier list; command palette (Ctrl/⌘ K, phone: More → Search & commands)
- [x] Animated sun/moon theme switch (sign-in, onboarding, sidebar)

## Phase 3 · Key Ring, Passport, key guide

- [x] Key Ring: provider cards in fallback order, masked keys, show/hide, paste-to-save, Test (no tokens), Replace, two-tap Remove, deep links (`web/keyring.js`)
- [x] Illustrated step-by-step guide modal for Gemini, Groq, Claude, OpenAI (drawn screens + moving cursor; last step drops you into that provider's box)
- [x] Passport: account card, manage security (Clerk), export my data (`GET /api/me/export`), delete, sign out. Removed the fake "Studio Readiness" card

## Phase 4 · Daybook (home)

- [x] Greeting, Up next (picks the most useful step), 7-day streak, Bento ring, real stats, quick actions from the registry, setup checklist, key chain (`web/daybook.js`). Also: every module is now on `window` (a top-level `const` is not), which fixed silent cross-module calls

## Phase 5 · Live Copilot register

- [x] Chat threads in the backend: `chapters` doc, `/api/chats` list/new/open/rename/archive/time/delete, old history becomes Chapter 1, torn-out chapters restore whole from The Attic (`backend/test_chapters.py`)
- [x] Book UI: stacked page edges, ribbon, chapters index (drawer on phones/tablets), archive shelf, page-turn on new/open chapter, tear-out flies to The Attic (`web/register.js`, `web/register.css`)
- [x] Answers written in ink word by word with a pen nib (Kalam; Devanagari too); chapter clock synced to the chapter; practice stopwatch (T) saved with the message as "spoke for m:ss"
- [x] Copilot looks in the Atelier: Manuscript, Field notebook, Ledger, Night library, Plain chat; ink effect on/off; N = new chapter

## Phase 6 · Brain Bento for every field

- [x] Built-in lesson packs per field (`web/bento-fields.js`: 86 lessons in 14 packs: interview craft, business/MBA,
      marketing, SEO, nursing, clinical medicine, finance, sales, design, education, operations, law, hospitality,
      public service); the field and role pick the packs, tech keeps its tracks plus interview craft
- [x] Prep Studio tiles per field with no AI call ("Other" still asks the AI, falling back to interview basics);
      "Business & management (MBA)" added to onboarding
- [x] Prep works with no resume: the onboarding profile becomes the context (`candidate_context()` in main.py)
- [x] "Fresh today": six AI-written lessons only when the user asks (opening Brain Bento no longer spends an answer)
- [x] The pond: every topic floats, drifts and bounces; it slows under the cursor, a finger holds it, a tap on the
      water sends a ripple, and a tapped topic grows into the lesson card; still cloud under reduced/calm motion
- [x] Checked: `backend/test_fields.py`; browser on desktop 1440/1280 dark, iPad both ways, iPhone 14/SE, Galaxy S9+

## Phase 7 · Onboarding and tour

- [x] "Power it up" page: a swinging key-ring plate, paste-to-save boxes for the two free keys (Gemini, Groq) with
      "Get a free key" links and the step-by-step guide; a rejected key reopens its box; local mode explains `.env`
- [x] Router scene and copy reordered: Gemini first, then Groq, Claude, OpenAI; context page says resume is optional
- [x] "Make it yours" page: an Atelier plate (theme flips, ⌘K palette, The Attic tucks away), the Attic switch
      (saved to the account) and three shortcuts (hidden on touch screens)
- [x] Tour: Daybook, Agent Toolbelt (optional), Prep, Bento, Copilot, The Attic (skipped when hidden), Atelier,
      Key Ring (with the aistudio.google.com/apikey link) and About me
- [x] Checked: fresh account through all 10 pages and the tour; key save, bad key, guide round-trip; iPhone 14/SE,
      iPad, dark; no overflow, no errors

## Phase 8 · Launch hardening

- [x] Security review of the whole branch: no high-confidence issues; `%SITE_URL%` now only takes a plain host
- [x] Accessibility (axe-core 4.10, WCAG A/AA + best practice) on all 9 pages, light and dark: 0 violations
      (Poster orange deepened to #cb4a08 and the classic grey to #56607a for 4.5:1 text; Copilot title tap area 44px)
- [x] Lighthouse (local, so no HTTP/2 or CDN): Accessibility, Best Practices, SEO 100; Performance desktop 77 → 95,
      mobile 56 → 66 (gzip on, scripts deferred, the Daybook date line held so nothing jumps; CLS 0.19 → 0.05)
- [x] Device matrix, every page: iPhone SE/15, Pixel 7, Galaxy S9+, iPad Mini, iPad Pro 11 landscape, 1280, 1080p,
      1440p: no sideways scroll, no small touch targets, no script errors
- [x] Launch kit: share image and icons (Phase 1), README "for every student" section and provider order,
      privacy page covers several keys, export, Key Ring removal and on-device settings
- [ ] Safari engine (WebKit is not installed here): check the Vercel preview on a real iPhone and Mac
- [ ] Lighthouse again on the Vercel preview (HTTP/2, CDN) once the owner settings below are in place

## Phase 9 · Polish after launch (requested 4 Nov)

- [x] "Redo onboarding" (Settings, ⌘K) runs all 10 pages with your answers filled in; "Your profile" stays a quick edit
- [x] Pretty, animated dropdowns everywhere (`web/picker.js`): icons, hints, check mark; mouse, touch and keyboard;
      opens in the top layer so dialogs never clip it; Esc closes only the menu
- [x] Role box types out roles (developer → MBA → AI → …) with tap-to-fill role chips for the chosen field
- [x] Live Copilot: chapter clock beside "Chapter I", stopwatch in the title row; writing area on a 1536×864 laptop
      ~320 → 571 px; phones fold into two slim rows (head 147 → 91 px); handwriting 1.14 → 1.27rem
- [x] Side panel: hover moves the icon and label, not the box (no more cut-off edge); gap before The Attic 13 px
- [x] Daybook leads with "Feed your Agent Toolbelt" (skippable), Toolbelt first in quick actions and the checklist
- [x] Animated tab changes: the new page grows as a circle out of its tab (sidebar, tab bar or More) while the old one
      sinks back and blurs, drifting the way you travel; still under reduced or calm motion
- [x] Key Ring: your own provider (OpenRouter, Together, DeepSeek, Mistral or any OpenAI-compatible API): base URL,
      model, key, "try it first"; https and public hosts only (checked on save and before every call, no redirects)
- [x] Checked: `backend/test_custom.py` plus the four older suites; browser: onboarding, dropdowns, Copilot sizes,
      Daybook order, transitions, Key Ring; device matrix and axe (0 issues on 9 pages, light and dark)

## Phase 10 · Speed, clocks and a look book (requested 5 Nov)

- [x] Live Copilot chapter actions feel instant. Tap → page responds, at 350 ms latency and a 4x slower CPU:
      new chapter 0.82 → 0.13–0.2 s, open a chapter 0.84 → 0.13 s, archive 2.14 → 0.08 s, open from the shelf
      0.78 → 0.05 s. How: chapters cached and prefetched on hover/touch (`GET /api/chats/{id}`, read-only), the clock
      saved in the background, new chapters appear before the server confirms, the page turn starts at once and draws
      under the leaf, pages already seen come back as they were, long chapters draw the visible end first, the flying
      copy carries only what is on screen; the server skips a write when a chapter is already open
- [x] Top right of Live Copilot: a live clock (the time now, with moving hands) and the practice stopwatch; the chapter
      timer is no longer shown (still counted for the chapter list); phones get a slim second row
- [x] The Look Book (`web/lookbook.js`): right after sign-up, before onboarding. A live miniature of the app built from
      the real components, nine looks drawn in their own colours, the whole app restyling from the tapped card as a
      circle, Day / Night / Match device, arrows/Enter/Esc, rail arrows and drag-with-momentum on desktop, swipe on
      phones; Skip or Esc puts everything back; again any time from the Atelier or ⌘K ("Change the look")
- [x] Research: live, reversible preview on tap; mini-UI cards over swatches; whole-word labels; sensible default
      and skip. GSAP SplitText vendored (3.13.0, free licence); Draggable was tried and dropped (it rewraps the rail)
- [x] Checked: design critique applied (rail arrows, 44 px mode buttons); axe 0 issues on the Look Book and all 9 pages,
      light and dark; device matrix clean; all browser suites and the five backend suites pass

## Phase 11 · Manage account, dressed for every look (requested 5 Nov)

- [x] The account window has Vettly's own tabs after Clerk's Profile and Security: **Key Ring** (the real one, same
      keys as Settings, kept in sync), **Your look** (Day / Night / Match device, the nine looks, the Look Book) and
      **Your data** (download a copy; delete everything with a two-tap confirm)
- [x] Clerk's own "API keys" tab is hidden (`apiKeysProps.hide`): those are developer keys, not your AI keys
- [x] The avatar menu: Manage account · Key Ring · Change the look · Sign out
- [x] `web/account.css`: the window and the menu follow the active look, day and night, from tokens only, with each
      look's signature (tape, ruled paper and a red margin, frosted glass, a drafting grid with corner ticks, sticker
      outlines, a blossom, dream glass, a scalloped trim, a pearl edge). Motion: the backdrop fades, the window rises,
      tabs and rows arrive one after another, the current tab's bar springs in, each page slides in on a tab switch;
      all of it stops under Calm or reduced motion
- [x] Clerk takes live CSS variables (`var(--accent)`…) where the browser has color-mix, so changing the look or
      Day / Night recolours even an open account window; older browsers get the values of the moment and a remount
- [x] Checked with the real clerk-js 5.128.1 run locally (its network answered by a test stand-in, sessions signed
      with a test key): menu items, tabs (API keys hidden), all five tabs in 9 looks × day/night, the phone drawer
      solid in every look and closing on a tab, live recolour, axe 0 issues on the real window (9 looks × 4 tabs);
      phones from 320 px and iPad fit with no sideways scroll; the regression suites and five backend suites pass.
      A last look on the Vercel preview with the real sign-in is still worth doing

## Phase 12 · Prep Studio: filters above, answers full width (requested 6 Nov)

- [x] The filters moved from a column beside the questions to a strip above them (tablets and up), so the questions
      and answers get the whole width: two columns of ~600 px on a 1536 px laptop, where there was one of 856 px.
      First row: Status (four tiles with live counts), Order, Answers; below: Categories and Difficulty, which fold
      away ("Fewer filters", remembered). The strip lays itself out by its own width (wide, middling, narrow)
- [x] The Filters button: on phones the same sheet as before; on larger screens it folds the strip when it is in
      view, and brings it back, unfolded, when you have scrolled down the answers
- [x] Beside the Mentor: with its panel on the right and room to spare, Prep Studio reflows into the space next to
      it instead of hiding under it. Questions left in view on a 1536 px laptop: Mentor open 446 → all of them;
      Ask Mentor desk 20 px → a full column; on 1920 px both stay two columns. The reflow happens once, after the
      panel has opened, and the page slides into place on the compositor (same frame cost as no reflow, measured
      with 80 questions). A panel dragged elsewhere, phones and small windows keep the overlay
- [x] Checked: filtering, fold (remembered, folded pills out of the Tab order), Filters button on desktop / iPad /
      phones, the phone sheet; all 9 looks day and night; axe 0 issues on Prep Studio; device matrix and the
      regression suites pass

## Phase 13 · Lighter Mentor, a new page, inked renames, readable answers, every screen (requested 5–6 Nov)

- [x] 13.1 Lighter, same look: pages were busy every frame before the Mentor opened. Entrance animations held fill
      "both" (63 of them, from-only keyframes) and kept their elements composited (Prep: 83 layers, 40 of them cards):
      now "backwards" (21 layers). The emblem's turning parts are each their own <svg>, turned by the compositor
      (checked frame by frame against the old one). The hidden panel's emblem and the off beam pause at rest.
      2x CPU: Prep idle 606 -> 355 ms/s, Daybook 291 -> 189; Daybook opening 34 -> 46 frames
- [x] 13.2 The empty Mentor page drops its own emblem (the header and launcher show it)
- [x] 13.3 Mentor: a New page pill (was an unlabelled refresh icon); the written page turns over the binding,
      Page N stamps, Undo for 7 s; also in the palette
- [x] 13.4 Live Copilot: Archive and Tear out on the far right; rename by ink (a nib by the title and by each
      chapter in the list; the old name blots away, the new one is written in); Blueprint's header slimmed so the
      book is full height
- [x] 13.6 Prep answers: real lists, bold labels, short paragraphs, markdown; word count and speaking time; long
      answers fold under a fade with Read the full answer; new and refined answers ink in; cards off screen skip
      layout (the Mentor's worst opening frame on a long bank 400 -> 183 ms)
- [x] 13.7 Every screen: phones get an account card in the More sheet (Clerk's menu and window could not open over
      it); the rail's footer centred under the icons in every side-panel style; the Daybook's setup and keys get a
      row each between phone and desktop; text fields do not raise the keyboard on their own on touch screens.
      Swept 9 pages on 18 screens (Mac, Windows, Linux, 2560, iPad mini / Air / Pro both ways, iPhone SE / 15 Pro
      Max, Pixel 7, 360 and 280 px phones): fixed the squeezed github.com field, 280 px titles and headers, and
      touch targets under 40 px
- [x] Checked: axe 0 issues on every page (light and dark) and on the new parts (Mentor, New page, Undo, rename,
      cards, the phone account card); real clerk-js run: menu, tabs, live recolour, axe 0, phones; Look Book, device
      matrix, Key Ring and clock suites; the five backend suites

## Phase 14 · The logo, the sign-in page, roles, and three fixes (requested 6 Nov)

- [x] 14.1 The Mentor's orb is Vettly's logo: the browser tab, the side panel, sign-in and onboarding. It keeps its
      motion and travels through the nine looks' colours every 6 s (registered colours, so each look blends into the
      next); it starts on the look you wear and rests in Calm, with reduced motion and in a hidden tab. App icons
      redrawn from it
- [x] 14.2 Sign-in copy: "Walk in ready." · "Made for nurses / analysts / engineers / designers / teachers /
      marketers" (each in a look's colour) · one-line lede · three points
- [x] 14.3 Sign-in motion (GSAP + SplitText): the orb spins in, "Vettly" drops letter by letter, the kicker wipes
      open, "Walk in" rises, "ready." stamps down and an ink line draws under it (click it for a splash), the lede
      sharpens word by word, the points' icons pop, the card rises and its tape slaps on. After: headline letters hop
      under the pointer, the card leans toward it, the grid paper lights around it. Done by about 2 s; Calm and
      reduced motion get the finished page, still. Screen readers get plain text (the split is undone after)
- [x] 14.5 Live Copilot: New chapter turns a real page (about 1.7 s, a copy of the old page lifts and turns over
      the spine); chapter numerals close up (delete II and III becomes II; shelved chapters show a shelf mark;
      restoring puts a chapter back in date order)
- [x] 14.6 Onboarding: up to four roles. Chips fly up into a tray and turn their + into a tick; type your own and
      press Enter; × or Backspace sends one back; a fifth is refused with a shake. Saved as `roles` (a list) and
      `role` (joined with " · ", since role names hold commas), so every prompt keeps working; the AI is told to
      prepare for any of them
- [x] 14.7 Google sign-in: the blank page on …clerk.accounts.dev is Clerk's own server handing Google's answer back.
      Vettly now says "Taking you to Google…" before you leave and "Signing you in…" from the first frame on the
      way back (no blank page, no replayed intro), steps aside at once on an error or a cancel, and no longer
      reloads the whole app after Clerk finishes. Fixed with it: the app's router wiped Clerk's #/sso-callback before
      Clerk loaded, so a Google sign-in that needed one more step never finished. To lose Clerk's address
      entirely, see the owner settings below
- [x] 14.8 iPad: a see-through list floated over onboarding page 04. Cause: the page focused the first field, which
      was the hidden native <select> behind the pretty dropdown, and iPadOS opens its own menu for a focused select.
      Hidden selects are now inert and focus goes to the dropdown's button. Also: page 04 no longer runs wider than
      the dialog on phones
- [x] Also: Clerk's "Continue with Google" text was black on navy at night (and grey under 4.5:1 in the pastel
      looks); Sakura's muted grey deepened to pass on every Sakura paper
- [x] Checked: axe 0 on every page (light and dark), on the role tray, the sign-in page in all nine looks and both
      themes, and the hand-off screens; frames of the intro in slow motion; the role tray on desktop, iPad, phones
      and dark; the iPad edit path; Look Book, device matrix, Key Ring, clock, Prep and real-Clerk suites; the five
      backend suites (a new roles test)

## Phase 15 · A logo that draws itself, sparkle tabs, a sign-in page that acts out its words (requested 6–7 Nov)

- [x] 15.1 Porcelain is the logo's home colour (an ivory disc, the sparkle in the theme's ink, also at night). It still
      travels through the looks and comes back; Register's ink is out of the cycle. Every colour of the orb (lines,
      comets, shading) is registered, so Porcelain's glaze blends into a look's gloss
- [x] 15.2 The splash, on every load: the logo is drawn on a construction sheet (hairlines from the centre, a compass
      with a pen riding it, the 35° axes and angle, a "48" dimension, the orbits, the star in outline, its ink, the
      porcelain), then flies to its ring (side panel, sign-in page, onboarding or, on a phone, the Mentor button) and
      the page opens out from where it lands. It covers the sign-in check (gives up after 9 s). A quicker take after the
      first load of a visit; a click or a key skips it; never with reduced motion, under Calm, or on the way back from
      Google
- [x] 15.3 The logo sits in a still ring. Within 5 cm of the pointer, the side panel's logo and the Mentor button wake:
      the ring fades in and the orb leans toward the pointer inside it (full strength within 3.5 cm, fading out by
      5 cm, so nothing snaps). The open Mentor always leans. The owner tried "always on", then "only when open",
      and settled on 5 cm
- [x] 15.4 Tabs open through Vettly's sparkle: a thin four-point star from the tab you chose, turning as it grows and
      filling out until it covers the page; the side panel's logo twirls once
- [x] 15.5 Sign-in page: every line acts out its words. "Walk in" walks in, "ready." is stamped and inked, the kicker is
      a ruled mono label (no more pill with a dot), "Made for ..." is a departures board flipping letter by letter,
      the lede is two plain sentences ("Bring your resume and the job you want. Vettly turns them into practice.")
      with a marker swipe, and the points are a numbered list between hairlines (a frame locks onto "exact", a voice
      wave talks while "Answers that sound like you" appears, the 5 counts up). The card is up first, so the form is
      usable while the words arrive
- [x] 15.6 Signing in flies the logo from the sign-in page to the side panel (on a phone, into the Mentor button)
- [x] 15.7 Repository tidied: one-off scripts nothing calls (check_context, verify_context, inject_context,
      inject_jd_github) and the unused ai/question_matcher shim removed; the three 1 MB JPEG screenshots removed (the
      app and the README use the WebP copies); resumes and local stores untracked and ignored (they stay on disk);
      .hallmark/ ignored
- [x] Checked: Playwright frames of the splash (light, dark, phone, quick take), the sign-in page (light, dark,
      phone, reduced motion), a tab change frozen mid-sparkle, the lean at three distances with the Mentor open and
      closed, onboarding and tablet headers, the sign-in hand-off; no console errors; the five backend test scripts
- [x] The "Merge pull request" commits #4 to #10 showed "Unverified" on GitHub (GitHub made them when a cloud
      session merged the pull requests). With the owner's go-ahead they were rewritten as plain merges by the owner
      (same files, same dates) and main was force-pushed; from #11 on, pull requests are merged the same plain way

## Phase 16 · Glazes, thrown paint, a pixel theme switch, sign-in concepts and a tidy layout (requested 7 Nov)

- [x] 16.1 Twelve light glazes for the logo, evenly around the colour wheel at one lightness (Coral, Apricot, Saffron,
      Pistachio, Matcha, Mint, Aqua, Sky, Periwinkle, Lilac, Orchid, Blush), each shaped like Porcelain. Order:
      Porcelain, three glazes, Porcelain... A new glaze every 10 s, and each one arrives as a drop of paint thrown at
      the logo
- [x] 16.2 The Ask Mentor button wears the glazes too (while its orb style is the default), 5 s and two glazes apart
      from the side panel's logo, so the two never match; a style picked in the Atelier is kept
- [x] 16.3 The 5 cm wake on the sign-up page and onboarding logos as well
- [x] 16.4 A slower, richer construction on load: the compass pen stops to measure, the figures are typed, a
      protractor arm swings to 35°, a glaze pass sweeps the porcelain. Then three throws of paint (red, yellow, green)
      colour the logo and it washes back to Porcelain before flying home. The full show once a day, a short take with
      one throw after that; a click or a key skips it
- [x] 16.5 Light and dark swap pixel by pixel: squares turn in a wave from the switch you pressed, with a little grain
      (an SVG mask on the view transition, no drawing per frame, every square turns once)
- [x] 16.6 Five sign-in page concepts for the owner to choose from (Green Room, Departures, Mock Interview,
      Sketchbook, Glaze Studio) and a board of the logo's glazes, each a private preview page. The chosen one will be
      built for real with Clerk inside its card
- [x] 16.7 The layout: web/ keeps its entry pages at the top with css/, js/ and img/ beside icons/ and vendor/;
      backend/tests/, scripts/ (the Windows launchers) and docs/ (this file and the README's figures). The README
      explains the structure
- [x] 16.8 Work happens on main only: no other branches, no pull requests (the owner's rule from 7 Nov). The merge
      commits GitHub made for #4 to #11 were rewritten as plain merges, so none shows "Unverified"
- [x] Checked: frames of the construction and the throws, the pixel switch mid-wave, the two logos taking their paint
      at 5 s and 10 s, no failed requests after the move (21 stylesheets, 26 scripts), every tab, the legal pages, and
      the five backend test scripts
- [x] The owner picked the Sketchbook (Phase 17)

## Phase 17 · The Sketchbook sign-in page, Porcelain first, ink for day and night (requested 7 Nov)

- [x] 17.1 The Sketchbook is the main sign-in page, with the real Clerk form inside its taped index card, drawn by hand
      (pen-outlined buttons a red pen circles on hover, a dashed line for the email, a highlighter for Continue); blue
      pen on cream by day, pale ink on a dark notebook at night
- [x] 17.2 The classic "Walk in ready." page stays: everyone new sees the Sketchbook; people with an account see it two
      visits in three and the classic page every third
- [x] 17.3 Porcelain holds twice as long as any glaze, so it is the colour seen most; bringing the pointer within 5 cm
      throws the next glaze at once (at most every 2.5 s); the two logos never match
- [x] 17.4 Day and night arrive as ink: a drop falls on the switch and the new theme bleeds across the page with a
      living, ragged edge and small blooms (replaces the pixel switch)
- [x] Checked: the Sketchbook light, dark and phone (no sideways scroll); live on Vercel as a new visitor with the real
      Clerk form; all thirteen glazes by day and night; the ink switch mid-bleed; the pointer throwing a glaze
- [x] 17.5 The Sketchbook fits every screen: sizes follow the screen's height too, Clerk's form is compact, the red rule
      is the heading's own edge, the two columns share one top line and are centred as a block
- [x] 17.6 A sticky note ("Nervous is normal. Unprepared is optional.") and a flashcard flipping through real questions
      from six fields fill the space below the list; on phones and upright tablets the sign-in card comes straight
      after the title, so the form is on the first screen
- [x] Checked live with the real Clerk form on 15 screens: iPhone SE, 15 and 15 Pro Max, iPad mini, iPad portrait and
      landscape, iPad Pro 12.9, 1366x768 and 1280x720 laptops, MacBook Air 13, Pro 14 and Pro 16, 1920 and 2560
      desktops: the whole card on screen, or the sign-in button on the first screen on phones and tablets

## Phase 18 · Ready for the public: free server keys, a Porcelain app icon, paint from every side (requested 8 Nov)

- [x] 18.1 The home-screen icon is the Porcelain orb (ivory disc, ink star and orbits) instead of the orange glaze;
      the icon files carry `?v=2` so phones fetch the new one (an installed app may need adding to the home screen again)
- [x] 18.2 A pool of free server keys: `GEMINI_API_KEY` and `GROQ_API_KEY` each take several keys, comma separated;
      the router tries Gemini 1, Groq 1, Gemini 2, Groq 2, Gemini 3, Groq 3 (`config.py`, `ai/utils.py`)
- [x] 18.3 Faster answers on the pool: a rate-limited key (429) hands over to the next one at once, where Groq used to
      back off for up to two minutes; a user's own keys skip the pool and keep their retries
- [x] 18.4 Onboarding says no key is needed to start: free answers every day, own keys (free Gemini and Groq, or paid
      Claude, OpenAI, OpenRouter) for no limit. The Key Ring keeps every option, preview and guide
- [x] 18.5 Key Ring opens at once: root cause was an empty card that waited for its own `/api/ai-key` call on every
      visit (Clerk check plus 2 to 3 Neon queries, slower when Neon wakes from idle) although the home page had
      already fetched the same answer; it now draws that answer straight away and refreshes behind it
- [x] 18.6 The splash throws six glazes from six sides on every load (the daily full show slower, later loads quicker);
      returning to the tab throws a quick six-way volley at the logo, ending on the glaze it wore
- [x] 18.7 The first-visit tour waits for the splash to land instead of covering the paint
- [x] 18.8 Clicking or coming within 5 cm of the logo (side panel, sign-in page, onboarding) or the Ask Mentor button
      throws the same six-way volley, sides alternating and turned a little each time, landing on the next glaze
      (each throw 0.56 s, 0.26 s apart, about 1.9 s in all; returning to the tab is a touch quicker)
- [x] 18.10 A click on the logo or the Mentor button pops like bubbles: one soft pop as each drop lands, each a step
      higher (made with Web Audio, no sound file); a click while the pointer's volley is flying still hears its pops
- [x] 18.11 On phones the open Mentor's orb sat off-centre in its ring: it leaned toward a mouse that phones never
      have (the pointer's resting spot is far off screen, top left); with no mouse seen it now stays centred
- [x] Validated before pushing: every web/js file parses; pool, keys, custom-provider and accounts tests pass; on a
      390 px touch phone the open Mentor's orb is centred and a tap gives six pops, no page errors; on desktop the
      splash lands, a logo click throws the volley with six pops, the tab icon follows, no page errors
- [x] 18.9 The sign-in page's "Last used" badge sat half outside the Google button and the card cut it to "Last us";
      it is now a small highlighter tag inside the button's top edge, checked on desktop and a 390 px phone
- [x] Checked: `tests/test_pool.py` (order, slot reset, own keys skip the pool), the key and custom-provider tests, and
      the splash and tab volley frame by frame in a local browser

## Settings only the owner can change (Vercel / Clerk)

- [ ] Clerk **production** instance and keys (removes "Development mode"); add the final domain. This also ends the
      blank page on `…clerk.accounts.dev` during Google sign-in: production uses your own domain (for example
      clerk.yourdomain.com) and your own Google OAuth app, so Google's screen says Vettly. It needs a domain you own
      (a vercel.app address cannot take Clerk's DNS records)
- [ ] Clerk dashboard → API keys: switch off user API keys. Vettly hides the tab, but only the dashboard stops them being made
- [ ] `KEY_ENCRYPTION_SECRET` set in Vercel (without it, nobody can save their own key)
- [ ] `DATABASE_URL` (Neon Postgres) set in Vercel
- [ ] `GEMINI_API_KEY` and `GROQ_API_KEY` in Vercel as comma-separated pools (up to three free keys each), then redeploy
- [ ] `ALLOWED_ORIGINS` = your domain(s), comma-separated (optional: the app is same-origin)
- [ ] Vercel → Settings → Functions: max duration at least 60 s (long AI answers)
- [x] Personal files (the resumes and the local stores) are gone from the whole git history (7 Nov): main was
      rewritten without them and pushed; they stay on the owner's computer and in the account on the live site
- [ ] Before making the repository **public**: GitHub still keeps the old pull-request commits (#1 to #11), which hold
      those files. Ask GitHub Support to purge them, or move the clean history to a fresh repository and point Vercel at it
