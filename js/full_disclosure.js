(function () {
    'use strict';

    const section = document.getElementById('full-disclosure-section');
    if (!section) return;

    const userEmail =
        sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || '';

    let lastViewerSuggestedName = '';

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function formatTime(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso.replace(' ', 'T'));
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        } catch (e) {
            return '';
        }
    }

    /** Paalala (Note) — privacy text; hiwalay sa form */
    function renderNoteBlock() {
        return (
            '<div class="policy-board-note-card">' +
            '<div class="policy-board-note-title">Pabatid</div>' +
            '<p class="policy-board-privacy-note">Ang iyong komento ay mananatiling pribado sa publiko at tanging tanggapan ng barangay lamang ang may pahintulot na makakita. Maraming salamat sa iyong komento.</p>' +
            '</div>'
        );
    }

    function renderMyFeedbackReadonly(fb) {
        if (!fb) return '';
        const name = esc(fb.name || 'Resident');
        const comment = esc(fb.comment || '');
        const t = formatTime(fb.created_at);
        return (
            '<div class="policy-board-my-feedback">' +
            '<div class="policy-board-my-feedback__title">Iyong komento</div>' +
            '<div class="policy-board-comment__author">' +
            name +
            '</div>' +
            (comment
                ? '<div class="policy-board-comment__text">' + comment + '</div>'
                : '') +
            (t ? '<div class="policy-board-comment__time">' + esc(t) + '</div>' : '') +
            '</div>'
        );
    }

    function renderFeedbackForm(itemId, suggestedName) {
        const hasProfile = !!(suggestedName && String(suggestedName).trim());
        const profileBlock = hasProfile
            ? ''
            : '<p class="policy-board-msg is-error" style="margin:0 0 10px;">Hindi makuha ang pangalan: maglagay muna ng first name at last name sa iyong resident profile.</p>';
        const submitDisabled = hasProfile ? '' : ' disabled';
        return (
            '<form class="policy-board-comment-form" data-board-id="' +
            itemId +
            '" data-profile-ok="' +
            (hasProfile ? '1' : '0') +
            '">' +
            profileBlock +
            '<div class="policy-board-rate-comment-block">' +
            '<label class="policy-board-comment-label" for="policyBoardComment_' +
            itemId +
            '">Komento <span class="required-indicator">*</span></label>' +
            '<textarea id="policyBoardComment_' +
            itemId +
            '" class="policy-board-comment-textarea" maxlength="2000" placeholder="Ilagay ang iyong komento" aria-label="Komento" required' +
            (hasProfile ? '' : ' disabled') +
            '></textarea>' +
            '<button type="submit" class="policy-board-btn policy-board-btn--full"' +
            submitDisabled +
            '>Ipadala ang komento</button>' +
            '</div>' +
            '<div class="policy-board-msg" aria-live="polite"></div>' +
            '</form>'
        );
    }

    /** Pareho sa ordinance: `new URL(src, location)` — suporta ang relative path at absolute URL */
    function resolveImageUrl(item) {
        const raw = item.image_url || item.image || '';
        if (!raw || String(raw).trim() === '') return '';
        const s = String(raw).trim();
        try {
            return new URL(s, window.location.href).href;
        } catch (e) {
            return s;
        }
    }

    let policyImageLightboxOnEscape = null;

    function closePolicyImageLightbox() {
        const lb = document.getElementById('policy-board-image-lightbox');
        if (!lb || lb.hasAttribute('hidden')) return;
        lb.setAttribute('hidden', '');
        document.body.style.overflow = '';
        if (policyImageLightboxOnEscape) {
            document.removeEventListener('keydown', policyImageLightboxOnEscape);
            policyImageLightboxOnEscape = null;
        }
    }

    function openPolicyImageLightbox(src, alt) {
        if (!src || String(src).trim() === '') return;
        let lb = document.getElementById('policy-board-image-lightbox');
        if (!lb) {
            lb = document.createElement('div');
            lb.id = 'policy-board-image-lightbox';
            lb.className = 'policy-board-image-lightbox';
            lb.setAttribute('hidden', '');
            lb.setAttribute('role', 'dialog');
            lb.setAttribute('aria-modal', 'true');
            lb.setAttribute('aria-label', 'Buong larawan');
            lb.innerHTML =
                '<img class="policy-board-image-lightbox__img" alt="" />' +
                '<button type="button" class="policy-board-image-lightbox__close" aria-label="Isara">' +
                '<i class="fas fa-times" aria-hidden="true"></i></button>';
            document.body.appendChild(lb);
            const fullImg = lb.querySelector('.policy-board-image-lightbox__img');
            const closeBtn = lb.querySelector('.policy-board-image-lightbox__close');
            lb.addEventListener('click', function (e) {
                if (e.target === lb) closePolicyImageLightbox();
            });
            closeBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                closePolicyImageLightbox();
            });
            fullImg.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }
        const img = lb.querySelector('.policy-board-image-lightbox__img');
        img.src = src;
        img.alt = alt || '';
        lb.removeAttribute('hidden');
        document.body.style.overflow = 'hidden';
        if (policyImageLightboxOnEscape) {
            document.removeEventListener('keydown', policyImageLightboxOnEscape);
        }
        policyImageLightboxOnEscape = function (e) {
            if (e.key === 'Escape') closePolicyImageLightbox();
        };
        document.addEventListener('keydown', policyImageLightboxOnEscape);
        const closeBtn = lb.querySelector('.policy-board-image-lightbox__close');
        if (closeBtn) closeBtn.focus();
    }

    function renderItem(item, suggestedName) {
        const id = item.id;
        const rawCaption = item.caption && String(item.caption).trim() ? String(item.caption).trim() : '';
        const imgAlt = rawCaption ? esc(rawCaption) : 'Disclosure ng barangay';
        const imgSrc = resolveImageUrl(item);
        let feedbackSection = '';
        if (userEmail) {
            if (item.my_feedback) {
                feedbackSection =
                    '<div class="policy-board-feedback-section">' +
                    renderMyFeedbackReadonly(item.my_feedback) +
                    renderNoteBlock() +
                    '</div>';
            } else {
                feedbackSection =
                    '<div class="policy-board-feedback-section">' +
                    renderFeedbackForm(id, suggestedName) +
                    renderNoteBlock() +
                    '</div>';
            }
        } else {
            feedbackSection =
                '<p class="policy-board-login-hint">Mag-sign in sa RICH app (main screen) para makapagpadala ng komento.</p>';
        }

        return (
            '<article class="policy-board-card policy-board-card--full-disclosure" data-id="' +
            id +
            '">' +
            '<div class="policy-board-card__media policy-board-card__media--img-loading">' +
            '<div class="policy-board-card__media-inner">' +
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
            '<button type="button" class="policy-board-btn policy-board-card__view-btn" aria-label="Buksan ang buong larawan">' +
            '<i class="fas fa-expand" aria-hidden="true"></i> View Image' +
            '</button>' +
            '</div>' +
            '<div class="policy-board-card__body">' +
            feedbackSection +
            '</div>' +
            '</article>'
        );
    }

    async function postJson(body) {
        const res = await fetch('php/policy_board.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid server response');
        }
        if (!res.ok || !data || data.success !== true) {
            throw new Error((data && data.message) || 'Request failed');
        }
        return data;
    }

    /** Tanggalin ang overlay sa media kapag na-load na ang disclosure image (CSS loader lang, hindi PNG). */
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

    function wireInteractions(root) {
        root.querySelectorAll('.policy-board-comment-form').forEach(function (form) {
            const boardId = parseInt(form.getAttribute('data-board-id'), 10);
            const ta = form.querySelector('textarea');
            const msg = form.querySelector('.policy-board-msg');
            const submitBtn = form.querySelector('button[type="submit"]');

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (form.getAttribute('data-profile-ok') !== '1') {
                    if (msg) {
                        msg.textContent =
                            'Kumpletuhin muna ang first name at last name sa resident_information.';
                        msg.className = 'policy-board-msg is-error';
                    }
                    return;
                }
                const text = ta && ta.value ? ta.value.trim() : '';
                if (!text) {
                    if (msg) {
                        msg.textContent = 'Maglagay ng komento.';
                        msg.className = 'policy-board-msg is-error';
                    }
                    return;
                }
                if (msg) {
                    msg.textContent = '';
                    msg.className = 'policy-board-msg';
                }
                if (submitBtn) submitBtn.disabled = true;
                postJson({
                    action: 'submit_feedback',
                    email: userEmail,
                    policy_board_id: boardId,
                    comment: text,
                })
                    .then(function () {
                        return loadBoard({ silent: true });
                    })
                    .then(function () {
                        if (typeof Swal !== 'undefined') {
                            return Swal.fire({
                                icon: 'success',
                                title: 'Naipadala na',
                                text: 'Naipadala na ang iyong komento.',
                                confirmButtonText: 'OK',
                            });
                        }
                    })
                    .catch(function (err) {
                        console.error(err);
                        if (msg) {
                            msg.textContent = err.message || 'Error';
                            msg.className = 'policy-board-msg is-error';
                        }
                        if (typeof Swal !== 'undefined') {
                            Swal.fire({
                                icon: 'error',
                                title: 'Hindi naipadala',
                                text: err.message || 'May error. Subukan muli.',
                                confirmButtonText: 'OK',
                            });
                        }
                    })
                    .finally(function () {
                        if (submitBtn) submitBtn.disabled = false;
                    });
            });
        });
    }

    /**
     * @param {{ silent?: boolean }} [opts]
     */
    async function loadBoard(opts) {
        opts = opts || {};
        const silent = !!opts.silent;
        if (!silent) {
            section.innerHTML =
                '<div class="policy-board-loading policy-board-loading--png" role="status" aria-live="polite">' +
                '<div class="policy-board-loading__spin-wrap policy-board-loading__spin-wrap--png">' +
                '<img src="Images/circle-removebg.png" alt="" class="policy-board-loading__png" width="72" height="72" />' +
                '</div>' +
                '<span class="policy-board-loading__label">Loading</span></div>';
        } else {
            section.classList.add('policy-board--refreshing');
        }
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
            lastViewerSuggestedName = data.viewer_suggested_name || '';
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length === 0) {
                section.classList.remove('policy-board--refreshing');
                section.innerHTML =
                    '<div class="policy-board-empty">' +
                    '<i class="fas fa-folder-open" style="color:#17a2b8;font-size:2rem;"></i>' +
                    '<h3 style="margin-top:12px;">Walang item pa</h3>' +
                    '<p>Ilagay ang mga disclosure sa database table na <code>policy_board</code> (column na <code>image</code>).</p>' +
                    '</div>';
                return;
            }
            section.innerHTML = '';
            const shell = document.createElement('div');
            shell.className = 'policy-board-shell fd-policy-shell';

            const viewport = document.createElement('div');
            viewport.className = 'policy-board-viewport fd-policy-carousel-viewport';
            viewport.setAttribute('aria-roledescription', 'carousel');

            const track = document.createElement('div');
            track.className = 'policy-board-track';
            const sug = lastViewerSuggestedName;
            track.innerHTML = items.map(function (it) {
                return renderItem(it, sug);
            }).join('');
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
            dots.className = 'policy-board-dots';
            dots.setAttribute('role', 'tablist');
            dots.setAttribute('aria-label', 'Mga slide ng disclosure');

            section.appendChild(shell);
            section.appendChild(dots);

            window.initPolicyCarousel(viewport, track, dots, prevBtn, nextBtn, items.length);
            wireInteractions(track);
            wirePolicyBoardCardImages(track);
        } catch (err) {
            console.error('loadBoard:', err);
            if (!silent) {
                const detail = err && err.message ? err.message : '';
                section.innerHTML =
                    '<div class="policy-board-error">Hindi ma-load ang board.' +
                    (detail ? ' ' + detail.replace(/</g, '&lt;') : '') +
                    '</div>';
            }
        } finally {
            section.classList.remove('policy-board--refreshing');
        }
    }

    section.addEventListener('click', function (e) {
        const btn = e.target && e.target.closest && e.target.closest('.policy-board-card__view-btn');
        if (!btn || !section.contains(btn)) return;
        const card = btn.closest('.policy-board-card');
        const img = card && card.querySelector('img.policy-board-card__img');
        if (!img) return;
        const src = img.currentSrc || img.getAttribute('src');
        if (!src || String(src).trim() === '') return;
        e.preventDefault();
        openPolicyImageLightbox(src, img.getAttribute('alt') || '');
    });

    loadBoard();
})();
