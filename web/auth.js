/**
 * Sign-in for the hosted app (Clerk). When the server has no Clerk key (Vettly on your own machine)
 * this does nothing and the app opens straight away.
 *
 * Every same-origin API call waits until we know who is signed in, then carries their session token,
 * so the rest of the app keeps calling fetch() exactly as it always has.
 * Sign-in methods (email, Google, phone, LinkedIn...) are whatever is switched on in the Clerk dashboard.
 */
(() => {
    const API = /^\/(?:api|context|upload|github|prepare|status)(?:\/|$)/;
    const OPEN = /^\/api\/(?:health|config)$/;
    const CLERK_JS = '@clerk/clerk-js@5';
    const rawFetch = window.fetch.bind(window);
    const root = document.documentElement;
    let clerk = null, signedIn = false, open;
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
            elements: { rootBox: { width: '100%' }, cardBox: { width: '100%', boxShadow: 'none' }, card: { boxShadow: 'none', background: 'transparent' } },
        };
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
            card.innerHTML = '<p class="auth-error">Sign-in could not load. Check your connection and reload the page.</p>';
            return;
        }
        clerk.mountSignIn(card, { withSignUp: true, appearance: appearance() });
    }

    function enter() {
        signedIn = true;
        const g = gate();
        if (!g.hidden) {
            clerk.unmountSignIn(document.getElementById('auth-card'));
            g.classList.add('leaving');
            setTimeout(() => { g.hidden = true; g.classList.remove('leaving'); }, 480);
        }
        document.querySelectorAll('[data-user-slot]').forEach(el => {
            el.hidden = false;
            clerk.mountUserButton(el.querySelector('.user-btn'), { appearance: appearance(), showName: el.dataset.userSlot === 'full' });
        });
        root.classList.remove('auth-checking');
        open();
    }

    (async () => {
        let cfg = {};
        try { cfg = await (await rawFetch('/api/config')).json(); } catch (e) { /* an older server or a plain file server: open as before */ }
        if (cfg.auth !== 'clerk') { root.classList.remove('auth-checking'); open(); return; }
        try {
            clerk = await loadClerk(cfg);
            await clerk.load();
        } catch (e) {
            showGate(true);
            return;
        }
        clerk.addListener(({ user }) => {
            if (user && !signedIn) enter();
            else if (!user && signedIn) location.reload();   // signed out: start clean
        });
        if (clerk.user) enter(); else showGate();
    })();

    window.Auth = { ready, signOut: () => clerk?.signOut(), enabled: () => !!clerk };
})();
