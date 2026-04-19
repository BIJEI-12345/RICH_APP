/**
 * Main dashboard: Full Disclosure preview — isa-isang slide, carousel (shared initPolicyCarousel).
 */
(function () {
    'use strict';

    const root = document.getElementById('main-ui-policy-board-root');
    if (!root) return;

    const userEmail =
        sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || '';

    function resolveUrl(src) {
        try {
            return new URL(src, window.location.href).href;
        } catch (e) {
            return src;
        }
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function wirePolicyBoardCardImages(container) {
        if (!container) return;
        container.querySelectorAll('.policy-board-card__media').forEach(function (media) {
            const img = media.querySelector('img.policy-board-card__img');
            if (!img) return;
            const finish = function () {
                media.classList.remove('policy-board-card__media--img-loading');
            };
            if (img.complete && img.naturalWidth > 0) {
                finish();
            } else {
                img.addEventListener('load', finish, { once: true });
                img.addEventListener('error', finish, { once: true });
            }
        });
    }

    function renderPreviewSlide(item) {
        const id = item.id;
        const rawCaption = item.caption && String(item.caption).trim() ? String(item.caption).trim() : '';
        const imgAlt = rawCaption ? esc(rawCaption) : 'Disclosure ng barangay';
        const imgSrc = resolveUrl(item.image_url || '');
        return (
            '<article class="policy-board-card main-ui-policy-board-slide" data-id="' +
            id +
            '">' +
            '<div class="policy-board-card__media policy-board-card__media--img-loading">' +
            '<div class="policy-board-img-load-overlay" aria-hidden="true">' +
            '<div class="policy-board-img-load-overlay__inner">' +
            '<div class="policy-board-loading__spinner policy-board-loading__spinner--inline" aria-hidden="true"></div>' +
            '<span class="policy-board-img-load-overlay__label">Loading</span>' +
            '</div></div>' +
            '<img class="policy-board-card__img" src="' +
            esc(imgSrc) +
            '" alt="' +
            imgAlt +
            '" loading="lazy" />' +
            '</div>' +
            '</article>'
        );
    }

    async function loadPreview() {
        if (typeof window.initPolicyCarousel !== 'function') {
            console.error('main_ui_policy_board: initPolicyCarousel missing (load policy_board_carousel.js first)');
            root.innerHTML =
                '<p class="announcements-no-carousel-placeholder">Hindi ma-load ang carousel.</p>';
            return;
        }

        root.innerHTML =
            '<div class="policy-board-loading" role="status" aria-live="polite">' +
            '<div class="policy-board-loading__spin-wrap">' +
            '<div class="policy-board-loading__spinner" aria-hidden="true"></div>' +
            '</div>' +
            '<span class="policy-board-loading__label">Loading</span></div>';

        try {
            const url = new URL('php/policy_board.php', window.location.href);
            if (userEmail) url.searchParams.set('email', userEmail);
            const res = await fetch(url.toString(), { cache: 'no-store' });
            const raw = await res.text();
            let data;
            try {
                data = JSON.parse(raw);
            } catch (e) {
                throw new Error('Invalid server response');
            }
            if (!data || data.success !== true) {
                throw new Error((data && data.message) || 'Hindi ma-load ang data.');
            }
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length === 0) {
                root.innerHTML =
                    '<p class="announcements-no-carousel-placeholder">Walang disclosure pa. Ilagay ang mga larawan sa policy board o buksan ang See All.</p>';
                return;
            }

            root.innerHTML = '';
            const shell = document.createElement('div');
            shell.className = 'policy-board-shell main-ui-policy-board-shell';

            const viewport = document.createElement('div');
            viewport.className = 'policy-board-viewport';
            viewport.setAttribute('aria-roledescription', 'carousel');

            const track = document.createElement('div');
            track.className = 'policy-board-track';
            track.innerHTML = items.map(renderPreviewSlide).join('');
            viewport.appendChild(track);

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.className = 'policy-board-arrow policy-board-arrow--prev';
            prevBtn.setAttribute('aria-label', 'Nakaraang disclosure');
            prevBtn.innerHTML = '<i class="fas fa-chevron-left" aria-hidden="true"></i>';

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.className = 'policy-board-arrow policy-board-arrow--next';
            nextBtn.setAttribute('aria-label', 'Susunod na disclosure');
            nextBtn.innerHTML = '<i class="fas fa-chevron-right" aria-hidden="true"></i>';

            shell.appendChild(prevBtn);
            shell.appendChild(viewport);
            shell.appendChild(nextBtn);

            const dots = document.createElement('div');
            dots.className = 'policy-board-dots main-ui-policy-board-dots';
            dots.setAttribute('role', 'tablist');
            dots.setAttribute('aria-label', 'Mga slide ng disclosure');

            root.appendChild(shell);
            root.appendChild(dots);

            window.initPolicyCarousel(viewport, track, dots, prevBtn, nextBtn, items.length);
            wirePolicyBoardCardImages(track);
        } catch (err) {
            console.error('main_ui_policy_board:', err);
            root.innerHTML =
                '<p class="announcements-no-carousel-placeholder">Hindi ma-load ang disclosures. Subukan muli mamaya.</p>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPreview);
    } else {
        loadPreview();
    }
})();
