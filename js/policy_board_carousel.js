/**
 * Shared horizontal carousel for policy board slides (main UI preview + full_disclosure page).
 * Expects: .policy-board-card inside track, viewport width = one slide.
 */
(function (global) {
    'use strict';

    function initPolicyCarousel(viewport, track, dots, prevBtn, nextBtn, slideCount) {
        const slides = track.querySelectorAll('.policy-board-card');
        let index = 0;

        if (slideCount > 1) {
            for (let i = 0; i < slideCount; i++) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'policy-board-dot' + (i === 0 ? ' is-active' : '');
                b.setAttribute('role', 'tab');
                b.setAttribute('aria-label', 'Disclosure ' + (i + 1));
                (function (idx) {
                    b.addEventListener('click', function () {
                        goTo(idx);
                    });
                })(i);
                dots.appendChild(b);
            }
        }

        function applyTransform() {
            const w = viewport.getBoundingClientRect().width;
            if (w < 1) return;
            track.style.transform = 'translate3d(' + -index * w + 'px,0,0)';
            prevBtn.disabled = index <= 0;
            nextBtn.disabled = index >= slideCount - 1;
            const multi = slideCount > 1;
            prevBtn.hidden = !multi;
            nextBtn.hidden = !multi;
            dots.hidden = !multi;
            dots.style.display = multi ? 'flex' : 'none';
            Array.prototype.forEach.call(dots.querySelectorAll('.policy-board-dot'), function (d, i) {
                d.classList.toggle('is-active', i === index);
                d.setAttribute('aria-selected', i === index ? 'true' : 'false');
            });
        }

        function layout() {
            const w = viewport.getBoundingClientRect().width;
            if (w < 1) return;
            Array.prototype.forEach.call(slides, function (slide) {
                slide.style.width = w + 'px';
                slide.style.flexShrink = '0';
            });
            track.style.width = w * slideCount + 'px';
            applyTransform();
        }

        function goTo(i) {
            if (i < 0 || i >= slideCount) return;
            index = i;
            applyTransform();
        }

        prevBtn.addEventListener('click', function () {
            goTo(index - 1);
        });
        nextBtn.addEventListener('click', function () {
            goTo(index + 1);
        });

        let touchStartX = 0;
        viewport.addEventListener(
            'touchstart',
            function (e) {
                if (slideCount < 2) return;
                touchStartX = e.touches[0] ? e.touches[0].clientX : 0;
            },
            { passive: true }
        );
        viewport.addEventListener(
            'touchend',
            function (e) {
                if (slideCount < 2) return;
                const dx = e.changedTouches[0].clientX - touchStartX;
                if (dx > 45) goTo(index - 1);
                else if (dx < -45) goTo(index + 1);
            },
            { passive: true }
        );

        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(function () {
                layout();
            });
            ro.observe(viewport);
        } else {
            window.addEventListener('resize', layout);
        }
        layout();
    }

    global.initPolicyCarousel = initPolicyCarousel;
})(typeof window !== 'undefined' ? window : this);
