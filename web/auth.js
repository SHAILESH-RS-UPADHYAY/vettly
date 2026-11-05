/**
 * Sign-in for the hosted app (Clerk). When the server has no Clerk key (Vettly on your own machine)
 * this does nothing and the app opens straight away.
 *
 * Every same-origin API call waits until we know who is signed in, then carries their session token,
 * so the rest of the app keeps calling fetch() exactly as it always has.
 * Sign in and Create account are two separate tabs, so nobody tries a social login for an account that does not exist yet.
 * The sign-in methods themselves (email, GitHub, LinkedIn...) are whatever is switched on in the Clerk dashboard.
 */
(() => {
    const API = /^\/(?:api|context|upload|github|prepare|status)(?:\/|$)/;
    const OPEN = /^\/api\/(?:health|config)$/;
    const CLERK_JS = '@clerk/clerk-js@5';
    const rawFetch = window.fetch.bind(window);
    const root = document.documentElement;
    let clerk = null, signedIn = false, mounted = null, flipping = false, open;
    const ready = new Promise(resolve => { open = resolve; });

    window.fetch = async (input, init = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.origin !== location.origin || !API.test(url.pathname) || OPEN.test(url.pathname)) return rawFetch(input, init);
        await ready;
        const token = clerk?.session ? await clerk.session.getToken().catch(() => null) : null;
        if (!token) return rawFetch(input, init);
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('Authorization', `Bearer ${token}`);
        const res = await rawFetch(input, { ...init, headers });
        if (res.status === 429) {   // out of free AI answers: say so plainly, wherever it happened
            res.clone().json().then(d => window.Motion?.toast(d.detail || 'Daily AI limit reached', 'error')).catch(() => {});
        }
        return res;
    };

    // Clerk's widgets take the current look's colours, so they sit in the page instead of on top of it
    function appearance() {
        const cs = getComputedStyle(root), v = name => cs.getPropertyValue(name).trim();
        return {
            variables: {
                colorPrimary: v('--accent'), colorText: v('--ink'), colorTextSecondary: v('--muted'),
                colorBackground: v('--paper-2'), colorInputBackground: v('--field') || v('--paper'), colorInputText: v('--ink'),
                borderRadius: '12px', fontFamily: v('--font-body'),
            },
            // compact: the tabs already name the form, onboarding asks for the name, so the card drops its header and name row
            elements: {
                rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none', border: 0 },
                card: { boxShadow: 'none', background: 'transparent', padding: '14px 18px 10px', gap: '14px' },
                header: { display: 'none' }, formFieldRow__name: { display: 'none' }, footerAction: { display: 'none' },   // the tabs switch between the forms
                socialButtonsBlockButton: { minHeight: '40px' }, socialButtons: { gap: '8px' }, dividerRow: { margin: '2px 0' },
                form: { gap: '12px' }, formFieldInput: { minHeight: '40px', paddingBlock: '8px' }, formButtonPrimary: { minHeight: '42px' },
                footer: { background: 'transparent', marginTop: '0' },
            },
        };
    }

    // the account window and the avatar menu: the look's own colours and type; account.css does the rest on cl-* classes.
    // Where the browser has color-mix (every current one), Clerk takes live CSS variables, so a look change recolours
    // even an open window; older browsers get today's values and a remount on change.
    const liveVars = !!window.CSS?.supports?.('color', 'color-mix(in srgb, red 50%, blue)');
    function accountAppearance() {
        const cs = getComputedStyle(root), v = name => (liveVars ? `var(${name})` : cs.getPropertyValue(name).trim());
        return {
            variables: {
                colorPrimary: v('--accent'), colorText: v('--ink'), colorTextSecondary: v('--muted'), colorNeutral: v('--ink'),
                colorBackground: v('--paper-2'), colorInputBackground: v('--field') || v('--paper'), colorInputText: v('--ink'),
                colorDanger: v('--bad') || '#b42318', colorSuccess: v('--ok') || '#1d7a4b',
                fontFamily: v('--font-body'), fontFamilyButtons: v('--font-body'), borderRadius: '12px',
            },
        };
    }
    // Profile · Security · Key Ring · Your look · Your data; Clerk's developer "API keys" tab stays hidden
    const profileProps = () => ({ appearance: accountAppearance(), customPages: window.AccountPages?.pages() || [], apiKeysProps: { hide: true } });
    const buttonProps = el => ({
        appearance: accountAppearance(), showName: el.closest('[data-user-slot]').dataset.userSlot === 'full',
        customMenuItems: window.AccountPages?.menu(), userProfileProps: profileProps(),
    });
    function mountButtons() {
        document.querySelectorAll('[data-user-slot] .user-btn').forEach(el => { try { clerk.unmountUserButton(el); } catch (e) { /* first mount */ } clerk.mountUserButton(el, buttonProps(el)); });
    }

    function loadClerk(cfg) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = `https://${cfg.clerk_frontend_api}/npm/${CLERK_JS}/dist/clerk.browser.js`;
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.dataset.clerkPublishableKey = cfg.clerk_publishable_key;
            s.onload = () => (window.Clerk ? resolve(window.Clerk) : reject(new Error('Clerk did not start')));
            s.onerror = () => reject(new Error('Clerk could not be reached'));
            document.head.appendChild(s);
        });
    }

    const gate = () => document.getElementById('auth-gate');

    function showGate(error) {
        const g = gate(), card = document.getElementById('auth-card');
        g.hidden = false;
        root.classList.remove('auth-checking');
        if (error) {
            card.innerHTML = `<p class="auth-error">${error}</p>`;
            return;
        }
        let known = false;
        try { known = localStorage.getItem('vettly_has_account') === '1'; } catch (e) { /* storage blocked */ }
        setMode(known ? 'in' : 'up');   // first visit: create an account; returning visitors: sign in
    }

    // One Clerk form at a time: either sign in or create an account
    function swapForm(next) {
        const card = document.getElementById('auth-card');
        if (mounted === 'in') clerk.unmountSignIn(card);
        else if (mounted === 'up') clerk.unmountSignUp(card);
        if (next === 'up') clerk.mountSignUp(card, { appearance: appearance() });
        else clerk.mountSignIn(card, { withSignUp: false, appearance: appearance() });
        mounted = next;
        document.querySelectorAll('.auth-tabs [data-auth-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.authMode === next)));
        document.querySelectorAll('[data-auth-hint]').forEach(p => { p.hidden = p.dataset.authHint !== next; });
    }

    // Switching tabs flips the whole board in a backflip; the form changes while it is upside down.
    // Calm mode and reduced motion swap instantly.
    function setMode(next, animate) {
        const panel = document.querySelector('.auth-panel');
        const still = !animate || !panel || flipping || window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (still) { swapForm(next); return; }
        flipping = true;
        const turn = next === 'up' ? -1 : 1;   // create account flips back, sign in flips forward
        const spin = deg => `perspective(1400px) rotateX(${turn * deg}deg)`;
        const flip = panel.animate([
            { transform: `${spin(0)} translateY(0) scale(1)` },
            { transform: `${spin(180)} translateY(-28px) scale(1.06)`, offset: 0.45 },
            { transform: `${spin(360)} translateY(0) scale(1)` },
        ], { duration: 1050, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)' });
        setTimeout(() => swapForm(next), 430);
        flip.finished.catch(() => {}).finally(() => { flipping = false; });
    }
    // Clerk paints with the colours it was mounted with, so a theme or look change remounts the open form and the user buttons
    let wasDark = root.classList.contains('theme-dark'), wasLook = '', refit = 0;
    const lookKey = () => ['data-look', 'data-accent', 'data-accent-dark'].map(a => root.getAttribute(a)).join('|');
    wasLook = lookKey();
    new MutationObserver(() => {
        const dark = root.classList.contains('theme-dark'), lk = lookKey();
        if ((dark === wasDark && lk === wasLook) || !clerk) { wasDark = dark; wasLook = lk; return; }
        const darkChanged = dark !== wasDark;
        wasDark = dark; wasLook = lk;
        clearTimeout(refit);
        refit = setTimeout(() => {   // after the look's own transition has painted, so the colours read are the new ones
            if (mounted && !signedIn && darkChanged) swapForm(mounted);
            if (signedIn && !liveVars) mountButtons();   // live variables recolour Clerk by themselves
        }, 160);
    }).observe(root, { attributes: true, attributeFilter: ['class', 'data-look', 'data-accent', 'data-accent-dark'] });

    gate().addEventListener('click', e => {
        const b = e.target.closest('[data-auth-mode]');
        if (b && clerk && !signedIn && b.dataset.authMode !== mounted) setMode(b.dataset.authMode, true);
    });

    function enter() {
        signedIn = true;
        try { localStorage.setItem('vettly_has_account', '1'); } catch (e) { /* storage blocked */ }
        const g = gate();
        if (!g.hidden) {
            const card = document.getElementById('auth-card');
            if (mounted === 'in') clerk.unmountSignIn(card); else if (mounted === 'up') clerk.unmountSignUp(card);
            mounted = null;
            g.classList.add('leaving');
            setTimeout(() => { g.hidden = true; g.classList.remove('leaving'); }, 480);
        }
        document.querySelectorAll('[data-user-slot]').forEach(el => { el.hidden = false; });
        mountButtons();
        root.classList.remove('auth-checking');
        open();
    }

    (async () => {
        let cfg = {};
        try { cfg = await (await rawFetch('/api/config')).json(); } catch (e) { /* an older server or a plain file server: open as before */ }
        if (cfg.auth === 'unconfigured') { showGate('Vettly is opening soon. Sign-in is still being set up, so please check back shortly.'); return; }
        if (cfg.auth !== 'clerk') { root.classList.remove('auth-checking'); open(); return; }
        root.classList.add('hosted');   // the hosted site: hide anything that only makes sense on your own machine
        try {
            clerk = await loadClerk(cfg);
            await clerk.load();
        } catch (e) {
            showGate('Sign-in could not load. Check your connection and reload the page.');
            return;
        }
        clerk.addListener(({ user }) => {
            if (user && !signedIn) enter();
            else if (!user && signedIn) location.reload();   // signed out: start clean
        });
        if (clerk.user) enter(); else showGate();
    })();

    // Passport reads the account from here: who you are, how you sign in, and Clerk's own security window
    function account() {
        const u = clerk?.user;
        if (!u) return null;
        const methods = new Set((u.externalAccounts || []).map(a => String(a.provider || '').replace(/^oauth_/, '')));
        if (u.passwordEnabled) methods.add('password');
        if (u.primaryEmailAddress && !methods.size) methods.add('email');
        return {
            name: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ') || '',
            email: u.primaryEmailAddress?.emailAddress || '',
            image: u.hasImage ? u.imageUrl : '',
            since: u.createdAt ? new Date(u.createdAt) : null,
            methods: [...methods],
        };
    }
    window.Auth = {
        ready, enabled: () => !!clerk, account,
        signOut: () => clerk?.signOut(),
        openProfile: () => clerk?.openUserProfile(profileProps()),
    };
})();
