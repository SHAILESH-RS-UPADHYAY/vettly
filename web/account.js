/**
 * The account window (Clerk's UserProfile) and the avatar menu (Clerk's UserButton), made Vettly's own.
 * Tabs: Profile · Security (Clerk's) · Key Ring · Your look · Your data (ours, mounted into Clerk's pages).
 * Clerk's own "API keys" tab is hidden: those are developer keys, not your AI keys, and they confused people.
 * Menu: Manage account · Key Ring · Change the look · Sign out.
 * Clerk 5.128 options used here (checked in its own code): customPages {label,url,mountIcon,unmountIcon,mount,unmount},
 * apiKeysProps.hide, customMenuItems {label,onClick,mountIcon,unmountIcon}, userProfileProps.
 * Styling lives in account.css (tokens on Clerk's cl-* classes), so every look dresses these too.
 */
const AccountPages = (() => {
    const icon = n => `<svg aria-hidden="true" width="16" height="16" style="width:16px;height:16px"><use href="#i-${n}"/></svg>`;
    const calm = () => !!window.Motion?.calm?.() || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mountIcon = n => el => { el.innerHTML = icon(n); el.classList.add('vt-ck-icon'); };
    const unmountIcon = el => { el.innerHTML = ''; };
    // anything that opens a Vettly dialog first closes Clerk's window, so the two never fight over focus
    const closeClerk = () => { try { window.Clerk?.closeUserProfile?.(); } catch (e) { /* not open */ } };

    // a page head that matches Clerk's own, so our tabs read as part of the same window
    const head = (title, line) => `<header class="vt-ck-head"><h1>${title}</h1><p>${line}</p></header>`;

    // ── Key Ring: the real one, drawn here with its own ids ──
    function keyRing(el) {
        el.innerHTML = `<div class="vt-ck-page">${head('Key Ring', 'Bring your own AI key and Vettly has no daily limit. Gemini and Groq are free: add both, and if one is busy the next one answers.')}<div class="vt-ck-kr keyring-card"></div></div>`;
        const host = el.querySelector('.vt-ck-kr');
        // the step-by-step guide is a Vettly dialog: close this window first, then open it
        host.addEventListener('click', e => { const g = e.target.closest('[data-guide]'); if (!g) return; e.stopPropagation(); closeClerk(); setTimeout(() => window.KeyGuide?.open(g.dataset.guide), 180); }, true);
        window.KeyRing?.mount(host, 'acct-');
        el._kr = host;
    }

    // ── Your look: the nine looks, day / night, and the Look Book ──
    function look(el) {
        const looks = window.Appearance?.looks?.() || [];
        const mode = window.Appearance?.themeMode?.() || 'light';
        el.innerHTML = `<div class="vt-ck-page">${head('Your look', 'Dress Vettly your way. Every change shows right away, on every page.')}
            <section class="vt-ck-section">
                <h2>Day or night</h2>
                <div class="vt-ck-modes" role="radiogroup" aria-label="Day or night">
                    ${[['light', 'sun', 'Day'], ['dark', 'moon', 'Night'], ['device', 'half', 'Match device']].map(([v, ic, t]) => `<button type="button" role="radio" aria-checked="${mode === v}" data-ck-mode="${v}">${icon(ic)}<span>${t}</span></button>`).join('')}
                </div>
            </section>
            <section class="vt-ck-section">
                <h2>Looks</h2>
                <div class="vt-ck-looks" role="radiogroup" aria-label="Looks">
                    ${looks.map(l => `<button type="button" class="vt-ck-look" role="radio" aria-checked="${l.id === window.Appearance.look()}" data-ck-look="${l.id}">
                        <span class="look-thumb" data-thumb="${l.id}" aria-hidden="true"><span class="s"><i></i><i></i><i></i><i></i></span><span class="m"><span class="h"></span><span class="g"><span class="c"></span><span class="c"></span></span></span></span>
                        <b>${l.name}</b></button>`).join('')}
                </div>
            </section>
            <section class="vt-ck-section vt-ck-row">
                <p><b>Want the big preview?</b><span>The Look Book shows each look on a full page before you choose.</span></p>
                <button type="button" class="vt-ck-btn" data-ck-lookbook>${icon('palette')}Open the Look Book</button>
            </section></div>`;
        el.addEventListener('click', e => {
            const m = e.target.closest('[data-ck-mode]');
            if (m) { window.Appearance.setThemeMode(m.dataset.ckMode, m); el.querySelectorAll('[data-ck-mode]').forEach(b => b.setAttribute('aria-checked', String(b === m))); return; }
            const l = e.target.closest('[data-ck-look]');
            if (l) {
                window.Appearance.applyLook(l.dataset.ckLook, l);
                el.querySelectorAll('[data-ck-look]').forEach(b => b.setAttribute('aria-checked', String(b === l)));
                if (!calm()) l.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06) rotate(-1deg)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
                return;
            }
            if (e.target.closest('[data-ck-lookbook]')) { closeClerk(); setTimeout(() => window.LookBook?.open(), 180); }
        });
    }

    // ── Your data: take a copy, or delete everything ──
    function data(el) {
        el.innerHTML = `<div class="vt-ck-page">${head('Your data', 'Everything you saved in Vettly is yours: take a copy, or delete it.')}
            <section class="vt-ck-section vt-ck-row">
                <p><b>Download a copy</b><span>One file with your profile, questions, chapters and notes. Your AI keys are never included.</span></p>
                <button type="button" class="vt-ck-btn" data-ck-export>${icon('download')}Download my data</button>
            </section>
            <section class="vt-ck-section vt-ck-row vt-ck-danger">
                <p><b>Delete my data</b><span>Removes everything you saved in Vettly. Your sign-in stays until you delete it under Security. This can't be undone.</span></p>
                <button type="button" class="vt-ck-btn vt-ck-btn-danger" data-ck-delete>${icon('trash')}Delete my data</button>
            </section></div>`;
        el.addEventListener('click', e => {
            const x = e.target.closest('[data-ck-export]'); if (x) { window.Passport?.exportData(x); return; }
            const d = e.target.closest('[data-ck-delete]'); if (d) window.Passport?.deleteData(d);
        });
    }

    function pages() {
        return [
            { label: 'Key Ring', url: 'key-ring', mountIcon: mountIcon('key'), unmountIcon, mount: keyRing, unmount: el => { if (el._kr) window.KeyRing?.unmount(el._kr); el.innerHTML = ''; } },
            { label: 'Your look', url: 'your-look', mountIcon: mountIcon('palette'), unmountIcon, mount: look, unmount: el => { el.innerHTML = ''; } },
            { label: 'Your data', url: 'your-data', mountIcon: mountIcon('shield'), unmountIcon, mount: data, unmount: el => { el.innerHTML = ''; } },
        ];
    }
    // the avatar menu: Clerk's two, with Key Ring and the look in between
    function menu() {
        return [
            { label: 'manageAccount' },
            { label: 'Key Ring', mountIcon: mountIcon('key'), unmountIcon, onClick: () => { window.switchSection?.('settings', { animate: true }); setTimeout(() => document.getElementById('keyring-card')?.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }), 420); } },
            { label: 'Change the look', mountIcon: mountIcon('palette'), unmountIcon, onClick: () => window.LookBook?.open() },
            { label: 'signOut' },
        ];
    }
    return { pages, menu, keyRing, look, data };
})();

// modules talk to each other through window: a top-level const is not a window property
window.AccountPages = AccountPages;
