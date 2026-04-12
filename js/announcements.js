// News & Article Page JavaScript

// Global variables for swipe navigation
let allAnnouncements = [];
let currentDetailIndex = -1;

// Helper function to format days_ago fallback
function formatDaysAgo(daysAgoStr) {
    if (daysAgoStr.includes('day')) {
        const days = daysAgoStr.match(/\d+/);
        if (days) {
            const dayCount = parseInt(days[0]);
            if (dayCount === 1) {
                return '1 day ago';
            } else {
                return `${dayCount} days ago`;
            }
        }
    } else if (daysAgoStr.includes('hour')) {
        const hours = daysAgoStr.match(/\d+/);
        if (hours) {
            return hours[0] + 'hr ago';
        }
    } else if (daysAgoStr.includes('minute')) {
        const minutes = daysAgoStr.match(/\d+/);
        if (minutes) {
            return minutes[0] + 'mins ago';
        }
    }
    return daysAgoStr;
}

/** Resolve relative API/image paths against the current page URL (fixes broken <img> when path is ambiguous). */
function resolvePageAssetUrl(relativeOrAbsolute) {
    if (!relativeOrAbsolute) return '';
    if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
    try {
        return new URL(relativeOrAbsolute, window.location.href).href;
    } catch (e) {
        return relativeOrAbsolute;
    }
}

/** Append a cache-busting query param so <img> refetches when the base URL matches a previous announcement. */
function cacheBustUrl(url, uniq) {
    if (!url) return url;
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    const suffix = uniq != null ? uniq : Date.now();
    return url + sep + '_r=' + suffix;
}

/** True if URL is the static fallback banner (list img may use this after onerror). */
function isDefaultBrgyHallBannerUrl(url) {
    if (!url) return true;
    try {
        const u = new URL(url, window.location.href);
        return /brgyHall\.jpe?g$/i.test(u.pathname);
    } catch (e) {
        return /brgyHall\.jpe?g/i.test(String(url));
    }
}

/** Prefer the image URL already loaded on the list card so detail banner matches the slide thumbnail. */
function mergeAnnouncementImageFromSlideCard(announcement, cardEl) {
    const thumb = cardEl && cardEl.querySelector('.announcement-image');
    if (!thumb) return announcement;
    const fromSlide = (thumb.currentSrc || thumb.src || thumb.getAttribute('src') || '').trim();
    if (!fromSlide) return announcement;
    // Do not replace API image URL with the placeholder after a failed thumbnail load
    if (isDefaultBrgyHallBannerUrl(fromSlide)) {
        return announcement;
    }
    return Object.assign({}, announcement, { image: fromSlide });
}

/** Incremented on each detail banner load so async fetch/blob can ignore stale results after a fast swipe. */
let detailBannerLoadSeq = 0;

function beginDetailBannerImageLoad(bannerImg, wrap, loadingEl) {
    detailBannerLoadSeq++;
    const seq = detailBannerLoadSeq;
    bannerImg._detailLoadSeq = seq;
    if (bannerImg._detailFetchAbort) {
        try {
            bannerImg._detailFetchAbort.abort();
        } catch (e) { /* ignore */ }
        bannerImg._detailFetchAbort = null;
    }
    if (bannerImg._detailBlobUrl) {
        try {
            URL.revokeObjectURL(bannerImg._detailBlobUrl);
        } catch (e) { /* ignore */ }
        bannerImg._detailBlobUrl = null;
    }
    bannerImg.removeAttribute('src');
    if (wrap) {
        wrap.classList.add('is-banner-loading');
    }
    if (loadingEl) {
        loadingEl.hidden = false;
        loadingEl.setAttribute('aria-busy', 'true');
    }
    return seq;
}

function finishDetailBannerImageLoad(bannerImg, wrap, loadingEl, seq) {
    if (bannerImg._detailLoadSeq !== seq) {
        return;
    }
    if (wrap) {
        wrap.classList.remove('is-banner-loading');
    }
    if (loadingEl) {
        loadingEl.hidden = true;
        loadingEl.setAttribute('aria-busy', 'false');
    }
}

function revealDetailBannerWhenReady(bannerImg, wrap, loadingEl, seq) {
    const finish = function () {
        finishDetailBannerImageLoad(bannerImg, wrap, loadingEl, seq);
    };
    const tryDecode = function () {
        if (bannerImg._detailLoadSeq !== seq) {
            return;
        }
        if (typeof bannerImg.decode === 'function') {
            bannerImg.decode().then(finish).catch(finish);
        } else {
            finish();
        }
    };
    const proceed = function () {
        if (bannerImg._detailLoadSeq !== seq) {
            return;
        }
        if (bannerImg.naturalWidth === 0) {
            finish();
            return;
        }
        tryDecode();
    };
    if (bannerImg.complete) {
        proceed();
        return;
    }
    bannerImg.addEventListener(
        'load',
        function () {
            proceed();
        },
        { once: true }
    );
    bannerImg.addEventListener(
        'error',
        function () {
            if (bannerImg._detailLoadSeq !== seq) {
                return;
            }
            finish();
        },
        { once: true }
    );
}

// Function to go back to main page
function goBack() {
    window.location.href = 'main_UI.html';
}

// Function to fetch announcements from the database
async function fetchAnnouncements() {
    try {
        const response = await fetch('php/announcements.php', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.success) {
            return data.announcements;
        } else {
            console.error('Failed to fetch announcements:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
}

// Function to create announcement card HTML
function createAnnouncementCard(announcement, listIndex) {
    const defaultImage = resolvePageAssetUrl('Images/brgyHall.jpg');
    const baseSrc = announcement.image ? resolvePageAssetUrl(announcement.image) : defaultImage;
    const imageSrc = cacheBustUrl(baseSrc, Date.now() + '_' + listIndex);
    const defaultForError = cacheBustUrl(defaultImage, 'fallback_' + listIndex);
    const imageAlt = announcement.title || 'Announcement';
    
    // Determine category class based on announcement data
    let categoryClass = 'category-announcement';
    let categoryText = 'Announcement';
    
    if (announcement.category) {
        const category = announcement.category.toLowerCase();
        if (category.includes('health') || category.includes('medical')) {
            categoryClass = 'category-health';
            categoryText = 'Health';
        } else if (category.includes('community') || category.includes('pantry')) {
            categoryClass = 'category-community';
            categoryText = 'Community';
        } else if (category.includes('emergency') || category.includes('hotline')) {
            categoryClass = 'category-emergency';
            categoryText = 'Emergency';
        }
    }
    
    // Format timestamp based on date_and_time (When field)
    // Calculate if event is upcoming or past
    let timestamp = '';
    
    if (announcement.date_and_time && announcement.date_and_time !== '0000-00-00 00:00:00' && announcement.date_and_time !== '0000-00-00') {
        try {
            // Parse the date_and_time (format: YYYY-MM-DD HH:MM:SS in PH time)
            const dateTimeString = announcement.date_and_time.replace(' ', 'T');
            const eventDate = new Date(dateTimeString);
            const now = new Date();
            
            // Validate that the date was parsed correctly
            if (!isNaN(eventDate.getTime())) {
                // Set both dates to start of day for accurate day calculation
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                
                // Calculate difference in days
                const diffTime = eventDateOnly - nowDateOnly;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) {
                    // Event has passed - show "X days ago" (full format)
                    const daysAgo = Math.abs(diffDays);
                    if (daysAgo === 1) {
                        timestamp = '1 day ago';
                    } else {
                        timestamp = `${daysAgo} days ago`;
                    }
                } else if (diffDays === 0) {
                    // Event is today
                    timestamp = 'Today';
                } else if (diffDays === 1) {
                    // Event is tomorrow
                    timestamp = '1d to go';
                } else {
                    // Event is in X days - show "Xd to go" (short format)
                    timestamp = `${diffDays}d to go`;
                }
            } else {
                // Fallback to days_ago if date parsing fails
                timestamp = formatDaysAgo(announcement.days_ago || '1hr');
            }
        } catch (error) {
            console.error('Error calculating timestamp:', error);
            // Fallback to days_ago if date parsing fails
            timestamp = formatDaysAgo(announcement.days_ago || '1hr');
        }
    } else {
        // No date_and_time, use days_ago as fallback
        timestamp = formatDaysAgo(announcement.days_ago || '1hr');
    }
    
    return `
        <div class="full-announcement-card">
            <div class="announcement-image-container">
                <img src="${imageSrc}" alt="${imageAlt}" class="announcement-image"
                     onerror="this.onerror=null; this.src='${defaultForError.replace(/'/g, "\\'")}';">
            </div>
            <div class="announcement-content">
                <h3 class="announcement-title">${announcement.title}</h3>
                <p class="announcement-timestamp">${timestamp}</p>
                <span class="announcement-category ${categoryClass}">${categoryText}</span>
            </div>
        </div>
    `;
}

// Function to display announcements
function displayAnnouncements(announcements) {
    // Store announcements globally for swipe navigation
    allAnnouncements = announcements;
    
    const container = document.getElementById('announcements-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noAnnouncements = document.getElementById('no-announcements');
    
    // Hide loading indicator
    loadingIndicator.style.display = 'none';
    
    container.querySelectorAll('.full-announcement-card').forEach((el) => el.remove());

    if (announcements.length === 0) {
        // Show no announcements message
        noAnnouncements.style.display = 'block';
    } else {
        // Hide no announcements message
        noAnnouncements.style.display = 'none';
        
        // Create and insert announcement cards
        const cardsHTML = announcements.map((announcement, i) => createAnnouncementCard(announcement, i)).join('');
        container.insertAdjacentHTML('beforeend', cardsHTML);
        
        // Add click event listeners to announcement cards
        const cards = container.querySelectorAll('.full-announcement-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            
            // Add click event listener to show detail view
            card.addEventListener('click', function(e) {
                const announcementIndex = Array.from(cards).indexOf(card);
                currentDetailIndex = announcementIndex;
                const ann = mergeAnnouncementImageFromSlideCard(announcements[announcementIndex], card);
                allAnnouncements[announcementIndex] = ann;
                showAnnouncementDetail(ann);
            });
        });
    }
}

function isAnnouncementDetailOpen() {
    const el = document.getElementById('announcement-detail-section');
    return el && window.getComputedStyle(el).display !== 'none';
}

/** Re-fetch from server so admin edits (titles, images) show for residents without a full page reload. */
async function refreshAnnouncementsFromServer() {
    try {
        const fresh = await fetchAnnouncements();
        const inDetail = isAnnouncementDetailOpen();
        const prevIndex = currentDetailIndex;

        displayAnnouncements(fresh);

        if (inDetail) {
            document.getElementById('announcements-list-section').style.display = 'none';
            document.getElementById('announcement-detail-section').style.display = 'block';
            document.body.classList.add('detail-view');
            if (fresh.length === 0) {
                goBackToList();
                return;
            }
            const idx = Math.min(Math.max(0, prevIndex), fresh.length - 1);
            currentDetailIndex = idx;
            setupDetailSwipe();
            populateAnnouncementDetail(fresh[idx]);
        }
    } catch (e) {
        console.error('Error refreshing announcements:', e);
    }
}

// Function to populate detail view with announcement data
function populateAnnouncementDetail(announcement) {
    // Set category and styling
    const categoryElement = document.getElementById('detail-category');
    let categoryClass = 'category-announcement';
    let categoryText = 'Announcement';
    
    if (announcement.category) {
        const category = announcement.category.toLowerCase();
        if (category.includes('health') || category.includes('medical')) {
            categoryClass = 'category-health';
            categoryText = 'Health';
        } else if (category.includes('community') || category.includes('pantry')) {
            categoryClass = 'category-community';
            categoryText = 'Community';
        } else if (category.includes('emergency') || category.includes('hotline')) {
            categoryClass = 'category-emergency';
            categoryText = 'Emergency';
        }
    }
    
    categoryElement.className = `detail-category ${categoryClass}`;
    categoryElement.textContent = categoryText;
    
    // Calculate days remaining based on "When" date (date_and_time)
    const bannerElement = document.getElementById('detail-banner');
    const timestampElement = document.getElementById('detail-timestamp');
    
    let daysRemaining = null;
    let timestampText = '';
    let bannerClass = '';
    
    if (announcement.date_and_time && announcement.date_and_time !== '0000-00-00 00:00:00' && announcement.date_and_time !== '0000-00-00') {
        try {
            // Parse the date_and_time (format: YYYY-MM-DD HH:MM:SS in PH time)
            // Replace space with 'T' for ISO format compatibility
            const dateTimeString = announcement.date_and_time.replace(' ', 'T');
            const eventDate = new Date(dateTimeString);
            const now = new Date();
            
            // Validate that the date was parsed correctly
            if (isNaN(eventDate.getTime())) {
                throw new Error('Invalid date format');
            }
            
            // Set both dates to start of day for accurate day calculation (in local timezone)
            const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            // Calculate difference in days
            const diffTime = eventDateOnly - nowDateOnly;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            daysRemaining = diffDays;
            
            if (diffDays < 0) {
                // Event has passed
                timestampText = 'Event Passed';
                bannerClass = 'banner-passed';
            } else if (diffDays === 0) {
                // Event is today
                timestampText = 'Today';
                bannerClass = 'banner-today';
            } else if (diffDays === 1) {
                // Event is tomorrow
                timestampText = '1 day';
                bannerClass = 'banner-upcoming';
            } else {
                // Event is in X days
                timestampText = `${diffDays} days`;
                bannerClass = 'banner-upcoming';
            }
            
            // Show banner
            bannerElement.style.display = 'block';
            bannerElement.className = `detail-banner ${bannerClass}`;
            timestampElement.textContent = timestampText;
        } catch (error) {
            console.error('Error calculating days remaining:', error);
            // Hide banner if date parsing fails
            bannerElement.style.display = 'none';
        }
    } else {
        // No date specified, hide banner
        bannerElement.style.display = 'none';
    }
    
    document.getElementById('detail-title').textContent = announcement.title || 'No Title';

    const bannerImg = document.getElementById('detail-banner-image');
    const bannerWrap = document.getElementById('detail-image-banner-wrap');
    const loadingEl = document.getElementById('detail-banner-loading');
    if (bannerImg) {
        const defaultImage = resolvePageAssetUrl('Images/brgyHall.jpg');
        const baseSrc = announcement.image ? resolvePageAssetUrl(announcement.image) : defaultImage;
        const imageSrc = cacheBustUrl(baseSrc, Date.now() + '_' + (announcement.id != null ? announcement.id : 'detail'));
        bannerImg.alt = announcement.title || 'Announcement';

        const seq = beginDetailBannerImageLoad(bannerImg, bannerWrap, loadingEl);

        bannerImg.onerror = function () {
            this.onerror = null;
            if (this._detailBlobUrl) {
                try {
                    URL.revokeObjectURL(this._detailBlobUrl);
                } catch (e) { /* ignore */ }
                this._detailBlobUrl = null;
            }
            this.src = cacheBustUrl(defaultImage, Date.now() + '_detail_fb');
            revealDetailBannerWhenReady(this, bannerWrap, loadingEl, this._detailLoadSeq);
        };

        const isApiImage =
            imageSrc.indexOf('image_id=') !== -1 &&
            (imageSrc.indexOf('announcements.php') !== -1 || imageSrc.indexOf('check_active_requests.php') !== -1);

        if (isApiImage && typeof fetch === 'function') {
            const ac = new AbortController();
            bannerImg._detailFetchAbort = ac;
            fetch(imageSrc, { cache: 'no-store', credentials: 'same-origin', signal: ac.signal })
                .then(function (res) {
                    if (bannerImg._detailLoadSeq !== seq) {
                        return;
                    }
                    if (!res.ok) {
                        throw new Error('announcement image HTTP ' + res.status);
                    }
                    const ct = (res.headers.get('content-type') || '').toLowerCase();
                    if (!ct.startsWith('image/')) {
                        throw new Error('not an image');
                    }
                    return res.blob();
                })
                .then(function (blob) {
                    if (bannerImg._detailLoadSeq !== seq) {
                        return;
                    }
                    if (bannerImg._detailBlobUrl) {
                        try {
                            URL.revokeObjectURL(bannerImg._detailBlobUrl);
                        } catch (e) { /* ignore */ }
                    }
                    bannerImg._detailBlobUrl = URL.createObjectURL(blob);
                    bannerImg.removeAttribute('src');
                    bannerImg.src = bannerImg._detailBlobUrl;
                    revealDetailBannerWhenReady(bannerImg, bannerWrap, loadingEl, seq);
                })
                .catch(function (err) {
                    if (err && err.name === 'AbortError') {
                        return;
                    }
                    if (bannerImg._detailLoadSeq !== seq) {
                        return;
                    }
                    bannerImg.removeAttribute('src');
                    bannerImg.src = imageSrc;
                    revealDetailBannerWhenReady(bannerImg, bannerWrap, loadingEl, seq);
                });
        } else {
            if (bannerImg._detailBlobUrl) {
                try {
                    URL.revokeObjectURL(bannerImg._detailBlobUrl);
                } catch (e) { /* ignore */ }
                bannerImg._detailBlobUrl = null;
            }
            bannerImg.removeAttribute('src');
            bannerImg.src = imageSrc;
            revealDetailBannerWhenReady(bannerImg, bannerWrap, loadingEl, seq);
        }
    }
    
    // Set description (statement) - comes first in the container
    document.getElementById('detail-description').textContent = announcement.description || announcement.content || 'No description available.';
    
    // "When:" - use date_and_time (full date and time)
    const whenDate = announcement.formatted_when || announcement.date_and_time || 'Not specified';
    document.getElementById('detail-duration').textContent = whenDate;
    
    // Update indicators
    updateDetailIndicators();
}

// Function to create detail indicators
function createDetailIndicators() {
    const indicatorsContainer = document.getElementById('detail-indicators');
    if (!indicatorsContainer) return;
    
    indicatorsContainer.innerHTML = '';
    
    // Only show indicators if there's more than one announcement
    if (allAnnouncements.length <= 1) {
        indicatorsContainer.style.display = 'none';
        return;
    }
    
    indicatorsContainer.style.display = 'flex';
    
    allAnnouncements.forEach((_, index) => {
        const indicator = document.createElement('div');
        indicator.className = 'detail-indicator';
        if (index === currentDetailIndex) {
            indicator.classList.add('active');
        }
        
        // Add click event to navigate to next announcement
        indicator.addEventListener('click', () => {
            // Navigate to next announcement when indicator is clicked
            if (currentDetailIndex < allAnnouncements.length - 1) {
                showNextAnnouncement();
            } else {
                // If at last announcement, go to first one
                const detailContainer = document.querySelector('.announcement-detail-container');
                if (detailContainer) {
                    detailContainer.classList.add('slide-out-left');
                    setTimeout(() => {
                        currentDetailIndex = 0;
                        const announcement = allAnnouncements[0];
                        populateAnnouncementDetail(announcement);
                        detailContainer.classList.remove('slide-out-left');
                        detailContainer.classList.add('slide-in-right');
                        setTimeout(() => {
                            detailContainer.classList.remove('slide-in-right');
                        }, 500);
                    }, 250);
                }
            }
        });
        
        indicatorsContainer.appendChild(indicator);
    });
}

// Function to update detail indicators
function updateDetailIndicators() {
    const indicators = document.querySelectorAll('.detail-indicator');
    if (indicators.length === 0) {
        // Recreate indicators if they don't exist
        createDetailIndicators();
        return;
    }
    
    indicators.forEach((indicator, index) => {
        if (index === currentDetailIndex) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });
}

// Function to show announcement detail view
function showAnnouncementDetail(announcement, index) {
    // Set current index if provided
    if (index !== undefined) {
        currentDetailIndex = index;
    }
    
    // Hide announcements list
    document.getElementById('announcements-list-section').style.display = 'none';
    
    // Show detail view
    const detailSection = document.getElementById('announcement-detail-section');
    detailSection.style.display = 'block';
    
    // Add class to body to hide header
    document.body.classList.add('detail-view');
    
    // Create indicators first
    createDetailIndicators();
    // Clone/replace container BEFORE populate so banner <img> src is not wiped by setupDetailSwipe
    setupDetailSwipe();
    populateAnnouncementDetail(announcement);
    
    // Scroll to top of detail view
    detailSection.scrollIntoView({ behavior: 'smooth' });
    
    // Add scroll behavior for sticky back button
    addStickyScrollBehavior();
}

// Function to navigate to previous announcement
function showPreviousAnnouncement() {
    if (currentDetailIndex > 0 && allAnnouncements.length > 0) {
        const detailContainer = document.querySelector('.announcement-detail-container');
        if (detailContainer) {
            // Slide out to right
            detailContainer.classList.add('slide-out-right');
            
            setTimeout(() => {
                currentDetailIndex--;
                const announcement = allAnnouncements[currentDetailIndex];
                populateAnnouncementDetail(announcement);
                
                // Remove old animation classes
                detailContainer.classList.remove('slide-out-right');
                // Slide in from left (reversed: previous comes from left when swiping right)
                detailContainer.classList.add('slide-in-left');
                
                // Scroll to top
                document.getElementById('announcement-detail-section').scrollIntoView({ behavior: 'smooth' });
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    detailContainer.classList.remove('slide-in-left');
                }, 500);
            }, 250);
        }
    }
}

// Function to navigate to next announcement
function showNextAnnouncement() {
    if (currentDetailIndex < allAnnouncements.length - 1 && allAnnouncements.length > 0) {
        const detailContainer = document.querySelector('.announcement-detail-container');
        if (detailContainer) {
            // Slide out to left
            detailContainer.classList.add('slide-out-left');
            
            setTimeout(() => {
                currentDetailIndex++;
                const announcement = allAnnouncements[currentDetailIndex];
                populateAnnouncementDetail(announcement);
                
                // Remove old animation classes
                detailContainer.classList.remove('slide-out-left');
                // Slide in from right (reversed: next comes from right when swiping left)
                detailContainer.classList.add('slide-in-right');
                
                // Scroll to top
                document.getElementById('announcement-detail-section').scrollIntoView({ behavior: 'smooth' });
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    detailContainer.classList.remove('slide-in-right');
                }, 500);
            }, 250);
        }
    }
}

// Function to setup swipe gestures for detail view
function setupDetailSwipe() {
    const detailContainer = document.querySelector('.announcement-detail-container');
    if (!detailContainer) return;
    
    // Remove existing listeners to avoid duplicates
    const newDetailContainer = detailContainer.cloneNode(true);
    detailContainer.parentNode.replaceChild(newDetailContainer, detailContainer);
    
    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let swipeDistance = 0;
    
    // Touch events
    newDetailContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = false;
        swipeDistance = 0;
    });
    
    newDetailContainer.addEventListener('touchmove', (e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = Math.abs(currentX - startX);
        const deltaY = Math.abs(currentY - startY);
        
        if (!isSwiping) {
            isSwiping = deltaX > deltaY && deltaX > 10;
        }
        
        if (isSwiping) {
            swipeDistance = startX - currentX;
            // Prevent page scroll during horizontal swipe
            if (deltaX > deltaY) {
                e.preventDefault();
            }
        }
    });
    
    newDetailContainer.addEventListener('touchend', (e) => {
        if (!isSwiping) {
            swipeDistance = 0;
            return;
        }
        
        const endX = e.changedTouches[0].clientX;
        const deltaX = startX - endX;
        const threshold = 50;
        
        if (Math.abs(deltaX) > threshold) {
            // Swipe RIGHT (deltaX < 0): Show PREVIOUS announcement coming from LEFT (reversed)
            // Swipe LEFT (deltaX > 0): Show NEXT announcement coming from RIGHT (reversed)
            if (deltaX < 0) {
                // Swipe right - go to previous (reversed)
                if (currentDetailIndex > 0) {
                    showPreviousAnnouncement();
                } else {
                    // If at first announcement, go to last one
                    const detailContainer = document.querySelector('.announcement-detail-container');
                    if (detailContainer) {
                        detailContainer.classList.add('slide-out-right');
                        setTimeout(() => {
                            currentDetailIndex = allAnnouncements.length - 1;
                            const announcement = allAnnouncements[currentDetailIndex];
                            populateAnnouncementDetail(announcement);
                            detailContainer.classList.remove('slide-out-right');
                            detailContainer.classList.add('slide-in-left');
                            setTimeout(() => {
                                detailContainer.classList.remove('slide-in-left');
                            }, 500);
                        }, 250);
                    }
                }
            } else {
                // Swipe left - go to next (reversed)
                if (currentDetailIndex < allAnnouncements.length - 1) {
                    showNextAnnouncement();
                } else {
                    // If at last announcement, go to first one
                    const detailContainer = document.querySelector('.announcement-detail-container');
                    if (detailContainer) {
                        detailContainer.classList.add('slide-out-left');
                        setTimeout(() => {
                            currentDetailIndex = 0;
                            const announcement = allAnnouncements[0];
                            populateAnnouncementDetail(announcement);
                            detailContainer.classList.remove('slide-out-left');
                            detailContainer.classList.add('slide-in-right');
                            setTimeout(() => {
                                detailContainer.classList.remove('slide-in-right');
                            }, 500);
                        }, 250);
                    }
                }
            }
        }
        
        isSwiping = false;
        swipeDistance = 0;
    });
    
    // Mouse events for desktop support
    let mouseStartX = 0;
    let mouseStartY = 0;
    let isMouseDown = false;
    
    newDetailContainer.addEventListener('mousedown', (e) => {
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        isMouseDown = true;
        isSwiping = false;
    });
    
    newDetailContainer.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        
        const currentX = e.clientX;
        const currentY = e.clientY;
        const deltaX = Math.abs(currentX - mouseStartX);
        const deltaY = Math.abs(currentY - mouseStartY);
        
        if (!isSwiping) {
            isSwiping = deltaX > deltaY && deltaX > 20;
        }
    });
    
    newDetailContainer.addEventListener('mouseup', (e) => {
        if (!isSwiping) {
            isMouseDown = false;
            return;
        }
        
        const endX = e.clientX;
        const deltaX = mouseStartX - endX;
        const threshold = 50;
        
        if (Math.abs(deltaX) > threshold) {
            // Swipe RIGHT (deltaX < 0): Show PREVIOUS announcement coming from LEFT (reversed)
            // Swipe LEFT (deltaX > 0): Show NEXT announcement coming from RIGHT (reversed)
            if (deltaX < 0) {
                // Swipe right - go to previous (reversed)
                if (currentDetailIndex > 0) {
                    showPreviousAnnouncement();
                } else {
                    // If at first announcement, go to last one
                    const detailContainer = document.querySelector('.announcement-detail-container');
                    if (detailContainer) {
                        detailContainer.classList.add('slide-out-right');
                        setTimeout(() => {
                            currentDetailIndex = allAnnouncements.length - 1;
                            const announcement = allAnnouncements[currentDetailIndex];
                            populateAnnouncementDetail(announcement);
                            detailContainer.classList.remove('slide-out-right');
                            detailContainer.classList.add('slide-in-left');
                            setTimeout(() => {
                                detailContainer.classList.remove('slide-in-left');
                            }, 500);
                        }, 250);
                    }
                }
            } else {
                // Swipe left - go to next (reversed)
                if (currentDetailIndex < allAnnouncements.length - 1) {
                    showNextAnnouncement();
                } else {
                    // If at last announcement, go to first one
                    const detailContainer = document.querySelector('.announcement-detail-container');
                    if (detailContainer) {
                        detailContainer.classList.add('slide-out-left');
                        setTimeout(() => {
                            currentDetailIndex = 0;
                            const announcement = allAnnouncements[0];
                            populateAnnouncementDetail(announcement);
                            detailContainer.classList.remove('slide-out-left');
                            detailContainer.classList.add('slide-in-right');
                            setTimeout(() => {
                                detailContainer.classList.remove('slide-in-right');
                            }, 500);
                        }, 250);
                    }
                }
            }
        }
        
        isMouseDown = false;
        isSwiping = false;
    });
    
    newDetailContainer.addEventListener('mouseleave', () => {
        isMouseDown = false;
        isSwiping = false;
    });
}

// Function to go back to announcements list
function goBackToList() {
    // Hide detail view
    document.getElementById('announcement-detail-section').style.display = 'none';
    
    // Remove class from body to show header
    document.body.classList.remove('detail-view');
    
    // Show announcements list
    document.getElementById('announcements-list-section').style.display = 'block';
    
    // Remove scroll behavior
    removeStickyScrollBehavior();
    
    // Scroll to top of announcements
    document.getElementById('announcements-list-section').scrollIntoView({ behavior: 'smooth' });
}

// Function to add sticky scroll behavior
function addStickyScrollBehavior() {
    const backBtn = document.querySelector('.detail-back-btn');
    let lastScrollY = window.scrollY;
    let ticking = false;
    
    function updateStickyButton() {
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            // Scrolling down - button becomes more transparent
            backBtn.style.opacity = '0.9';
            backBtn.style.transform = 'translateY(-2px)';
        } else {
            // Scrolling up - button becomes fully opaque
            backBtn.style.opacity = '1';
            backBtn.style.transform = 'translateY(0)';
        }
        
        lastScrollY = currentScrollY;
        ticking = false;
    }
    
    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateStickyButton);
            ticking = true;
        }
    }
    
    // Store the scroll handler for removal later
    window.stickyScrollHandler = requestTick;
    window.addEventListener('scroll', requestTick, { passive: true });
}

// Function to remove sticky scroll behavior
function removeStickyScrollBehavior() {
    if (window.stickyScrollHandler) {
        window.removeEventListener('scroll', window.stickyScrollHandler);
        window.stickyScrollHandler = null;
    }
    
    // Reset button styles
    const backBtn = document.querySelector('.detail-back-btn');
    if (backBtn) {
        backBtn.style.opacity = '1';
        backBtn.style.transform = 'translateY(0)';
    }
}

// Function to share announcement
function shareAnnouncement() {
    const title = document.getElementById('detail-title').textContent;
    const description = document.getElementById('detail-description').textContent;
    const category = document.getElementById('detail-category').textContent;
    const timestamp = document.getElementById('detail-timestamp').textContent;
    
    // Create share text with formatted content
    const shareText = `${title}\n\n${description}\n\nCategory: ${category}\nPosted: ${timestamp}\n\nShared from RICH App`;
    
    // Check if Web Share API is available (mobile browsers)
    if (navigator.share) {
        // Use native share dialog on mobile
        navigator.share({
            title: title,
            text: shareText,
            url: window.location.href
        }).then(() => {
            // Show success message using SweetAlert if available
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Shared!',
                    text: 'Announcement shared successfully.',
                    timer: 2000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'bottom',
                    customClass: {
                        popup: 'swal2-share-popup'
                    }
                });
            }
        }).catch((err) => {
            // User cancelled or error occurred
            if (err.name !== 'AbortError') {
                console.error('Error sharing:', err);
                // Fallback to clipboard
                fallbackShare(shareText);
            }
        });
    } else {
        // Fallback for browsers that don't support Web Share API
        fallbackShare(shareText);
    }
}

// Fallback share function using clipboard
function fallbackShare(shareText) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            // Show success message using SweetAlert if available
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Copied!',
                    text: 'Announcement details copied to clipboard.',
                    timer: 2000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'bottom',
                    customClass: {
                        popup: 'swal2-share-popup'
                    }
                });
            } else {
                alert('Announcement details copied to clipboard!');
            }
        }).catch(() => {
            // Clipboard API failed, show manual copy option
            showManualShareDialog(shareText);
        });
    } else {
        // Clipboard API not available, show manual copy option
        showManualShareDialog(shareText);
    }
}

// Show manual share dialog with text to copy
function showManualShareDialog(shareText) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'info',
            title: 'Share Announcement',
            html: `
                <p style="text-align: left; margin-bottom: 15px;">Copy the text below to share:</p>
                <textarea id="shareTextArea" readonly style="width: 100%; min-height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical;">${shareText}</textarea>
            `,
            showCancelButton: true,
            confirmButtonText: 'Copy Text',
            cancelButtonText: 'Close',
            customClass: {
                popup: 'swal2-share-popup',
                confirmButton: 'swal2-share-confirm'
            },
            didOpen: () => {
                const textarea = document.getElementById('shareTextArea');
                if (textarea) {
                    textarea.select();
                    textarea.setSelectionRange(0, 99999); // For mobile devices
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                const textarea = document.getElementById('shareTextArea');
                if (textarea) {
                    textarea.select();
                    textarea.setSelectionRange(0, 99999);
                    try {
                        document.execCommand('copy');
                        Swal.fire({
                            icon: 'success',
                            title: 'Copied!',
                            text: 'Text copied to clipboard.',
                            timer: 1500,
                            showConfirmButton: false,
                            toast: true,
                            position: 'bottom'
                        });
                    } catch (err) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Copy Failed',
                            text: 'Please manually select and copy the text.',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    }
                }
            }
        });
    } else {
        // Fallback alert
        prompt('Copy this text to share:', shareText);
    }
}

// Handle responsive behavior
function handleResize() {
    // Responsive adjustments can be added here if needed
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    // Add smooth scrolling for better UX
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Setup scroll-based animations for announcement detail containers
    setupScrollBasedAnimations();
    
    await refreshAnnouncementsFromServer();
    
    // Add keyboard navigation for detail view
    document.addEventListener('keydown', function(e) {
        const detailSection = document.getElementById('announcement-detail-section');
        if (e.key === 'Escape' && detailSection.style.display === 'block') {
            goBackToList();
        }
    });
});

// Add resize event listener
window.addEventListener('resize', handleResize);

(function setupAnnouncementsAutoRefreshForResidents() {
    let debounceTimer;
    function scheduleRefresh() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            refreshAnnouncementsFromServer();
        }, 400);
    }
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) scheduleRefresh();
    });
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) scheduleRefresh();
    });
    setInterval(function () {
        if (!document.hidden) refreshAnnouncementsFromServer();
    }, 120000);
})();

// Function to setup scroll-based animations for announcement detail containers
function setupScrollBasedAnimations() {
    const detailSection = document.getElementById('announcement-detail-section');
    if (!detailSection) return;
    
    let lastScrollTop = 0;
    let scrollDirection = 'down';
    const observedContainers = new Set();
    
    // Track scroll direction
    detailSection.addEventListener('scroll', function() {
        const currentScrollTop = detailSection.scrollTop;
        
        if (currentScrollTop > lastScrollTop) {
            scrollDirection = 'down';
        } else if (currentScrollTop < lastScrollTop) {
            scrollDirection = 'up';
        }
        
        lastScrollTop = currentScrollTop;
    }, { passive: true });
    
    // Intersection Observer to detect when containers enter viewport
    const observerOptions = {
        root: detailSection,
        rootMargin: '-20% 0px -20% 0px',
        threshold: [0, 0.3, 0.7, 1]
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            const container = entry.target;
            
            if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
                // Container is entering viewport
                if (!container.classList.contains('visible')) {
                    // Remove any existing animation classes
                    container.classList.remove('slide-in-from-top', 'slide-in-from-bottom', 'slide-out-to-top', 'slide-out-to-bottom');
                    
                    // Apply animation based on scroll direction
                    if (scrollDirection === 'down') {
                        container.classList.add('slide-in-from-bottom');
                    } else {
                        container.classList.add('slide-in-from-top');
                    }
                    
                    // Mark as visible
                    container.classList.add('visible');
                    
                    // Remove animation class after animation completes
                    setTimeout(() => {
                        container.classList.remove('slide-in-from-bottom', 'slide-in-from-top');
                    }, 700);
                }
            } else if (!entry.isIntersecting && entry.intersectionRatio === 0) {
                // Container is leaving viewport
                if (container.classList.contains('visible')) {
                    // Remove visible class and add exit animation
                    container.classList.remove('visible');
                    
                    if (scrollDirection === 'down') {
                        container.classList.add('slide-out-to-top');
                    } else {
                        container.classList.add('slide-out-to-bottom');
                    }
                    
                    // Remove exit animation after it completes
                    setTimeout(() => {
                        container.classList.remove('slide-out-to-top', 'slide-out-to-bottom');
                    }, 600);
                }
            }
        });
    }, observerOptions);
    
    // Observe all announcement detail containers
    function observeContainers() {
        const containers = document.querySelectorAll('.announcement-detail-container');
        containers.forEach(container => {
            if (!observedContainers.has(container)) {
                observer.observe(container);
                observedContainers.add(container);
            }
        });
    }
    
    // Initial observation
    observeContainers();
    
    // Re-observe when new containers are added (e.g., when navigating)
    const mutationObserver = new MutationObserver(function(mutations) {
        observeContainers();
    });
    
    mutationObserver.observe(detailSection, {
        childList: true,
        subtree: true
    });
}
