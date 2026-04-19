// Main UI JavaScript for Barangay Bigte Portal

// Global variables
let currentUser = null;
let removeProfilePicPending = false;
let pendingProfileSaveFormData = null;
let pendingProfileNewEmail = null;
/** Snapshot when profile modal loads; used to detect edits to email & civil status */
let profileEditBaseline = null;
/** True after user taps Edit — email & civil status can be changed */
let profileDetailsUnlocked = false;
const CENSUS_REMIND_LATER_MINUTES = 5; // How long to hide the census reminder after "Remind Me Later" is clicked
let censusReminderTimeoutId = null;
/** Census form waiting for data-privacy consent before submit */
let censusSubmitPendingForm = null;

function clearCensusReminderTimer() {
    if (censusReminderTimeoutId) {
        clearTimeout(censusReminderTimeoutId);
        censusReminderTimeoutId = null;
    }
}

function scheduleCensusReminder(delayMs) {
    clearCensusReminderTimer();
    const safeDelay = Math.max(0, delayMs);
    censusReminderTimeoutId = setTimeout(() => {
        censusReminderTimeoutId = null;
        localStorage.removeItem('census_remind_later');
        checkCensusStatus();
    }, safeDelay);
}

/** Keeps header "Census" button available until the form is successfully submitted */
const LS_CENSUS_REOPEN_SHORTCUT = 'census_reopen_shortcut';

function showCensusReopenButton() {
    const btn = document.getElementById('censusReopenBtn');
    if (btn) {
        btn.classList.add('census-reopen-btn--visible');
        btn.setAttribute('aria-hidden', 'false');
    }
}

/** Pause after toast before icon appears (ms) */
const CENSUS_REOPEN_BTN_ENTRANCE_DELAY_MS = 400;

/** Show census header icon with entrance animation (use after Remind-me-later toast closes) */
function showCensusReopenButtonAnimated() {
    setTimeout(function() {
        const btn = document.getElementById('censusReopenBtn');
        if (!btn || localStorage.getItem(LS_CENSUS_REOPEN_SHORTCUT) !== '1') {
            return;
        }
        btn.classList.remove('census-reopen-btn--pop');
        btn.classList.add('census-reopen-btn--visible');
        btn.setAttribute('aria-hidden', 'false');
        void btn.offsetWidth;
        btn.classList.add('census-reopen-btn--pop');
        function onAnimEnd() {
            btn.removeEventListener('animationend', onAnimEnd);
            btn.classList.remove('census-reopen-btn--pop');
        }
        btn.addEventListener('animationend', onAnimEnd, { once: true });
    }, CENSUS_REOPEN_BTN_ENTRANCE_DELAY_MS);
}

function hideCensusReopenButton() {
    const btn = document.getElementById('censusReopenBtn');
    if (btn) {
        btn.classList.remove('census-reopen-btn--visible', 'census-reopen-btn--pop');
        btn.setAttribute('aria-hidden', 'true');
    }
}

function syncCensusReopenButtonAfterModalClose() {
    if (localStorage.getItem(LS_CENSUS_REOPEN_SHORTCUT) === '1') {
        showCensusReopenButton();
    }
}

function openCensusFromHeaderButton() {
    localStorage.removeItem('census_remind_later');
    clearCensusReminderTimer();
    showCensusModal();
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    if (typeof showFullScreenLoading === 'function') {
        showFullScreenLoading('Loading...');
    }

    initializeApp();
    setupEventListeners();
    Promise.allSettled([
        loadUserData(),
        loadAnnouncements()
    ]).finally(() => {
        if (typeof hideFullScreenLoading === 'function') {
            hideFullScreenLoading();
        }
    });

    if (typeof applySharedCensusHeadSelectOptions === 'function') {
        applySharedCensusHeadSelectOptions();
    }
});

/** PH mobile: digits only, max 11 */
function stripPhoneDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

/** Display as 09XX-XXX-XXXX (11 digits) */
function formatPhilippineMobileDisplay(digits) {
    const d = stripPhoneDigits(digits).slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 4) return d;
    if (d.length <= 7) return d.slice(0, 4) + '-' + d.slice(4);
    return d.slice(0, 4) + '-' + d.slice(4, 7) + '-' + d.slice(7, 11);
}

function getCensusContactDigitsForSubmit() {
    const el = document.getElementById('censusContactNumber');
    if (!el) return '';
    return stripPhoneDigits(el.value).slice(0, 11);
}

/** Sync census contact field from main_UI.php user (contact_phone = digits) */
function applyCensusContactFromProfile(user) {
    const contactEl = document.getElementById('censusContactNumber');
    if (!contactEl || !user) return;
    const raw = user.contact_phone != null && user.contact_phone !== ''
        ? String(user.contact_phone)
        : '';
    const digits = stripPhoneDigits(raw);
    if (digits.length >= 10) {
        contactEl.value = formatPhilippineMobileDisplay(digits);
        contactEl.readOnly = true;
        contactEl.classList.add('census-field-readonly');
        sessionStorage.setItem('user_contact_phone_digits', digits.slice(0, 11));
    } else if (digits.length > 0) {
        contactEl.value = formatPhilippineMobileDisplay(digits);
        contactEl.readOnly = false;
        contactEl.classList.remove('census-field-readonly');
    } else {
        contactEl.value = '';
        contactEl.readOnly = false;
        contactEl.classList.remove('census-field-readonly');
    }
}

function bindCensusContactPhoneField() {
    const el = document.getElementById('censusContactNumber');
    if (!el || el.dataset.phPhoneBound === '1') return;
    el.dataset.phPhoneBound = '1';
    function syncFromInput() {
        if (el.readOnly) return;
        const digits = stripPhoneDigits(el.value).slice(0, 11);
        const formatted = formatPhilippineMobileDisplay(digits);
        if (el.value !== formatted) {
            el.value = formatted;
        }
    }
    el.addEventListener('input', syncFromInput);
    el.addEventListener('blur', syncFromInput);
}

// Initialize the application
function initializeApp() {
    console.log('Barangay Bigte Portal initialized');
    
    // Show "Hi, Loading..." during initial load
    const greetingElement = document.querySelector('.user-info h2');
    if (greetingElement) {
        greetingElement.textContent = 'Hi, Loading..';
    }
    
    // Show loading initial in profile picture
    const profileInitials = document.querySelector('.profile-picture .profile-initials');
    const profileImg = document.querySelector('.profile-picture img');
    const profilePlaceholder = document.querySelector('.profile-picture .profile-placeholder');
    
    // Hide image and placeholder, show loading initial
    if (profileImg) profileImg.style.display = 'none';
    if (profilePlaceholder) profilePlaceholder.style.display = 'none';
    if (profileInitials) {
        profileInitials.textContent = 'B'; // Show "B" for Bigteño during loading
        profileInitials.style.display = 'flex';
    }
    
    // Check if user is logged in
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) {
        // Check if this is a direct access (testing mode)
        const urlParams = new URLSearchParams(window.location.search);
        const testingMode = urlParams.get('testing') === 'true';
        
        if (!testingMode) {
            // Check if we're running on localhost (development mode)
            const isLocalhost = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' || 
                                window.location.hostname === '';
            
            if (!isLocalhost) {
                // No sessionStorage found - redirect to index.php
                // index.php will check PHP session and either:
                // 1. If PHP session exists, sync to sessionStorage and redirect back to main_UI.html
                // 2. If no PHP session, show login page
                window.location.href = 'index.php';
                return;
            }
        }
        
        console.log('Development mode: No user session found, using default user');
        updateUserGreeting('test@example.com'); // Use default for testing
        return;
    }
    
    // User email exists, data will be loaded via loadUserData()
    // Greeting will be updated by updateUserInterface() when data arrives
    // Census status will be checked after user data is successfully loaded
}

// Load user data
function loadUserData() {
    console.log('DEBUG: Loading updated JavaScript file with main_UI.php endpoint');
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (userEmail) {
        // Fetch user data from server
        return fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: userEmail
            })
        })
        .then(response => {
            console.log('User data response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text().then(text => {
                try {
                    return JSON.parse(text);
                } catch (e) {
                    console.error('JSON parse error:', e);
                    console.error('Response text:', text);
                    throw new Error('Invalid JSON response');
                }
            });
        })
        .then(data => {
            console.log('User data received:', data);
            console.log('User first name:', data.user?.first_name);
            if (data.success) {
                currentUser = data.user;
                const cp = data.user && data.user.contact_phone != null ? String(data.user.contact_phone).trim() : '';
                if (cp !== '') {
                    const d = cp.replace(/\D/g, '').slice(0, 11);
                    if (d.length >= 10) {
                        sessionStorage.setItem('user_contact_phone_digits', d);
                    }
                } else {
                    sessionStorage.removeItem('user_contact_phone_digits');
                }
                updateUserInterface(data.user);
                // Only check census status if user data is successfully loaded
                checkCensusStatus();
            } else {
                console.warn('Server returned error:', data.message);
                // User not found - don't set currentUser and don't check census
                currentUser = null;
                sessionStorage.removeItem('user_contact_phone_digits');
                // Use default data if server returns error
                updateUserInterface({
                    first_name: 'JUAN',
                    mobile: '+63 935 *** 8039'
                });
            }
        })
        .catch(error => {
            console.error('Error loading user data:', error);
            // User not found or error - don't set currentUser and don't check census
            currentUser = null;
            sessionStorage.removeItem('user_contact_phone_digits');
            // Use actual logged-in user data if available
            const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
            const userName = userEmail ? userEmail.split('@')[0].toUpperCase() : 'JUAN';
            updateUserInterface({
                first_name: userName,
                mobile: '+63 935 *** 8039'
            });
        });
    }

    // Use default data for testing when no session exists
    updateUserInterface({
        first_name: 'JUAN',
        mobile: '+63 935 *** 8039'
    });
    return Promise.resolve();
}

// Update user greeting
function updateUserGreeting(email) {
    // Extract name from email or use default
    const name = email ? email.split('@')[0] : 'Bigteño';
    const greetingElement = document.querySelector('.user-info h2');
    if (greetingElement) {
        greetingElement.textContent = `Hi, ${name}!`;
    }
}

// Update user interface with user data
function updateUserInterface(user) {
    // Update name
    const greetingElement = document.querySelector('.user-info h2');
    if (greetingElement) {
        const name = user.first_name || user.name || 'Bigteño';
        greetingElement.textContent = `Hi, ${name}!`;
    }
    
    // Update header profile picture
    renderHeaderProfilePicture(user);
    
    // Update phone number (prefer API contact_phone; format like census field)
    const phoneElement = document.querySelector('.phone-number');
    if (phoneElement) {
        let phone = '+63 935 *** 8039';
        if (user.contact_phone != null && String(user.contact_phone).trim() !== '') {
            phone = formatPhilippineMobileDisplay(user.contact_phone);
        } else if (user.mobile || user.phone) {
            phone = formatPhilippineMobileDisplay(user.mobile || user.phone);
        }
        phoneElement.textContent = phone;
    }

    applyCensusContactFromProfile(user);
}

// Calculate initials from name
function getInitials(firstName, lastName, firstOnly = false) {
    if (firstOnly) {
        return firstName ? firstName.charAt(0).toUpperCase() : '';
    }
    const first = firstName ? firstName.charAt(0).toUpperCase() : '';
    const last = lastName ? lastName.charAt(0).toUpperCase() : '';
    return first + last;
}

// Render header profile picture with initials or image
function renderHeaderProfilePicture(user) {
    const profileImg = document.querySelector('.profile-picture img');
    const profilePlaceholder = document.querySelector('.profile-picture .profile-placeholder');
    const profileInitials = document.querySelector('.profile-picture .profile-initials');
    
    // Hide all initially
    if (profileImg) profileImg.style.display = 'none';
    if (profilePlaceholder) profilePlaceholder.style.display = 'none';
    if (profileInitials) profileInitials.style.display = 'none';
    
    // Check if user has profile picture from database
    if (user && user.profile_pic) {
        // Show image
        if (profileImg) {
            profileImg.src = 'data:image/jpeg;base64,' + user.profile_pic;
            profileImg.style.display = 'block';
        }
    } else if (user && user.first_name) {
        // Show initials (just first letter of first name during loading)
        if (profileInitials) {
            const initial = getInitials(user.first_name, '', true); // first name only
            if (initial) {
                profileInitials.textContent = initial;
                profileInitials.style.display = 'flex';
            } else {
                // Show default icon if no initial
                if (profilePlaceholder) {
                    profilePlaceholder.style.display = 'flex';
                }
            }
        }
    } else {
        // Show default icon if no user data yet
        if (profilePlaceholder) {
            profilePlaceholder.style.display = 'flex';
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    setupDocumentRequestButtons();
    setupDocumentRequestScrolling();
    setupAnnouncementScrolling();
    setupSeeAllButton();
    setupServiceTiles();
    setupNotificationListeners();
    setupEditProfileEventListeners();
}

// Setup document request buttons navigation
async function ensureCensusBeforeDocumentRequests() {
    // Reuse server-side census status; if not completed, show modal / alert and block.
    if (!currentUser) {
        console.log('No currentUser set; blocking document requests until login.');
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'warning',
                title: 'Login required',
                text: 'Please login first before requesting documents.',
                confirmButtonColor: '#3085d6'
            });
        }
        return false;
    }

    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) {
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'warning',
                title: 'Login required',
                text: 'Please login first before requesting documents.',
                confirmButtonColor: '#3085d6'
            });
        }
        return false;
    }

    try {
        const response = await fetch(`php/check_census.php?t=${Date.now()}`, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail })
        });
        const data = await response.json();
        console.log('ensureCensusBeforeDocumentRequests response:', data);

        if (data.success && data.emailExists === true && data.hasCompletedCensus) {
            // OK: census completed for this account
            return true;
        }

        if (data.success && data.emailExists === true && data.isArchived === true) {
            if (typeof Swal !== 'undefined') {
                await Swal.fire({
                    icon: 'info',
                    title: 'Document Request Disabled',
                    text: 'Your census record is archived. Please contact the barangay to reactivate your census record before requesting documents.',
                    confirmButtonColor: '#3085d6'
                });
            }
            return false;
        }

        // Not completed → show census modal + info alert; block navigation
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'info',
                title: 'Complete Census First',
                text: 'Please fill out the Barangay Census form before requesting documents.',
                confirmButtonText: 'Open Census Form',
                confirmButtonColor: '#3085d6'
            });
        }
        showCensusModal();
        return false;
    } catch (e) {
        console.error('Failed to verify census status before document request:', e);
        // On error, be safe and require census
        if (typeof Swal !== 'undefined') {
            await Swal.fire({
                icon: 'info',
                title: 'Complete Census First',
                text: 'Please fill out the Barangay Census form before requesting documents.',
                confirmButtonText: 'Open Census Form',
                confirmButtonColor: '#3085d6'
            });
        }
        showCensusModal();
        return false;
    }
}

function setupDocumentRequestButtons() {
    // Map document types to their corresponding request types
    const documentTypeMap = {
        'Business Permit': 'business-permit',
        'Barangay ID': 'barangay-id',
        'Certificate of Clearance': 'clearance-form'
    };
    
    // Add click event listeners to all "Request Now" buttons
    const requestButtons = document.querySelectorAll('.request-btn');
    requestButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            
            const ok = await ensureCensusBeforeDocumentRequests();
            if (!ok) return;

            // Find the document title from the card
            const card = button.closest('.request-card');
            const documentTitle = card.querySelector('h4').textContent;
            
            // Get the corresponding document type
            const documentType = documentTypeMap[documentTitle] || 'barangay-id';
            
            // Navigate to request page with document type parameter
            navigateToRequestWithLoading(`request.html?type=${documentType}`);
        });
    });
    
    console.log('Document request buttons navigation initialized');
}

function navigateToRequestWithLoading(targetUrl = 'request.html') {
    // Keep first overlay for main_UI loading only.
    // request.html handles its own loading overlay on entry.
    window.location.href = targetUrl;
}

// Setup See All button navigation (Barangay announcements only — not Full Disclosure row)
function setupSeeAllButton() {
    const seeAllBtn = document.querySelector('.see-all-container:not(.see-all-container--full-disclosure) .see-all-btn');
    if (seeAllBtn) {
        seeAllBtn.addEventListener('click', function() {
            window.location.href = 'announcements.html';
        });
    }
}

// Wire service tiles navigation (Documents, Emergency, Feedback & Concerns, Hotline)
function setupServiceTiles() {
    // Emergency tile already has inline onclick in HTML for robustness, but set here too
    const emergencyTile = document.querySelector('.service-item[data-service="emergency"]');
    if (emergencyTile) {
        emergencyTile.addEventListener('click', () => window.location.href = 'emergency.html');
    }
    const concernsTile = document.querySelector('.service-item[data-service="complaints"]');
    if (concernsTile) {
        concernsTile.addEventListener('click', () => window.location.href = 'concerns.html');
    }
}

// Setup horizontal scrolling for document request cards
function setupDocumentRequestScrolling() {
    const cardsTrack = document.querySelector('.cards-track');
    const indicators = document.querySelectorAll('.indicator');
    const cards = document.querySelectorAll('.request-card');
    
    if (!cardsTrack || !indicators.length || !cards.length) {
        console.log('Document request scrolling elements not found');
        return;
    }
    
    let currentIndex = 0;
    const totalCards = cards.length;
    
    // Function to update the scroll position
    function updateScrollPosition(index) {
        const translateX = -index * 33.333; // Each card is 33.333% of the track width
        cardsTrack.style.transform = `translateX(${translateX}%)`;
        
        // Update indicators
        indicators.forEach((indicator, i) => {
            indicator.classList.toggle('active', i === index);
        });
        
        currentIndex = index;
    }
    
    // Add click event listeners to indicators
    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            updateScrollPosition(index);
        });
    });
    
    // Add touch/swipe support for mobile
    let startX = 0;
    let startY = 0;
    let isScrolling = false;
    
    cardsTrack.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isScrolling = false;
    });
    
    cardsTrack.addEventListener('touchmove', (e) => {
        if (!isScrolling) {
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            isScrolling = deltaX > deltaY;
        }
        
        if (isScrolling) {
            e.preventDefault();
        }
    });
    
    cardsTrack.addEventListener('touchend', (e) => {
        if (!isScrolling) return;
        
        const endX = e.changedTouches[0].clientX;
        const deltaX = startX - endX;
        const threshold = 50;
        
        if (Math.abs(deltaX) > threshold) {
            if (deltaX > 0 && currentIndex < totalCards - 1) {
                // Swipe left - next card
                updateScrollPosition(currentIndex + 1);
            } else if (deltaX < 0 && currentIndex > 0) {
                // Swipe right - previous card
                updateScrollPosition(currentIndex - 1);
            }
        }
    });
    
    // Auto-scroll functionality (optional)
    let autoScrollInterval;
    
    function startAutoScroll() {
        autoScrollInterval = setInterval(() => {
            const nextIndex = (currentIndex + 1) % totalCards;
            updateScrollPosition(nextIndex);
        }, 5000); // Change card every 5 seconds
    }
    
    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
    
    // Start auto-scroll when user is not interacting
    startAutoScroll();
    
    // Stop auto-scroll on user interaction
    cardsTrack.addEventListener('mouseenter', stopAutoScroll);
    cardsTrack.addEventListener('mouseleave', startAutoScroll);
    
    // Stop auto-scroll on touch
    cardsTrack.addEventListener('touchstart', stopAutoScroll);
    
    // Initialize with first card
    updateScrollPosition(0);
    
    console.log('Document request scrolling initialized');
}

// Setup horizontal scrolling for announcement cards with auto-carousel
function setupAnnouncementScrolling() {
    const announcementsWrapper = document.getElementById('announcements-wrapper');
    const announcementsTrack = document.getElementById('announcements-track');
    const cards = document.querySelectorAll('.announcement-card');
    const prevBtn = document.getElementById('prev-announcement');
    const nextBtn = document.getElementById('next-announcement');
    const indicatorsContainer = document.getElementById('announcement-indicators');
    
    if (!announcementsTrack || !cards.length) {
        console.log('Announcement scrolling elements not found');
        return;
    }
    
    const totalCards = cards.length;
    const cardsPerView = 3;
    
    // Only show carousel if there are more than 3 cards
    if (totalCards <= cardsPerView) {
        if (announcementsWrapper) {
            announcementsWrapper.classList.add('hide-nav');
        }
        // Don't add carousel functionality if only 3 or fewer cards
        return;
    }
    
    // Remove hide-nav class to show navigation
    if (announcementsWrapper) {
        announcementsWrapper.classList.remove('hide-nav');
    }
    
    let currentIndex = 0;
    let autoScrollInterval;
    const maxIndex = Math.max(0, totalCards - cardsPerView);
    
    // Function to get card width dynamically
    function getCardWidth() {
        if (cards.length === 0) return 0;
        return cards[0].offsetWidth + (parseFloat(getComputedStyle(cards[0]).marginLeft || 0) + parseFloat(getComputedStyle(cards[0]).marginRight || 0));
    }
    
    // Function to update the scroll position
    function updateScrollPosition(index) {
        const cardWidth = getCardWidth();
        const translateX = -index * cardWidth;
        announcementsTrack.style.transform = `translateX(${translateX}px)`;
        currentIndex = index;
        
        // Update global carousel state
        if (announcementCarousel) {
            announcementCarousel.currentIndex = currentIndex;
        }
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update indicators
        updateIndicators();
    }
    
    // Function to update navigation buttons state
    function updateNavigationButtons() {
        if (prevBtn) {
            prevBtn.classList.toggle('disabled', currentIndex === 0);
        }
        if (nextBtn) {
            nextBtn.classList.toggle('disabled', currentIndex >= maxIndex);
        }
    }
    
    // Function to create and update indicators
    function createIndicators() {
        if (!indicatorsContainer) return;
        
        const totalPages = maxIndex + 1;
        indicatorsContainer.innerHTML = '';
        
        for (let i = 0; i < totalPages; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'carousel-indicator';
            if (i === 0) indicator.classList.add('active');
            indicator.addEventListener('click', () => {
                updateScrollPosition(i);
                resetAutoScroll();
            });
            indicatorsContainer.appendChild(indicator);
        }
    }
    
    function updateIndicators() {
        const indicators = indicatorsContainer.querySelectorAll('.carousel-indicator');
        indicators.forEach((indicator, index) => {
            indicator.classList.toggle('active', index === currentIndex);
        });
    }
    
    // Add touch/swipe support for mobile
    let startX = 0;
    let startY = 0;
    let isScrolling = false;
    
    announcementsTrack.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isScrolling = false;
        stopAutoScroll();
    });
    
    announcementsTrack.addEventListener('touchmove', (e) => {
        if (!isScrolling) {
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            isScrolling = deltaX > deltaY;
        }
        
        if (isScrolling) {
            e.preventDefault();
        }
    });
    
    announcementsTrack.addEventListener('touchend', (e) => {
        if (!isScrolling) return;
        
        const endX = e.changedTouches[0].clientX;
        const deltaX = startX - endX;
        const threshold = 50;
        
        if (Math.abs(deltaX) > threshold) {
            if (deltaX > 0 && currentIndex < maxIndex) {
                // Swipe left - next
                updateScrollPosition(currentIndex + 1);
            } else if (deltaX < 0 && currentIndex > 0) {
                // Swipe right - previous
                updateScrollPosition(currentIndex - 1);
            }
        }
        
        // Restart auto-scroll after a delay
        setTimeout(() => startAutoScroll(), 3000);
    });
    
    // Auto-scroll functionality
    function startAutoScroll() {
        stopAutoScroll(); // Clear any existing interval
        
        if (currentIndex >= maxIndex) {
            // If at the end, loop back to start
            autoScrollInterval = setInterval(() => {
                if (currentIndex >= maxIndex) {
                    updateScrollPosition(0);
                } else {
                    updateScrollPosition(currentIndex + 1);
                }
            }, 4000); // Change slide every 4 seconds
        } else {
            autoScrollInterval = setInterval(() => {
                if (currentIndex < maxIndex) {
                    updateScrollPosition(currentIndex + 1);
                } else {
                    // Loop back to start
                    updateScrollPosition(0);
                }
            }, 4000); // Change slide every 4 seconds
        }
    }
    
    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }
    
    function resetAutoScroll() {
        stopAutoScroll();
        setTimeout(() => startAutoScroll(), 2000);
    }
    
    // Pause auto-scroll on hover
    if (announcementsWrapper) {
        announcementsWrapper.addEventListener('mouseenter', stopAutoScroll);
        announcementsWrapper.addEventListener('mouseleave', () => {
            setTimeout(() => startAutoScroll(), 1000);
        });
    }
    
    // Initialize
    createIndicators();
    updateScrollPosition(0);
    startAutoScroll();
    
    // Store carousel state globally for navigation buttons
    announcementCarousel = {
        currentIndex: 0,
        maxIndex: maxIndex,
        updateScrollPosition: updateScrollPosition,
        resetAutoScroll: resetAutoScroll
    };
    
    console.log('Announcement carousel initialized with auto-scroll');
}

// Setup notification listeners
function setupNotificationListeners() {
    // Mark all as read functionality
    const markAllReadBtn = document.querySelector('.mark-all-read');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function(e) {
            e.preventDefault();
            markAllNotificationsAsRead();
        });
    }
    
    // Individual notification item clicks
    const notificationItems = document.querySelectorAll('.notification-item');
    notificationItems.forEach(item => {
        item.addEventListener('click', function() {
            handleNotificationClick(this);
        });
    });
    
    console.log('Notification listeners initialized');
}

// Mark all notifications as read
function markAllNotificationsAsRead() {
    const notificationItems = document.querySelectorAll('.notification-item');
    const notificationDot = document.querySelector('.notification-dot');
    
    // Remove highlighted class from all notifications
    notificationItems.forEach(item => {
        item.classList.remove('highlighted');
    });
    
    // Hide notification dot
    if (notificationDot) {
        notificationDot.style.display = 'none';
    }
    
    // Close dropdown
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Show success message
    showToast('All notifications marked as read', 'success');
}

// Handle individual notification click
function handleNotificationClick(notificationItem) {
    // Remove highlighted class
    notificationItem.classList.remove('highlighted');
    
    // Get notification text
    const notificationText = notificationItem.querySelector('p').textContent;
    
    // Close dropdown
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Show notification details or navigate to relevant page
    showToast(`Notification clicked: ${notificationText}`, 'info');
    
    // TODO: Add navigation logic based on notification type
    // For example, navigate to transactions page for document ready notifications
    if (notificationText.includes('Barangay ID') || notificationText.includes('Indigency')) {
        // Navigate to transactions page
        setTimeout(() => {
            window.location.href = 'transactions.html';
        }, 1000);
    }
}


// Utility functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Hide toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function seeAll() {
    window.location.href = 'announcements.html';
}

function seeAllFullDisclosure() {
    window.location.href = 'full_disclosure.html';
}

// Global variable to store carousel state
let announcementCarousel = null;

/** Resolve relative API/asset paths against the current page URL (correct php/announcements.php + DB-served images). */
function resolvePageAssetUrl(relativeOrAbsolute) {
    if (!relativeOrAbsolute) return '';
    if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
    try {
        return new URL(relativeOrAbsolute, window.location.href).href;
    } catch (e) {
        return relativeOrAbsolute;
    }
}

// Function to scroll announcements (called by navigation buttons)
function scrollAnnouncements(direction) {
    if (!announcementCarousel) return;
    
    const { currentIndex, maxIndex, updateScrollPosition, resetAutoScroll } = announcementCarousel;
    
    if (direction === 'next' && currentIndex < maxIndex) {
        updateScrollPosition(currentIndex + 1);
        resetAutoScroll();
    } else if (direction === 'prev' && currentIndex > 0) {
        updateScrollPosition(currentIndex - 1);
        resetAutoScroll();
    }
}

// Function to fetch announcements from the database
async function fetchAnnouncements() {
    try {
        const response = await fetch(resolvePageAssetUrl('php/announcements.php'), { cache: 'no-store' });
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

// Function to truncate text to specified number of words
function truncateWords(text, maxWords) {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) {
        return text;
    }
    return words.slice(0, maxWords).join(' ') + '...';
}

function cacheBustAnnouncementImgUrl(url, uniq) {
    if (!url) return url;
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    const suffix = uniq != null ? uniq : Date.now();
    return url + sep + '_r=' + suffix;
}

// Function to create announcement card HTML for main UI
function createMainUIAnnouncementCard(announcement, listIndex) {
    const defaultImage = resolvePageAssetUrl('Images/brgyHall.jpg');
    const baseSrc = announcement.image ? resolvePageAssetUrl(announcement.image) : defaultImage;
    const imageSrc = cacheBustAnnouncementImgUrl(baseSrc, Date.now() + '_' + listIndex);
    const defaultForError = cacheBustAnnouncementImgUrl(defaultImage, 'fb_' + listIndex);
    const imageAlt = announcement.title || 'Announcement';
    const formattedDate = announcement.formatted_date || '';
    
    return `
        <div class="announcement-card">
            <div class="announcement-image-container">
                <img src="${imageSrc}" alt="${imageAlt}" class="announcement-image" 
                     onerror="this.onerror=null; this.src='${defaultForError}';">
            </div>
            <div class="announcement-content-wrapper">
                <h5 class="announcement-title-horizontal">${announcement.title}</h5>
                <div class="announcement-date-horizontal">${formattedDate}</div>
            </div>
        </div>
    `;
}

// Function to display announcements in main UI
function displayMainUIAnnouncements(announcements) {
    const track = document.getElementById('announcements-track');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noAnnouncements = document.getElementById('no-announcements');
    
    // Hide loading indicator
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
    
    track.querySelectorAll('.announcement-card').forEach((el) => el.remove());

    if (announcements.length === 0) {
        // Show no announcements message
        if (noAnnouncements) {
            noAnnouncements.style.display = 'block';
        }
    } else {
        // Hide no announcements message
        if (noAnnouncements) {
            noAnnouncements.style.display = 'none';
        }
        
        // Create and insert announcement cards
        const cardsHTML = announcements.map((announcement, i) => createMainUIAnnouncementCard(announcement, i)).join('');
        track.insertAdjacentHTML('beforeend', cardsHTML);
        
        // Reinitialize scrolling after adding new cards
        setupAnnouncementScrolling();
    }
}

// Function to load announcements
async function loadAnnouncements() {
    try {
        const announcements = await fetchAnnouncements();
        displayMainUIAnnouncements(announcements);
    } catch (error) {
        console.error('Error loading announcements:', error);
    }
}

(function setupMainUiAnnouncementsAutoRefresh() {
    let debounceTimer;
    function scheduleRefresh() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            loadAnnouncements();
        }, 400);
    }
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) scheduleRefresh();
    });
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) scheduleRefresh();
    });
    setInterval(function () {
        if (!document.hidden) loadAnnouncements();
    }, 120000);
})();

function Documents() {
    ensureCensusBeforeDocumentRequests().then((ok) => {
        if (!ok) return;
        navigateToRequestWithLoading('request.html');
    });
}

function BarangayOrdinance() {
    openBarangayOrdinanceGallery();
}

(function setupBarangayOrdinanceGallery() {
    const overlay = document.getElementById('barangayOrdinanceGallery');
    const backdrop = document.getElementById('barangayOrdinanceGalleryBackdrop');
    const homeBtn = document.getElementById('barangayOrdinanceGalleryHome');
    const track = document.getElementById('ordinanceCarouselTrack');
    const viewport = document.getElementById('ordinanceCarouselViewport');
    const dotsContainer = document.getElementById('ordinanceCarouselDots');
    if (!overlay || !track || !viewport || !dotsContainer) {
        return;
    }

    let current = 0;
    /** Real slides only (before clone nodes); infinite loop uses N+2 DOM nodes when >= 2. */
    let ordinanceRealCount = 0;
    let autoTimer = null;
    let keyHandler = null;
    var closeGalleryTimer = null;

    function syncSlides() {
        return Array.from(track.querySelectorAll('.ordinance-slide'));
    }

    function getSlideCount() {
        return syncSlides().length;
    }

    function isInfiniteOrdinance() {
        return ordinanceRealCount >= 2;
    }

    /** Map DOM index (with clones) to dot index 0..real-1 */
    function domIndexToDotIndex(domIdx) {
        if (!isInfiniteOrdinance()) return domIdx;
        const N = ordinanceRealCount;
        if (domIdx === 0) return N - 1;
        if (domIdx === N + 1) return 0;
        return domIdx - 1;
    }

    /** N slides → track width N×100% of viewport; each slide 100/N of track. */
    function applyOrdinanceSlideLayout() {
        const slides = syncSlides();
        const n = slides.length;
        if (n === 0) {
            track.style.width = '';
            return;
        }
        const pct = 100 / n;
        const w = pct + '%';
        track.style.width = n * 100 + '%';
        slides.forEach((slide) => {
            slide.style.flex = '0 0 ' + w;
            slide.style.width = w;
            slide.style.maxWidth = w;
            slide.style.minWidth = w;
        });
    }

    function buildDots() {
        const n = isInfiniteOrdinance() ? ordinanceRealCount : getSlideCount();
        dotsContainer.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ordinance-dot' + (i === 0 ? ' is-active' : '');
            b.setAttribute('aria-label', 'Slide ' + (i + 1));
            b.setAttribute('role', 'tab');
            b.addEventListener('click', () => goToRealSlide(i));
            dotsContainer.appendChild(b);
        }
    }

    function updateDots() {
        const di = domIndexToDotIndex(current);
        dotsContainer.querySelectorAll('.ordinance-dot').forEach((d, i) => {
            d.classList.toggle('is-active', i === di);
        });
    }

    function applyTransform() {
        const total = getSlideCount();
        if (total === 0) {
            track.style.transform = 'translateX(0)';
            return;
        }
        var pct = -(current * (100 / total));
        track.style.transform = 'translateX(' + pct + '%)';
    }

    function goToDomIndex(index) {
        const slides = syncSlides();
        const total = slides.length;
        if (total === 0) return;
        if (isInfiniteOrdinance()) {
            current = Math.max(0, Math.min(index, total - 1));
        } else {
            current = ((index % total) + total) % total;
        }
        applyTransform();
        updateDots();
        slides.forEach((s, i) => s.classList.toggle('is-highlight', i === current));
    }

    /** Dot / open: real slide index 0..N-1 */
    function goToRealSlide(realIdx) {
        if (!isInfiniteOrdinance()) {
            goToDomIndex(realIdx);
            return;
        }
        goToDomIndex(realIdx + 1);
    }

    function snapOrdinanceToFirstReal() {
        track.style.transition = 'none';
        current = 1;
        applyTransform();
        updateDots();
        syncSlides().forEach((s, i) => s.classList.toggle('is-highlight', i === current));
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                track.style.transition = '';
            });
        });
    }

    function snapOrdinanceToLastReal() {
        track.style.transition = 'none';
        current = ordinanceRealCount;
        applyTransform();
        updateDots();
        syncSlides().forEach((s, i) => s.classList.toggle('is-highlight', i === current));
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                track.style.transition = '';
            });
        });
    }

    function onOrdinanceTrackTransitionEnd(e) {
        if (e.target !== track) return;
        if (e.propertyName && e.propertyName !== 'transform') return;
        if (!isInfiniteOrdinance()) return;
        const N = ordinanceRealCount;
        if (current === N + 1) {
            snapOrdinanceToFirstReal();
        } else if (current === 0) {
            snapOrdinanceToLastReal();
        }
    }

    function nextSlide() {
        const M = getSlideCount();
        if (M <= 1) return;
        if (!isInfiniteOrdinance()) {
            goToDomIndex((current + 1) % M);
            return;
        }
        const N = ordinanceRealCount;
        if (current === N + 1) {
            track.style.transition = 'none';
            current = 2;
            applyTransform();
            updateDots();
            syncSlides().forEach((s, i) => s.classList.toggle('is-highlight', i === current));
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    track.style.transition = '';
                });
            });
            return;
        }
        goToDomIndex(current + 1);
    }

    function prevSlide() {
        const M = getSlideCount();
        if (M <= 1) return;
        if (!isInfiniteOrdinance()) {
            goToDomIndex((current - 1 + M) % M);
            return;
        }
        const N = ordinanceRealCount;
        if (current === 0) {
            track.style.transition = 'none';
            current = Math.max(1, N - 1);
            applyTransform();
            updateDots();
            syncSlides().forEach((s, i) => s.classList.toggle('is-highlight', i === current));
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    track.style.transition = '';
                });
            });
            return;
        }
        goToDomIndex(current - 1);
    }

    function startAutoAdvance() {
        stopAutoAdvance();
        if (getSlideCount() <= 1) return;
        autoTimer = setInterval(nextSlide, 8000);
    }

    function stopAutoAdvance() {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
    }

    function onKeyDown(e) {
        if (!overlay.classList.contains('is-open')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeBarangayOrdinanceGallery();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            nextSlide();
            startAutoAdvance();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevSlide();
            startAutoAdvance();
        }
    }

    let touchStartX = null;

    function onTouchStart(e) {
        touchStartX = e.changedTouches[0].screenX;
    }

    function onTouchEnd(e) {
        if (touchStartX == null) return;
        const dx = e.changedTouches[0].screenX - touchStartX;
        touchStartX = null;
        if (Math.abs(dx) < 45) return;
        if (dx < 0) nextSlide();
        else prevSlide();
        startAutoAdvance();
    }

    async function loadOrdinanceSlidesIntoTrack() {
        ordinanceRealCount = 0;
        track.innerHTML = '<p class="ordinance-carousel-loading">Naglo-load...</p>';
        try {
            const res = await fetch('php/ordinances.php', { cache: 'no-store' });
            const raw = await res.text();
            let data;
            try {
                data = JSON.parse(raw);
            } catch (parseErr) {
                console.error('ordinances.php non-JSON:', raw.slice(0, 400));
                throw new Error('Invalid server response');
            }
            track.innerHTML = '';
            if (!data || data.success !== true) {
                throw new Error((data && data.message) || 'Invalid response');
            }
            const ordinances = Array.isArray(data.ordinances) ? data.ordinances : [];
            if (ordinances.length === 0) {
                track.innerHTML = '<p class="ordinance-carousel-empty">Walang naka-post na ordinance slides.</p>';
            } else {
                let added = 0;
                ordinances.forEach((row) => {
                    const src = row.image_url || row.image;
                    if (!src) return;
                    added++;
                    const fig = document.createElement('figure');
                    fig.className = 'ordinance-slide';
                    fig.dataset.id = String(row.id);
                    const img = document.createElement('img');
                    try {
                        img.src = new URL(src, window.location.href).href;
                    } catch (e) {
                        img.src = src;
                    }
                    img.alt = row.caption ? row.caption : 'Barangay ordinance';
                    img.loading = 'lazy';
                    fig.appendChild(img);
                    if (row.caption) {
                        const cap = document.createElement('figcaption');
                        cap.textContent = row.caption;
                        fig.appendChild(cap);
                    }
                    track.appendChild(fig);
                });
                if (added === 0) {
                    track.innerHTML = '<p class="ordinance-carousel-empty">Walang wastong larawan sa database.</p>';
                    ordinanceRealCount = 0;
                } else {
                    ordinanceRealCount = added;
                    if (ordinanceRealCount >= 2) {
                        const nodes = track.querySelectorAll('.ordinance-slide');
                        const first = nodes[0];
                        const last = nodes[ordinanceRealCount - 1];
                        const cloneLast = last.cloneNode(true);
                        const cloneFirst = first.cloneNode(true);
                        cloneLast.classList.add('ordinance-slide--clone');
                        cloneFirst.classList.add('ordinance-slide--clone');
                        cloneLast.setAttribute('aria-hidden', 'true');
                        cloneFirst.setAttribute('aria-hidden', 'true');
                        track.insertBefore(cloneLast, track.firstChild);
                        track.appendChild(cloneFirst);
                    }
                }
            }
        } catch (err) {
            console.error('loadOrdinanceSlidesIntoTrack:', err);
            ordinanceRealCount = 0;
            track.innerHTML = '<p class="ordinance-carousel-empty">Hindi ma-load ang mga larawan. Subukan muli mamaya.</p>';
        }
        applyOrdinanceSlideLayout();
        buildDots();
        current = isInfiniteOrdinance() ? 1 : 0;
        syncSlides().forEach((s, i) => s.classList.toggle('is-highlight', i === current));
        applyTransform();
        updateDots();
    }

    const loadPromise = loadOrdinanceSlidesIntoTrack();

    window.openBarangayOrdinanceGallery = function openBarangayOrdinanceGallery() {
        Promise.resolve(loadPromise).then(function () {
            if (closeGalleryTimer) {
                clearTimeout(closeGalleryTimer);
                closeGalleryTimer = null;
            }
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            goToRealSlide(0);
            startAutoAdvance();
            keyHandler = onKeyDown;
            document.addEventListener('keydown', keyHandler);
            requestAnimationFrame(function () {
                overlay.classList.add('is-visible');
            });
        });
    };

    window.closeBarangayOrdinanceGallery = function closeBarangayOrdinanceGallery() {
        overlay.classList.remove('is-visible');
        stopAutoAdvance();
        if (keyHandler) {
            document.removeEventListener('keydown', keyHandler);
            keyHandler = null;
        }
        closeGalleryTimer = window.setTimeout(function () {
            closeGalleryTimer = null;
            if (overlay.classList.contains('is-open') && !overlay.classList.contains('is-visible')) {
                overlay.classList.remove('is-open');
                overlay.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }
        }, 320);
    };

    function onBackdropClick(e) {
        if (e.target === backdrop) {
            closeBarangayOrdinanceGallery();
        }
    }

    if (homeBtn) homeBtn.addEventListener('click', closeBarangayOrdinanceGallery);
    if (backdrop) backdrop.addEventListener('click', onBackdropClick);
    track.addEventListener('transitionend', onOrdinanceTrackTransitionEnd);
    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });
    viewport.addEventListener('mouseenter', stopAutoAdvance);
    viewport.addEventListener('mouseleave', startAutoAdvance);
})();

// Notification Dropdown Functions
function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    const settingsDropdown = document.getElementById('settingsDropdown');
    
    if (dropdown) {
        // Close settings dropdown if open
        if (settingsDropdown) {
            settingsDropdown.classList.remove('show');
        }
        
        dropdown.classList.toggle('show');
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function closeDropdown(event) {
            if (!event.target.closest('.notification-icon')) {
                dropdown.classList.remove('show');
                document.removeEventListener('click', closeDropdown);
            }
        });
    }
}

// Settings Dropdown Functions
function toggleSettingsDropdown() {
    const dropdown = document.getElementById('settingsDropdown');
    const notificationDropdown = document.getElementById('notificationDropdown');
    
    if (dropdown) {
        // Close notification dropdown if open
        if (notificationDropdown) {
            notificationDropdown.classList.remove('show');
        }
        
        dropdown.classList.toggle('show');
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function closeDropdown(event) {
            if (!event.target.closest('.settings-icon')) {
                dropdown.classList.remove('show');
                document.removeEventListener('click', closeDropdown);
            }
        });
    }
}

function logout() {
    // Close dropdown
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Show SweetAlert confirmation
    Swal.fire({
        title: 'Logout Confirmation',
        text: 'Are you sure you want to logout?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, logout!',
        cancelButtonText: 'Cancel',
        reverseButtons: true,
        customClass: {
            popup: 'swal2-logout-popup'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // Show loading
            Swal.fire({
                title: 'Logging out...',
                text: 'Please wait',
                icon: 'info',
                allowOutsideClick: false,
                showConfirmButton: false,
                timer: 2000
            });
            
            // Call PHP logout endpoint to clear server-side session
            fetch('php/logout.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin' // Include cookies for session
            })
            .then(response => response.json())
            .then(data => {
                // Clear user session data (client-side)
                sessionStorage.removeItem('user_email');
                localStorage.removeItem('user_email');
                sessionStorage.removeItem('user_data');
                localStorage.removeItem('user_data');
                sessionStorage.removeItem('reporter_name');
                localStorage.removeItem('reporter_name');
                sessionStorage.removeItem('loginEmail');
                sessionStorage.removeItem('resident_data');
                sessionStorage.removeItem('user_contact_phone_digits');
                
                // Redirect to login page with logout parameter to clear PHP session
                window.location.href = 'index.php?logout=true';
            })
            .catch(error => {
                console.error('Logout error:', error);
                // Even if logout endpoint fails, clear client-side data and redirect
                sessionStorage.removeItem('user_email');
                localStorage.removeItem('user_email');
                sessionStorage.removeItem('user_data');
                localStorage.removeItem('user_data');
                sessionStorage.removeItem('reporter_name');
                localStorage.removeItem('reporter_name');
                sessionStorage.removeItem('loginEmail');
                sessionStorage.removeItem('resident_data');
                sessionStorage.removeItem('user_contact_phone_digits');
                
                // Redirect to login page with logout parameter to clear PHP session
                window.location.href = 'index.php?logout=true';
            });
        }
    });
}

// Note: All CSS styles have been moved to main_UI.css file for better organization

// Edit Profile Modal Functions
function editProfile() {
    console.log('Opening edit profile modal');
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('show');
    
    // Show modal first
    const modal = document.getElementById('editProfileModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    
    // Load user data into form after modal is visible (small delay to ensure DOM is ready)
    setTimeout(() => {
        loadUserDataForEditProfile();
    }, 100);
}

// Load user data for edit profile form
async function loadUserDataForEditProfile() {
    try {
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        
        if (!userEmail) {
            console.warn('No user email found');
            return;
        }
        
        // Fetch user data from server
        const response = await fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail })
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            // Keep currentUser in sync for UI actions (e.g., remove profile picture)
            currentUser = user;
            removeProfilePicPending = false;
            
            // Check if elements exist before trying to set values
            const firstNameEl = document.getElementById('firstName');
            const middleNameEl = document.getElementById('middleName');
            const lastNameEl = document.getElementById('lastName');
            const suffixEl = document.getElementById('suffix');
            const userEmailEl = document.getElementById('userEmail');
            const validIdTypeEl = document.getElementById('validIdType');
            const ageEl = document.getElementById('age');
            const sexEl = document.getElementById('sex');
            const birthdayEl = document.getElementById('birthday');
            const civilStatusEl = document.getElementById('civilStatus');
            const userAddressEl = document.getElementById('userAddress');
            
            if (firstNameEl) firstNameEl.value = user.first_name || '';
            if (middleNameEl) middleNameEl.value = user.middle_name || '';
            if (lastNameEl) lastNameEl.value = user.last_name || '';
            if (suffixEl) suffixEl.value = user.suffix || '';
            if (userEmailEl) userEmailEl.value = user.email || '';
            if (validIdTypeEl) validIdTypeEl.value = user.valid_id || '';
            if (ageEl) {
                // Recalculate age from birthday so it stays correct over years
                const computedAge = calculateAgeFromBirthday(user.birthday);
                ageEl.value = computedAge !== '' ? computedAge : (user.age || '');
            }
            if (sexEl) sexEl.value = user.sex || '';
            if (birthdayEl) birthdayEl.value = user.birthday || '';
            if (civilStatusEl) {
                const rawCv = (user.civil_status || '').trim();
                if (rawCv) {
                    const civilMap = { single: 'Single', married: 'Married', widowed: 'Widowed', widow: 'Widowed' };
                    const key = rawCv.toLowerCase();
                    civilStatusEl.value = civilMap[key] || rawCv;
                } else {
                    civilStatusEl.value = 'Single';
                }
            }
            if (userAddressEl) userAddressEl.value = user.address || '';

            // Render uploaded valid ID image (from create account)
            const validIdGroup = document.getElementById('validIdGroup');
            const validIdImage = document.getElementById('validIdImage');
            const validIdPlaceholder = document.getElementById('validIdPlaceholder');
            if (validIdGroup && validIdImage && validIdPlaceholder) {
                validIdGroup.style.display = 'block';
                if (user.id_image) {
                    validIdImage.src = 'data:image/jpeg;base64,' + user.id_image;
                    validIdImage.style.display = 'block';
                    validIdPlaceholder.style.display = 'none';
                } else {
                    validIdImage.removeAttribute('src');
                    validIdImage.style.display = 'none';
                    validIdPlaceholder.style.display = 'flex';
                }
            }
            
            // View mode: email & civil status locked until user taps Edit
            disableInputs();
            setProfileEditBaselineFromForm();
            lockProfileDetails();
            
            // Load profile picture from database with initials fallback
            const profilePreview = document.getElementById('profilePreview');
            const profilePlaceholder = document.getElementById('profilePlaceholder');
            const initialsModal = document.querySelector('.profile-initials-modal');
            
            if (profilePreview && profilePlaceholder) {
                // First check if there's a profile_pic from database
                if (user.profile_pic) {
                    profilePreview.src = 'data:image/jpeg;base64,' + user.profile_pic;
                    profilePreview.style.display = 'block';
                    profilePlaceholder.style.display = 'none';
                    if (initialsModal) initialsModal.style.display = 'none';
                } else {
                    profilePreview.style.display = 'none';
                    profilePlaceholder.style.display = 'flex';
                    
                    // Show initials if available (just first letter of first name)
                    const initial = getInitials(user.first_name || '', '', true); // first name only
                    if (initial && initialsModal) {
                        initialsModal.textContent = initial;
                        initialsModal.style.display = 'flex';
                        // Hide the icon
                        const icon = profilePlaceholder.querySelector('i');
                        if (icon) icon.style.display = 'none';
                    } else {
                        // Show icon
                        if (initialsModal) initialsModal.style.display = 'none';
                        const icon = profilePlaceholder.querySelector('i');
                        if (icon) icon.style.display = 'block';
                    }
                }
            }

            updateRemoveProfilePicButtonVisibility();
            updateProfilePhotoControlsVisibility();
            
            console.log('User data loaded successfully');
        } else {
            console.error('Failed to load user data:', data.message);
        }
    } catch (error) {
        console.error('Error loading user data for edit profile:', error);
    }
}

function closeEditProfileModal() {
    console.log('Closing edit profile modal');
    
    const modal = document.getElementById('editProfileModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto'; // Restore scrolling
    
    // Reset to view mode
    exitEditMode();
    
    // Reset form
    const form = document.getElementById('editProfileForm');
    if (form) form.reset();
    
    clearProfileSaveFooterMessage();
    profileEditBaseline = null;
    
    // Clear any error messages
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }
}

// Exit view-only state (profile fields stay readonly; only profile photo can be updated)
function exitEditMode() {
    const modal = document.getElementById('editProfileModal');
    const header = modal?.querySelector('.modal-header h3');
    if (header) header.textContent = 'View Profile';

    disableInputs();
    lockProfileDetails();
    updateRemoveProfilePicButtonVisibility();
    updateProfilePhotoControlsVisibility();
}

// Disable inputs (view mode). Email and civil status stay editable for Save Changes.
function disableInputs() {
    const inputs = ['firstName', 'middleName', 'lastName', 'suffix', 'age', 'birthday', 'userAddress'];
    const selects = ['sex'];
    
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.setAttribute('readonly', 'readonly');
            input.required = false;
            // Ensure textarea is also properly styled
            if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                input.classList.add('readonly-field');
            }
        }
    });
    
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.disabled = true;
            select.required = false;
        }
    });
}

function normalizeEmail(value) {
    return (value || '').trim().toLowerCase();
}

function clearProfileSaveFooterMessage() {
    const el = document.getElementById('profileNoChangesLabel');
    if (el) el.style.display = 'none';
}

function showProfileNoChangesLabel() {
    const el = document.getElementById('profileNoChangesLabel');
    if (el) {
        el.textContent = 'no changes to save';
        el.style.display = 'block';
    }
}

function wireProfileEditableFieldsOnce() {
    const email = document.getElementById('userEmail');
    const civil = document.getElementById('civilStatus');
    if (email && !email.dataset.profileWire) {
        email.dataset.profileWire = '1';
        email.removeAttribute('readonly');
        email.classList.remove('readonly-field');
        email.addEventListener('input', clearProfileSaveFooterMessage);
        email.addEventListener('change', clearProfileSaveFooterMessage);
    }
    if (civil && !civil.dataset.profileWire) {
        civil.dataset.profileWire = '1';
        civil.disabled = false;
        civil.addEventListener('change', clearProfileSaveFooterMessage);
    }
}

function setProfileEditBaselineFromForm() {
    const emailEl = document.getElementById('userEmail');
    const civilEl = document.getElementById('civilStatus');
    profileEditBaseline = {
        email: normalizeEmail(emailEl?.value || ''),
        displayEmail: emailEl?.value || '',
        civilStatus: (civilEl?.value || '').trim()
    };
    clearProfileSaveFooterMessage();
}

function lockProfileDetails() {
    const email = document.getElementById('userEmail');
    const civil = document.getElementById('civilStatus');
    const fileInput = document.getElementById('profilePicture');
    if (email) {
        email.setAttribute('readonly', 'readonly');
        email.classList.add('readonly-field');
    }
    if (civil) civil.disabled = true;
    if (fileInput) fileInput.disabled = true;
    profileDetailsUnlocked = false;
    const editBtn = document.getElementById('profileEditDetailsBtn');
    const footerActions = document.getElementById('profileFormFooterActions');
    if (editBtn) editBtn.style.display = '';
    if (footerActions) {
        footerActions.style.display = 'none';
        footerActions.setAttribute('aria-hidden', 'true');
    }
    updateProfilePhotoControlsVisibility();
    updateRemoveProfilePicButtonVisibility();
}

function unlockProfileDetailsForEdit() {
    const email = document.getElementById('userEmail');
    const civil = document.getElementById('civilStatus');
    const fileInput = document.getElementById('profilePicture');
    if (email) {
        email.removeAttribute('readonly');
        email.classList.remove('readonly-field');
    }
    if (civil) civil.disabled = false;
    if (fileInput) fileInput.disabled = false;
    profileDetailsUnlocked = true;
    const editBtn = document.getElementById('profileEditDetailsBtn');
    const footerActions = document.getElementById('profileFormFooterActions');
    if (editBtn) editBtn.style.display = 'none';
    if (footerActions) {
        footerActions.style.display = 'flex';
        footerActions.setAttribute('aria-hidden', 'false');
    }
    wireProfileEditableFieldsOnce();
    clearProfileSaveFooterMessage();
    updateProfilePhotoControlsVisibility();
    updateRemoveProfilePicButtonVisibility();
}

function cancelProfileDetailsEdit() {
    if (pendingProfileSaveFormData || pendingProfileNewEmail) {
        cancelEmailChangeVerification();
    }
    if (profileEditBaseline) {
        const email = document.getElementById('userEmail');
        const civil = document.getElementById('civilStatus');
        if (email && profileEditBaseline.displayEmail !== undefined) {
            email.value = profileEditBaseline.displayEmail;
        }
        if (civil && profileEditBaseline.civilStatus !== undefined) {
            civil.value = profileEditBaseline.civilStatus;
        }
    }
    lockProfileDetails();
    clearProfileSaveFooterMessage();
}

window.unlockProfileDetailsForEdit = unlockProfileDetailsForEdit;
window.cancelProfileDetailsEdit = cancelProfileDetailsEdit;

function calculateAgeFromBirthday(birthdayStr) {
    if (!birthdayStr) return '';
    const birthDate = new Date(birthdayStr);
    if (Number.isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age >= 0 ? age : '';
}

function openEmailChangeModal() {
    clearProfileSaveFooterMessage();
    const modal = document.getElementById('emailChangeModal');
    if (!modal) return;
    const codeInput = document.getElementById('emailChangeCode');
    if (codeInput) codeInput.value = '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => codeInput && codeInput.focus(), 100);
}

function closeEmailChangeModal() {
    const modal = document.getElementById('emailChangeModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = 'hidden'; // keep edit profile modal state
}

function cancelEmailChangeVerification() {
    pendingProfileSaveFormData = null;
    pendingProfileNewEmail = null;
    closeEmailChangeModal();
    const saveBtn = document.getElementById('profileSaveChangesBtn') || document.querySelector('#editProfileForm .save-btn');
    if (saveBtn) {
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
    }
}

async function submitEmailChangeCode() {
    const oldEmail = normalizeEmail(sessionStorage.getItem('user_email') || localStorage.getItem('user_email'));
    const newEmail = normalizeEmail(pendingProfileNewEmail);
    const code = (document.getElementById('emailChangeCode')?.value || '').trim();

    if (!/^\d{6}$/.test(code)) {
        return Swal?.fire?.({ icon: 'error', title: 'Invalid code', text: 'Please enter the 6-digit code.' });
    }

    try {
        const res = await fetch('php/verify_email_change_otp.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldEmail, newEmail, code })
        });
        const data = await res.json();
        if (!data.success) {
            return Swal?.fire?.({ icon: 'error', title: 'Verification failed', text: data.message || 'Invalid code.' });
        }

        // Update stored login email
        sessionStorage.setItem('user_email', newEmail);
        localStorage.setItem('user_email', newEmail);
        if (currentUser) currentUser.email = newEmail;

        closeEmailChangeModal();

        if (pendingProfileSaveFormData) {
            pendingProfileSaveFormData.set('email', newEmail);
            const tmp = pendingProfileSaveFormData;
            pendingProfileSaveFormData = null;
            pendingProfileNewEmail = null;
            await performProfileSave(tmp);
        }
    } catch (e) {
        console.error('Email change verification error:', e);
        return Swal?.fire?.({ icon: 'error', title: 'Network error', text: 'Please try again.' });
    }
}

window.closeEmailChangeModal = closeEmailChangeModal;
window.cancelEmailChangeVerification = cancelEmailChangeVerification;
window.submitEmailChangeCode = submitEmailChangeCode;

function previewProfileImage(input) {
    if (!profileDetailsUnlocked) return;
    if (input.files && input.files[0]) {
        const reader = new FileReader();

        reader.onload = function (e) {
            const profilePreview = document.getElementById('profilePreview');
            const profilePlaceholder = document.getElementById('profilePlaceholder');
            const initialsModal = document.querySelector('.profile-initials-modal');

            profilePreview.src = e.target.result;
            profilePreview.style.display = 'block';
            profilePlaceholder.style.display = 'none';
            if (initialsModal) initialsModal.style.display = 'none';

            removeProfilePicPending = false;
            updateRemoveProfilePicButtonVisibility(true);

            saveProfileChanges();
        };

        reader.readAsDataURL(input.files[0]);
    }
}

function updateRemoveProfilePicButtonVisibility(forceShow = false) {
    const btn = document.getElementById('removeProfilePicBtn');
    const profilePreview = document.getElementById('profilePreview');
    if (!btn || !profilePreview) return;

    if (!profileDetailsUnlocked) {
        btn.style.display = 'none';
        return;
    }
    if (forceShow) {
        btn.style.display = 'flex';
        return;
    }
    const hasPhoto =
        profilePreview.style.display !== 'none' &&
        profilePreview.getAttribute('src') &&
        profilePreview.getAttribute('src').trim() !== '';
    btn.style.display = hasPhoto ? 'flex' : 'none';
}

function updateProfilePhotoControlsVisibility() {
    const controls = document.querySelector('.profile-picture-group .upload-controls');
    if (!controls) return;
    controls.style.display = profileDetailsUnlocked ? 'flex' : 'none';
}

async function removeProfilePicture() {
    if (!profileDetailsUnlocked) return;
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) return;

    // Removal is staged; actual delete happens on "Save profile photo"
    removeProfilePicPending = true;

    const profilePreview = document.getElementById('profilePreview');
    const profilePlaceholder = document.getElementById('profilePlaceholder');
    const initialsModal = document.querySelector('.profile-initials-modal');
    const fileInput = document.getElementById('profilePicture');

    if (profilePreview) {
        profilePreview.removeAttribute('src');
        profilePreview.style.display = 'none';
    }
    if (fileInput) {
        fileInput.value = '';
    }
    if (profilePlaceholder) {
        profilePlaceholder.style.display = 'flex';
        const initial = getInitials(currentUser?.first_name || '', '', true);
        if (initial && initialsModal) {
            initialsModal.textContent = initial;
            initialsModal.style.display = 'flex';
            const icon = profilePlaceholder.querySelector('i');
            if (icon) icon.style.display = 'none';
        } else {
            if (initialsModal) initialsModal.style.display = 'none';
            const icon = profilePlaceholder.querySelector('i');
            if (icon) icon.style.display = 'block';
        }
    }

    updateRemoveProfilePicButtonVisibility();

    saveProfileChanges();
}

// Make removeProfilePicture available for inline HTML onclick
window.removeProfilePicture = removeProfilePicture;

async function saveProfileChanges() {
    console.log('Saving profile changes');
    
    const form = document.getElementById('editProfileForm');
    const saveBtn = document.getElementById('profileSaveChangesBtn') || document.querySelector('#editProfileForm .save-btn');
    
    clearProfileSaveFooterMessage();
    
    // Save button with nothing to persist (email, civil status, photo remove/upload)
    if (profileEditBaseline) {
        const curEmail = normalizeEmail(document.getElementById('userEmail')?.value);
        const curCivil = (document.getElementById('civilStatus')?.value || '').trim();
        const hasNewFile = (document.getElementById('profilePicture')?.files?.length || 0) > 0;
        if (
            curEmail === profileEditBaseline.email &&
            curCivil === profileEditBaseline.civilStatus &&
            !hasNewFile &&
            !removeProfilePicPending
        ) {
            showProfileNoChangesLabel();
            return;
        }
    }
    
    const formData = new FormData(form);
    // Disabled <select> fields (sex) are not included in FormData — server requires them
    const sexEl = document.getElementById('sex');
    const civilEl = document.getElementById('civilStatus');
    if (sexEl) formData.set('sex', sexEl.value);
    if (civilEl) formData.set('civilStatus', civilEl.value);

    // Show button loading immediately; full-screen loading will be shown only on final save
    if (saveBtn) {
        saveBtn.classList.add('loading');
        saveBtn.disabled = true;
    }
    
    // Clear any existing messages
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Validate required fields
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const birthdayVal = document.getElementById('birthday').value;
    const ageInput = document.getElementById('age');
    const recomputedAge = calculateAgeFromBirthday(birthdayVal);
    if (ageInput) {
        ageInput.value = recomputedAge !== '' ? recomputedAge : ageInput.value;
    }
    const age = (ageInput && ageInput.value) || '';
    const sex = document.getElementById('sex').value;
    const birthday = birthdayVal;
    const civilStatus = document.getElementById('civilStatus').value;
    const address = document.getElementById('userAddress').value.trim();
    
    // Optional fields don't need validation
    if (!firstName || !lastName || !age || !sex || !birthday || !civilStatus || !address) {
        showFormMessage('Please fill in all required fields.', 'error');
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
        }
        return;
    }
    
    try {
        const storedEmail = normalizeEmail(sessionStorage.getItem('user_email') || localStorage.getItem('user_email'));
        const enteredEmail = normalizeEmail(document.getElementById('userEmail')?.value);

        if (!storedEmail) {
            showFormMessage('No user session found. Please login again.', 'error');
            if (saveBtn) {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
            }
            return;
        }

        if (!enteredEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredEmail)) {
            showFormMessage('Please enter a valid email address.', 'error');
            if (saveBtn) {
                saveBtn.classList.remove('loading');
                saveBtn.disabled = false;
            }
            return;
        }

        // Add email for backend lookup (may be replaced after verification)
        formData.set('email', storedEmail);
        
        // Handle profile picture if changed
        const profilePicture = document.getElementById('profilePicture').files[0];
        if (profilePicture) {
            formData.append('profilePicture', profilePicture);
            // New upload cancels pending removal
            removeProfilePicPending = false;
        } else if (removeProfilePicPending) {
            // Tell backend to NULL profile_pic on save
            formData.append('removeProfilePic', '1');
        }
        
        // If email changed, send OTP first and wait for verification
        if (enteredEmail !== storedEmail) {
            let otpData = null;
            let otpTimeoutId = null;
            try {
                if (typeof showFullScreenLoading === 'function') {
                    showFullScreenLoading('Sending the OTP code to your new email...');
                }
                const otpController = new AbortController();
                const otpTimeoutMs = 15000;
                otpTimeoutId = setTimeout(() => otpController.abort(), otpTimeoutMs);
                const otpRes = await fetch('php/send_email_change_otp.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ oldEmail: storedEmail, newEmail: enteredEmail }),
                    signal: otpController.signal
                });
                clearTimeout(otpTimeoutId);
                otpData = await otpRes.json();
            } catch (otpError) {
                const timeoutMsg = otpError?.name === 'AbortError'
                    ? 'OTP request timed out. Check SMTP/sendmail settings, then try again.'
                    : 'Failed to send verification code. Please try again.';
                showFormMessage(timeoutMsg, 'error');
                if (saveBtn) {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
                if (typeof hideFullScreenLoading === 'function') {
                    hideFullScreenLoading();
                }
                return;
            } finally {
                if (otpTimeoutId) {
                    clearTimeout(otpTimeoutId);
                }
            }
            if (!otpData.success) {
                showFormMessage(otpData.message || 'Failed to send verification code.', 'error');
                if (saveBtn) {
                    saveBtn.classList.remove('loading');
                    saveBtn.disabled = false;
                }
                if (typeof hideFullScreenLoading === 'function') {
                    hideFullScreenLoading();
                }
                return;
            }

            pendingProfileSaveFormData = formData;
            pendingProfileNewEmail = enteredEmail;
            if (typeof hideFullScreenLoading === 'function') {
                hideFullScreenLoading();
            }
            if (typeof Swal !== 'undefined') {
                if (otpData.email_sent === false) {
                    await Swal.fire({
                        icon: 'warning',
                        title: 'OTP Generated',
                        text: `OTP was created for ${enteredEmail}, but email delivery failed. Please check server SMTP/sendmail settings.`,
                        confirmButtonText: 'Continue',
                        confirmButtonColor: '#2563eb'
                    });
                } else {
                    await Swal.fire({
                        icon: 'success',
                        iconHtml: '<i class="fas fa-check"></i>',
                        customClass: {
                            icon: 'swal2-icon--static-check'
                        },
                        title: 'OTP Sent',
                        text: `A 6-digit verification code was sent to ${enteredEmail}.`,
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#2563eb'
                    });
                }
            }
            openEmailChangeModal();
            // Stop loading while user enters code
            if (saveBtn) {
                saveBtn.classList.remove('loading');
            }
            return;
        }

        await performProfileSave(formData);
    } catch (error) {
        console.error('Error saving profile:', error);
        showFormMessage('Error updating profile. Please try again.', 'error');
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
        }
        if (typeof hideFullScreenLoading === 'function') {
            hideFullScreenLoading();
        }
    }
}

async function performProfileSave(formData) {
    const saveBtn = document.getElementById('profileSaveChangesBtn') || document.querySelector('#editProfileForm .save-btn');
    try {
        if (typeof showFullScreenLoading === 'function') {
            showFullScreenLoading('Saving profile...');
        }
        if (saveBtn) {
            saveBtn.classList.add('loading');
            saveBtn.disabled = true;
        }
        // Send to PHP endpoint for saving
        const response = await fetch('php/update_profile.php', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const firstName = document.getElementById('firstName').value.trim();
            const userEmail = normalizeEmail(sessionStorage.getItem('user_email') || localStorage.getItem('user_email'));

            // Update local storage
            sessionStorage.setItem('user_name', firstName);
            localStorage.setItem('user_name', firstName);
            
            // Update the main UI with new name
            updateUserGreeting(userEmail);
            
            // Update profile picture in header if changed or removed
            const profilePreview = document.getElementById('profilePreview');
            const headerProfileImg = document.querySelector('.profile-picture img');
            if (headerProfileImg) {
                if (profilePreview && profilePreview.src && profilePreview.style.display !== 'none') {
                    headerProfileImg.src = profilePreview.src;
                } else if (removeProfilePicPending) {
                    // If removed, force re-render to initials
                    if (currentUser) currentUser.profile_pic = null;
                    renderHeaderProfilePicture(currentUser || {});
                }
            }

            // Clear pending removal after successful save
            removeProfilePicPending = false;
            updateRemoveProfilePicButtonVisibility();
            
            const msg = (data.message || '').toLowerCase();
            const noChanges =
                msg.includes('no changes') ||
                msg.includes('no change') ||
                msg.includes('no changes detected');

            if (noChanges) {
                showProfileNoChangesLabel();
            } else if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Updated successfully',
                    text: 'Your profile has been updated.',
                    confirmButtonColor: '#17a2b8',
                    timer: 3500,
                    timerProgressBar: true
                });
            } else {
                showFormMessage('Updated successfully', 'success');
            }
            
            setTimeout(() => {
                exitEditMode();
                loadUserDataForEditProfile();
                const modalBody = document.querySelector('#editProfileModal .modal-body');
                if (modalBody) modalBody.scrollTop = 0;
            }, noChanges ? 0 : 500);
            
        } else {
            showFormMessage(data.message || 'Error updating profile. Please try again.', 'error');
        }
    } finally {
        if (saveBtn) {
            saveBtn.classList.remove('loading');
            saveBtn.disabled = false;
        }
        if (typeof hideFullScreenLoading === 'function') {
            hideFullScreenLoading();
        }
    }
}

function showFormMessage(message, type) {
    const modalBody = document.querySelector('.modal-body');
    const messageDiv = document.createElement('div');
    messageDiv.className = `form-message ${type}`;
    messageDiv.textContent = message;
    
    // Insert message at the top of modal body
    modalBody.insertBefore(messageDiv, modalBody.firstChild);
    
    // Auto-remove success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 3000);
    }
}

// Enhanced updateUserGreeting function
function updateUserGreeting(userEmail) {
    const userName = sessionStorage.getItem('user_name') || localStorage.getItem('user_name') || 'Bigteño';
    
    // Update greeting in header
    const greetingElement = document.querySelector('.user-info h2');
    if (greetingElement) {
        greetingElement.textContent = `Hi, ${userName}!`;
    }
    
    // Update greeting in banner - always show "Bigteño"
    const bannerGreeting = document.querySelector('.banner-text h1');
    if (bannerGreeting) {
        bannerGreeting.textContent = `Welcome, Bigteño!`;
    }
    
    console.log(`Updated greeting for user: ${userName}`);
}

// Setup edit profile event listeners
function setupEditProfileEventListeners() {
    // Auto-update age when birthday changes in Edit Profile
    const birthdayInput = document.getElementById('birthday');
    const ageInput = document.getElementById('age');
    if (birthdayInput && ageInput) {
        const updateAge = () => {
            const computed = calculateAgeFromBirthday(birthdayInput.value);
            ageInput.value = computed !== '' ? computed : '';
        };
        birthdayInput.addEventListener('change', updateAge);
        birthdayInput.addEventListener('input', updateAge);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEditProfileModal();
            }
        });
    }
    
    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('editProfileModal');
            if (modal && modal.classList.contains('active')) {
                closeEditProfileModal();
            }
        }
    });
}

// ==================== CENSUS FORM FUNCTIONS ====================

function computeCensusAgeFromBirthday(isoDateString) {
    if (!isoDateString) return '';
    const today = new Date();
    const birth = new Date(isoDateString);
    if (Number.isNaN(birth.getTime())) return '';
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age >= 0 ? String(age) : '';
}

function syncCensusHeadAgeFromBirthday() {
    const birthdayEl = document.getElementById('censusBirthday');
    const ageEl = document.getElementById('censusAge');
    if (!birthdayEl || !ageEl) return;
    ageEl.value = computeCensusAgeFromBirthday(birthdayEl.value);
}

function wireMemberBirthdayToAge(memberIndex) {
    const birthdayEl = document.getElementById(`memberBirthday_${memberIndex}`);
    const ageEl = document.getElementById(`memberAge_${memberIndex}`);
    if (!birthdayEl || !ageEl) return;
    const sync = () => {
        ageEl.value = computeCensusAgeFromBirthday(birthdayEl.value);
    };
    birthdayEl.addEventListener('change', sync);
    birthdayEl.addEventListener('input', sync);
    sync();
}

/** Show or hide "Censused" under the header profile name (see #profileCensusBadge). */
function setProfileCensusedLabel(show) {
    const el = document.getElementById('profileCensusBadge');
    if (!el) return;
    if (show) {
        el.removeAttribute('hidden');
        el.setAttribute('aria-hidden', 'false');
    } else {
        el.setAttribute('hidden', '');
        el.setAttribute('aria-hidden', 'true');
    }
}

function setDocumentsServiceDisabled(disabled) {
    const tile = document.querySelector('.service-item[data-service="documents"]');
    if (!tile) return;
    tile.classList.toggle('service-item-disabled', !!disabled);
    tile.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

// Check if user has completed census
async function checkCensusStatus() {
    // First check if user is actually loaded and exists in database
    if (!currentUser) {
        console.log('No valid user found, blocking census form');
        setProfileCensusedLabel(false);
        return;
    }
    
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) {
        console.log('No user email found, skipping census check');
        setProfileCensusedLabel(false);
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const forceOpenCensus = urlParams.get('openCensus') === '1';
    if (forceOpenCensus) {
        localStorage.removeItem('census_remind_later');
    }

    let data;
    try {
        const response = await fetch(`php/check_census.php?t=${Date.now()}`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        data = await response.json();
        console.log('Census check response:', data);
    } catch (error) {
        setProfileCensusedLabel(false);
        const email = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        if (email) {
            console.log('Error checking census status, showing census form');
            showCensusModal();
        } else {
            console.log('Error checking census status and no user logged in, blocking census form');
        }
        return;
    }

    const isArchivedCensus = !!(data.success && data.emailExists === true && data.isArchived === true);
    const censused =
        !!(data.success && data.emailExists === true && data.hasCompletedCensus);
    setProfileCensusedLabel(censused);
    setDocumentsServiceDisabled(isArchivedCensus);

    // "Remind me later" skips the modal only if census is not done yet
    const remindLaterTime = localStorage.getItem('census_remind_later');
    if (remindLaterTime && !forceOpenCensus) {
        const remindTime = parseInt(remindLaterTime, 10);
        const now = Date.now();
        const minutesPassed = (now - remindTime) / (1000 * 60);

        if (minutesPassed < CENSUS_REMIND_LATER_MINUTES) {
            if (censused) {
                localStorage.removeItem('census_remind_later');
                localStorage.removeItem(LS_CENSUS_REOPEN_SHORTCUT);
                hideCensusReopenButton();
            } else {
                const remainingMs = (CENSUS_REMIND_LATER_MINUTES - minutesPassed) * 60 * 1000;
                console.log(`User asked to be reminded later, skipping census modal for ${CENSUS_REMIND_LATER_MINUTES} minutes`);
                localStorage.setItem(LS_CENSUS_REOPEN_SHORTCUT, '1');
                scheduleCensusReminder(remainingMs);
                showCensusReopenButton();
                return;
            }
        } else {
            localStorage.removeItem('census_remind_later');
        }
    }

    // Note: isAlreadyCensused (last name + address match to another household row) must NOT
    // skip the census modal when hasCompletedCensus is false — document requests still require
    // a matching census_form row for this account or name+address validation.

    if (data.success && currentUser) {
        if (data.emailExists === false) {
            console.log('Email not found in resident_information table - showing census form');
            showCensusModal();
        } else if (data.emailExists === true && !data.hasCompletedCensus) {
            console.log('Email exists but census not completed - showing census form');
            showCensusModal();
        } else if (data.emailExists === true && data.hasCompletedCensus) {
            localStorage.removeItem(LS_CENSUS_REOPEN_SHORTCUT);
            hideCensusReopenButton();
            console.log('Census already completed - not showing modal');
        }
    } else {
        if (data.message && data.message.includes('User not found')) {
            console.log('User not found, blocking census form');
            return;
        }
        const email = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        if (email) {
            console.log('Unclear response or error - showing census form');
            showCensusModal();
        }
    }
}

// Show census modal
function showCensusModal() {
    // Check if user is actually loaded and exists in database before showing modal
    if (!currentUser) {
        console.log('No valid user found, blocking census form');
        return;
    }
    
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) {
        console.log('No user email found, blocking census form');
        return;
    }
    
    console.log('🎯 showCensusModal() called');
    const modal = document.getElementById('censusModal');
    if (modal) {
        console.log('✅ Census modal element found, showing...');
        clearCensusReminderTimer();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        console.log('✅ Modal class "active" added');
        
        // Scroll modal body to top after a small delay to ensure it's rendered
        setTimeout(() => {
            const modalBody = modal.querySelector('.modal-body');
            if (modalBody) {
                modalBody.scrollTop = 0;
                // Also scroll the modal container itself to top
                modal.scrollTop = 0;
            }
        }, 100);
        
        // Auto-populate with user data if available
        autoPopulateCensusForm();
        
        // Setup household head relationship toggle
        setupCensusFormListeners();

        // Show one-time information alert about the census and data security
        showCensusInfoAlertIfNeeded();

        hideCensusReopenButton();
    } else {
        console.error('❌ Census modal element (id="censusModal") not found in DOM!');
        console.error('Make sure the census modal HTML exists in main_UI.html');
    }
}

// Show SweetAlert info about census (once per account)
function showCensusInfoAlertIfNeeded() {
    if (typeof Swal === 'undefined') {
        return;
    }

    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || 'guest';
    const storageKey = `census_info_shown_${userEmail}`;

    // Only show once per account
    if (localStorage.getItem(storageKey) === '1') {
        return;
    }

    const censusModal = document.getElementById('censusModal');
    let previousPointerEvents = '';
    if (censusModal) {
        // Disable interaction with the census modal while the alert is open
        previousPointerEvents = censusModal.style.pointerEvents;
        censusModal.style.pointerEvents = 'none';
    }

    Swal.fire({
        title: 'Barangay Census',
        text: 'This form is for the official Barangay Census. Any information you provide will remain secure and confidential in accordance with our data privacy policy.',
        icon: 'info',
        confirmButtonText: 'OK',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            // Ensure SweetAlert container appears above the census modal
            const container = Swal.getContainer();
            if (container) {
                container.style.zIndex = '9999';
            }
        }
    }).then(() => {
        localStorage.setItem(storageKey, '1');
        // Re-enable interaction with the census modal after the user clicks OK
        if (censusModal) {
            censusModal.style.pointerEvents = previousPointerEvents || '';
        }
    });
}

function closeCensusConsentOverlay() {
    const overlay = document.getElementById('censusConsentOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
    }
    const cb = document.getElementById('censusConsentCheckbox');
    if (cb) cb.checked = false;
    censusSubmitPendingForm = null;
}

function openCensusConsentOverlay() {
    const overlay = document.getElementById('censusConsentOverlay');
    if (!overlay) return;
    const cb = document.getElementById('censusConsentCheckbox');
    if (cb) cb.checked = false;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
}

function bindCensusConsentControls() {
    const cancelBtn = document.getElementById('censusConsentCancelBtn');
    const agreeBtn = document.getElementById('censusConsentAgreeBtn');
    const overlay = document.getElementById('censusConsentOverlay');
    if (cancelBtn && !cancelBtn.dataset.bound) {
        cancelBtn.dataset.bound = '1';
        cancelBtn.addEventListener('click', function () {
            closeCensusConsentOverlay();
        });
    }
    if (agreeBtn && !agreeBtn.dataset.bound) {
        agreeBtn.dataset.bound = '1';
        agreeBtn.addEventListener('click', function () {
            const cb = document.getElementById('censusConsentCheckbox');
            if (!cb || !cb.checked) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Consent required',
                        text: 'Please check the box to confirm you agree to the terms and conditions.',
                        confirmButtonText: 'OK',
                        didOpen: () => {
                            const c = Swal.getContainer();
                            if (c) {
                                c.style.zIndex = '2600';
                            }
                        }
                    });
                } else {
                    alert('Please check the box to confirm you agree to the terms and conditions.');
                }
                return;
            }
            const form = censusSubmitPendingForm;
            closeCensusConsentOverlay();
            if (form) {
                executeCensusSubmission(form);
            }
        });
    }
    if (overlay && !overlay.dataset.backdropBound) {
        overlay.dataset.backdropBound = '1';
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeCensusConsentOverlay();
            }
        });
    }
}

// Close census modal
function closeCensusModal(options) {
    const deferReopenBtn = options && options.deferReopenButton;
    closeCensusConsentOverlay();
    const modal = document.getElementById('censusModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // Reset form
        const form = document.getElementById('censusForm');
        if (form) {
            form.reset();
        }
        requestAnimationFrame(function () {
            if (currentUser) {
                applyCensusContactFromProfile(currentUser);
            }
        });
        
        // Clear household members
        const container = document.getElementById('householdMembersContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        // Reset counter
        householdMemberCounter = 0;

        if (!deferReopenBtn) {
            syncCensusReopenButtonAfterModalClose();
        }
    }
}

// Auto-populate census form with user data (same source as editProfileForm)
async function autoPopulateCensusForm() {
    try {
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        
        if (!userEmail) {
            console.log('No user email found for census form, skipping auto-populate');
            return;
        }
        
        // Fetch user data from server - same endpoint as editProfileForm
        const response = await fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail })
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            const user = data.user;
            
            // Populate census form fields with the same data used in editProfileForm
            const firstNameEl = document.getElementById('censusFirstName');
            const lastNameEl = document.getElementById('censusLastName');
            const middleNameEl = document.getElementById('censusMiddleName');
            const suffixEl = document.getElementById('censusSuffix');
            const ageEl = document.getElementById('censusAge');
            const sexEl = document.getElementById('censusSex');
            const birthdayEl = document.getElementById('censusBirthday');
            const civilStatusEl = document.getElementById('censusCivilStatus');
            const addressEl = document.getElementById('censusAddress');
            
            // Populate name fields - same as editProfileForm
            if (firstNameEl) {
                firstNameEl.value = user.first_name || '';
                console.log('Populated censusFirstName from main_UI.php:', user.first_name);
            }
            if (lastNameEl) {
                lastNameEl.value = user.last_name || '';
                console.log('Populated censusLastName from main_UI.php:', user.last_name);
            }
            if (middleNameEl) {
                middleNameEl.value = user.middle_name || '';
                console.log('Populated censusMiddleName from main_UI.php:', user.middle_name);
            }
            if (suffixEl) {
                suffixEl.value = user.suffix || '';
                console.log('Populated censusSuffix from main_UI.php:', user.suffix);
            }
            
            // Populate other fields (age from birthday when available)
            if (birthdayEl) birthdayEl.value = user.birthday || '';
            if (ageEl) {
                ageEl.value = user.birthday
                    ? computeCensusAgeFromBirthday(user.birthday)
                    : (user.age != null && user.age !== '' ? String(user.age) : '');
            }
            if (sexEl) sexEl.value = user.sex || '';
            if (civilStatusEl) civilStatusEl.value = user.civil_status || '';
            
            // Parse address to extract house number and remaining address
            if (user.address) {
                const addressParts = user.address.split(',').map(part => part.trim());
                
                // Extract house number (first part) and remaining address
                let houseNumber = '';
                let remainingAddress = '';
                
                if (addressParts.length > 0) {
                    // First part is usually the house number
                    houseNumber = addressParts[0];
                    // Remaining parts form the address
                    remainingAddress = addressParts.slice(1).join(', ');
                } else {
                    // If no comma, use the whole address as remaining address
                    remainingAddress = user.address;
                }
                
                // Populate address field (without house number)
                if (addressEl) {
                    addressEl.value = remainingAddress;
                }
                
                // Populate unit/house number field
                const unitHouseNumberEl = document.getElementById('censusUnitHouseNumber');
                if (unitHouseNumberEl && houseNumber) {
                    unitHouseNumberEl.value = houseNumber;
                }
            } else {
                if (addressEl) addressEl.value = '';
            }

            applyCensusContactFromProfile(user);
            
            syncCensusHeadAgeFromBirthday();
            syncCensusHeadPlaceOfWorkState();
            syncCensusHeadDisabilityOtherVisibility();
            syncCensusHeadBenefitsOtherVisibility();

            console.log('Census form populated successfully with data from main_UI.php');
        } else {
            // User not found - silently return without logging error
            // This prevents console errors when user is not logged in
            console.log('User data not available for census form auto-populate');
        }
    } catch (error) {
        // Silently handle errors to prevent console spam when user is not logged in
        console.log('Could not load user data for census form');
    }
}

/** Census / household text fields: uppercase first letter of each word while typing (same as create account). */
function capitalizeLeadingLettersCensus(value) {
    return value.replace(/(^|[\s\-'])(\p{Ll})/gu, (_, sep, ll) => sep + ll.toUpperCase());
}

function attachAutoCapitalizeCensus(el) {
    if (!el || el.dataset.autoCapitalizeBound === '1') return;
    el.dataset.autoCapitalizeBound = '1';
    el.addEventListener('input', function censusAutoCapInput() {
        const before = el.value;
        const after = capitalizeLeadingLettersCensus(before);
        if (after === before) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = after;
        const lenDiff = after.length - before.length;
        if (start != null && end != null) {
            try {
                el.setSelectionRange(start + lenDiff, end + lenDiff);
            } catch (_) {}
        }
    });
}

function bindCensusHeadAutoCapitalize() {
    [
        'censusFirstName',
        'censusLastName',
        'censusMiddleName',
        'censusDisabilityOther',
        'censusOccupationOther',
        'censusPlaceOfWork',
        'censusBenefitsOther'
    ].forEach((id) => attachAutoCapitalizeCensus(document.getElementById(id)));
}

function bindHouseholdMemberCardAutoCapitalize(memberCard) {
    if (!memberCard) return;
    memberCard.querySelectorAll('input[type="text"], textarea').forEach((field) => attachAutoCapitalizeCensus(field));
}

// Setup census form event listeners
function setupCensusFormListeners() {
    const censusForm = document.getElementById('censusForm');
    if (censusForm) {
        if (!censusForm.dataset.censusSubmitBound) {
            censusForm.dataset.censusSubmitBound = '1';
            censusForm.addEventListener('submit', handleCensusSubmission);
        }
        if (!censusForm.dataset.censusBirthdaySyncBound) {
            censusForm.dataset.censusBirthdaySyncBound = '1';
            const birthdayEl = document.getElementById('censusBirthday');
            if (birthdayEl) {
                birthdayEl.addEventListener('change', syncCensusHeadAgeFromBirthday);
                birthdayEl.addEventListener('input', syncCensusHeadAgeFromBirthday);
            }
        }
        if (!censusForm.dataset.censusOccupResetBound) {
            censusForm.dataset.censusOccupResetBound = '1';
            censusForm.addEventListener('reset', function () {
                requestAnimationFrame(function () {
                    syncCensusHeadOccupationOtherVisibility();
                    syncCensusHeadPlaceOfWorkState();
                    syncCensusHeadDisabilityOtherVisibility();
                    syncCensusHeadBenefitsOtherVisibility();
                    resetCensusIndigenousHeadControls();
                    document.querySelectorAll('.household-member-card').forEach(function (card) {
                        const idx = card.dataset.memberIndex;
                        if (idx) syncMemberPlaceOfWorkState(idx);
                    });
                });
            });
        }
        bindCensusHeadAutoCapitalize();
        bindCensusContactPhoneField();
        bindCensusOccupationHeadControls();
        bindCensusDisabilityHeadControls();
        bindCensusBenefitsHeadControls();
        bindCensusIndigenousHeadControls();
        syncCensusHeadAgeFromBirthday();
    }

    bindCensusConsentControls();

    // Initialize with at least one household member field
    const container = document.getElementById('householdMembersContainer');
    if (container && container.children.length === 0) {
        addHouseholdMember();
    }
}

// Counter for household members
let householdMemberCounter = 0;

/** "Employed" shows job details; saved to census_form.occupation as `Employed - [type of work]`. */
const CENSUS_OCCUPATION_EMPLOYED = 'Employed';

/** Shared <option> HTML: Step 1 personal info + household member cards (single source). */
const CENSUS_SUFFIX_OPTIONS_HTML = `
                                        <option value="">None</option>
                                        <option value="Jr.">Jr.</option>
                                        <option value="Sr.">Sr.</option>
                                        <option value="II">II</option>
                                        <option value="III">III</option>
                                        <option value="IV">IV</option>
                                        <option value="V">V</option>`;

const CENSUS_FAMILY_OCCUPATION_OPTIONS_HTML = `
                                        <option value="">Select family occupation</option>
                                        <option value="Mother">Mother</option>
                                        <option value="Father">Father</option>
                                        <option value="Son">Son</option>
                                        <option value="Daughter">Daughter</option>
                                        <option value="Grandparent">Grandparent</option>
                                        <option value="Cousin">Cousin</option>
                                        <option value="Other Relative">Other Relative</option>
                                        <option value="Non-Relative">Non-Relative</option>`;

const CENSUS_SEX_OPTIONS_HTML = `
                                        <option value="">Select your sex</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>`;

const CENSUS_CIVIL_STATUS_OPTIONS_HTML = `
                                        <option value="">Select status</option>
                                        <option value="Single">Single</option>
                                        <option value="Married">Married</option>
                                        <option value="Divorced">Divorced</option>
                                        <option value="Widowed">Widowed</option>`;

/** Others → text field; saved to census_form.disabilities (VARCHAR(100)) */
const CENSUS_DISABILITY_OTHER = '__OTHER__';

const CENSUS_DISABILITY_OPTIONS_HTML = `
                                        <option value="">Ano ang kapansanan?</option>
                                        <option value="None">None / Wala</option>
                                        <option value="Blind / Bulag">Blind / Bulag</option>
                                        <option value="Deaf / Bingi (Mahina ang pandinig)">Deaf / Bingi (Mahina ang pandinig)</option>
                                        <option value="Mute / Pipi">Mute / Pipi</option>
                                        <option value="Physical / Pisikal (itsura)">Physical / Pisikal (itsura)</option>
                                        <option value="Movement / Paggalaw">Movement / Paggalaw</option>
                                        <option value="Intellectual / Problema sa pag-iisip">Intellectual / Problema sa pag-iisip</option>
                                        <option value="Psychosocial / Isip, damdamin, ugnayan">Psychosocial / Isip, damdamin, ugnayan</option>
                                        <option value="Visual impairment / May problema sa paningin">Visual impairment / May problema sa paningin</option>
                                        <option value="${CENSUS_DISABILITY_OTHER}">Others / Iba pa</option>`;

const CENSUS_OCCUPATION_OPTIONS_HTML = `
                                        <option value="">Select occupation</option>
                                        <option value="Unemployed">Unemployed</option>
                                        <option value="Student">Student</option>
                                        <option value="Retired">Retired</option>
                                        <option value="${CENSUS_OCCUPATION_EMPLOYED}">Employed</option>`;

/** Others → text; saved to barangay_supported_benefits */
const CENSUS_BENEFITS_OTHER = '__OTHER__';

const CENSUS_BENEFITS_OPTIONS_HTML = `
                                        <option value="">Select benefits</option>
                                        <option value="None">None</option>
                                        <option value="SK Scholarship">SK Scholarship</option>
                                        <option value="${CENSUS_BENEFITS_OTHER}">Others</option>`;

function applySharedCensusHeadSelectOptions() {
    const pairs = [
        ['censusSuffix', CENSUS_SUFFIX_OPTIONS_HTML],
        ['censusFamilyOccupation', CENSUS_FAMILY_OCCUPATION_OPTIONS_HTML],
        ['censusSex', CENSUS_SEX_OPTIONS_HTML],
        ['censusCivilStatus', CENSUS_CIVIL_STATUS_OPTIONS_HTML],
        ['censusDisabilitySelect', CENSUS_DISABILITY_OPTIONS_HTML],
        ['censusOccupationSelect', CENSUS_OCCUPATION_OPTIONS_HTML],
        ['censusBenefitsSelect', CENSUS_BENEFITS_OPTIONS_HTML],
    ];
    for (let i = 0; i < pairs.length; i++) {
        const el = document.getElementById(pairs[i][0]);
        if (el) el.innerHTML = pairs[i][1].trim();
    }
    syncCensusHeadDisabilityOtherVisibility();
    syncCensusHeadOccupationOtherVisibility();
    syncCensusHeadBenefitsOtherVisibility();
}

function syncCensusHeadBenefitsOtherVisibility() {
    const sel = document.getElementById('censusBenefitsSelect');
    const wrap = document.getElementById('censusBenefitsOtherWrap');
    const other = document.getElementById('censusBenefitsOther');
    if (!sel || !wrap || !other) return;
    const show = sel.value === CENSUS_BENEFITS_OTHER;
    wrap.hidden = !show;
    other.toggleAttribute('required', show);
    if (!show) {
        other.value = '';
    }
}

function getResolvedBenefitsFromSelect(selectEl, otherEl) {
    if (!selectEl || !selectEl.value) return '';
    if (selectEl.value === CENSUS_BENEFITS_OTHER) {
        return otherEl && otherEl.value.trim() ? otherEl.value.trim() : '';
    }
    return selectEl.value;
}

function getResolvedHeadBenefits() {
    return getResolvedBenefitsFromSelect(
        document.getElementById('censusBenefitsSelect'),
        document.getElementById('censusBenefitsOther')
    );
}

function getResolvedMemberBenefits(memberIndex) {
    return getResolvedBenefitsFromSelect(
        document.getElementById(`memberBenefitsSelect_${memberIndex}`),
        document.getElementById(`memberBenefitsOther_${memberIndex}`)
    );
}

function bindCensusBenefitsHeadControls() {
    const sel = document.getElementById('censusBenefitsSelect');
    if (!sel) return;
    if (sel.dataset.benefitsOtherBound !== '1') {
        sel.dataset.benefitsOtherBound = '1';
        sel.addEventListener('change', syncCensusHeadBenefitsOtherVisibility);
    }
    syncCensusHeadBenefitsOtherVisibility();
}

function resetCensusIndigenousHeadControls() {
    const yes = document.getElementById('censusIndigenousYes');
    const no = document.getElementById('censusIndigenousNo');
    const hidden = document.getElementById('censusIndigenous');
    if (yes) yes.checked = false;
    if (no) no.checked = false;
    if (hidden) hidden.value = '';
}

/** Oo = 1, Hindi = 0 — mutually exclusive checkboxes, value sa hidden #censusIndigenous */
function bindCensusIndigenousHeadControls() {
    const yes = document.getElementById('censusIndigenousYes');
    const no = document.getElementById('censusIndigenousNo');
    const hidden = document.getElementById('censusIndigenous');
    if (!yes || !no || !hidden) return;
    if (yes.dataset.indigenousBound === '1') return;
    yes.dataset.indigenousBound = '1';
    no.dataset.indigenousBound = '1';
    yes.addEventListener('change', function () {
        if (yes.checked) {
            no.checked = false;
            hidden.value = '1';
        } else if (!no.checked) {
            hidden.value = '';
        }
    });
    no.addEventListener('change', function () {
        if (no.checked) {
            yes.checked = false;
            hidden.value = '0';
        } else if (!yes.checked) {
            hidden.value = '';
        }
    });
}

/** Household member: Oo = 1, Hindi = 0 — pareho ng head */
function bindCensusIndigenousMemberControls(memberIndex) {
    const yes = document.getElementById(`memberIndigenousYes_${memberIndex}`);
    const no = document.getElementById(`memberIndigenousNo_${memberIndex}`);
    const hidden = document.getElementById(`memberIndigenous_${memberIndex}`);
    if (!yes || !no || !hidden) return;
    if (yes.dataset.indigenousBound === '1') return;
    yes.dataset.indigenousBound = '1';
    no.dataset.indigenousBound = '1';
    yes.addEventListener('change', function () {
        if (yes.checked) {
            no.checked = false;
            hidden.value = '1';
        } else if (!no.checked) {
            hidden.value = '';
        }
    });
    no.addEventListener('change', function () {
        if (no.checked) {
            yes.checked = false;
            hidden.value = '0';
        } else if (!yes.checked) {
            hidden.value = '';
        }
    });
}

function wireMemberBenefitsControls(memberIndex) {
    const sel = document.getElementById(`memberBenefitsSelect_${memberIndex}`);
    const wrap = document.getElementById(`memberBenefitsOtherWrap_${memberIndex}`);
    const other = document.getElementById(`memberBenefitsOther_${memberIndex}`);
    if (!sel || !wrap || !other) return;
    function syncMemberBenefitsOther() {
        const show = sel.value === CENSUS_BENEFITS_OTHER;
        wrap.hidden = !show;
        other.toggleAttribute('required', show);
        if (!show) {
            other.value = '';
        }
    }
    sel.addEventListener('change', syncMemberBenefitsOther);
    syncMemberBenefitsOther();
}

function syncCensusHeadDisabilityOtherVisibility() {
    const sel = document.getElementById('censusDisabilitySelect');
    const wrap = document.getElementById('censusDisabilityOtherWrap');
    const other = document.getElementById('censusDisabilityOther');
    if (!sel || !wrap || !other) return;
    const show = sel.value === CENSUS_DISABILITY_OTHER;
    wrap.hidden = !show;
    other.toggleAttribute('required', show);
    if (!show) {
        other.value = '';
    }
}

function getResolvedDisabilityFromSelect(selectEl, otherEl) {
    if (!selectEl || !selectEl.value) return '';
    if (selectEl.value === CENSUS_DISABILITY_OTHER) {
        return otherEl && otherEl.value.trim() ? otherEl.value.trim() : '';
    }
    return selectEl.value;
}

function getResolvedHeadDisability() {
    return getResolvedDisabilityFromSelect(
        document.getElementById('censusDisabilitySelect'),
        document.getElementById('censusDisabilityOther')
    );
}

function getResolvedMemberDisability(memberIndex) {
    return getResolvedDisabilityFromSelect(
        document.getElementById(`memberDisabilitySelect_${memberIndex}`),
        document.getElementById(`memberDisabilityOther_${memberIndex}`)
    );
}

function bindCensusDisabilityHeadControls() {
    const sel = document.getElementById('censusDisabilitySelect');
    if (!sel) return;
    if (sel.dataset.disabilityOtherBound !== '1') {
        sel.dataset.disabilityOtherBound = '1';
        sel.addEventListener('change', syncCensusHeadDisabilityOtherVisibility);
    }
    syncCensusHeadDisabilityOtherVisibility();
}

function syncCensusHeadOccupationOtherVisibility() {
    const sel = document.getElementById('censusOccupationSelect');
    const wrap = document.getElementById('censusOccupationOtherWrap');
    const other = document.getElementById('censusOccupationOther');
    if (!sel || !wrap || !other) return;
    const show = sel.value === CENSUS_OCCUPATION_EMPLOYED;
    wrap.hidden = !show;
    other.toggleAttribute('required', show);
    if (!show) {
        other.value = '';
    }
}

/** Place of work: editable only when occupation is Employed; otherwise disabled with value "None" (saved to place_of_work). */
function syncCensusHeadPlaceOfWorkState() {
    const sel = document.getElementById('censusOccupationSelect');
    const pow = document.getElementById('censusPlaceOfWork');
    const mark = document.getElementById('censusPlaceOfWorkRequiredMark');
    if (!sel || !pow) return;
    const employed = sel.value === CENSUS_OCCUPATION_EMPLOYED;
    if (employed) {
        pow.disabled = false;
        pow.classList.remove('census-field-readonly');
        if (pow.value === 'None') {
            pow.value = '';
        }
        pow.setAttribute('required', 'required');
        pow.placeholder = 'Company name';
        if (mark) {
            mark.hidden = false;
        }
    } else {
        pow.disabled = true;
        pow.classList.add('census-field-readonly');
        pow.value = 'None';
        pow.removeAttribute('required');
        pow.placeholder = 'None';
        if (mark) {
            mark.hidden = true;
        }
    }
}

function getResolvedHeadPlaceOfWork() {
    const sel = document.getElementById('censusOccupationSelect');
    const pow = document.getElementById('censusPlaceOfWork');
    if (!sel || sel.value !== CENSUS_OCCUPATION_EMPLOYED) {
        return 'None';
    }
    const v = pow && typeof pow.value === 'string' ? pow.value.trim() : '';
    return v !== '' ? v : '';
}

function getResolvedOccupationFromSelect(selectEl, otherEl) {
    if (!selectEl || !selectEl.value) return '';
    if (selectEl.value === CENSUS_OCCUPATION_EMPLOYED) {
        const detail = otherEl && typeof otherEl.value === 'string' ? otherEl.value.trim() : '';
        if (!detail) return '';
        return CENSUS_OCCUPATION_EMPLOYED + ' - ' + detail;
    }
    return selectEl.value;
}

function getResolvedHeadOccupation() {
    return getResolvedOccupationFromSelect(
        document.getElementById('censusOccupationSelect'),
        document.getElementById('censusOccupationOther')
    );
}

function getResolvedMemberOccupation(memberIndex) {
    return getResolvedOccupationFromSelect(
        document.getElementById(`memberOccupationSelect_${memberIndex}`),
        document.getElementById(`memberOccupationOther_${memberIndex}`)
    );
}

/** Same rules as syncCensusHeadPlaceOfWorkState: only Employed edits place of work; else "None" and disabled. */
function syncMemberPlaceOfWorkState(memberIndex) {
    const sel = document.getElementById(`memberOccupationSelect_${memberIndex}`);
    const pow = document.getElementById(`memberPlaceOfWork_${memberIndex}`);
    const mark = document.getElementById(`memberPlaceOfWorkRequiredMark_${memberIndex}`);
    if (!sel || !pow) return;
    const employed = sel.value === CENSUS_OCCUPATION_EMPLOYED;
    if (employed) {
        pow.disabled = false;
        pow.classList.remove('census-field-readonly');
        if (pow.value === 'None') {
            pow.value = '';
        }
        pow.setAttribute('required', 'required');
        pow.placeholder = 'Company name';
        if (mark) {
            mark.hidden = false;
        }
    } else {
        pow.disabled = true;
        pow.classList.add('census-field-readonly');
        pow.value = 'None';
        pow.removeAttribute('required');
        pow.placeholder = 'None';
        if (mark) {
            mark.hidden = true;
        }
    }
}

function getResolvedMemberPlaceOfWork(memberIndex) {
    const sel = document.getElementById(`memberOccupationSelect_${memberIndex}`);
    const pow = document.getElementById(`memberPlaceOfWork_${memberIndex}`);
    if (!sel || sel.value !== CENSUS_OCCUPATION_EMPLOYED) {
        return 'None';
    }
    const v = pow && typeof pow.value === 'string' ? pow.value.trim() : '';
    return v !== '' ? v : '';
}

function bindCensusOccupationHeadControls() {
    const sel = document.getElementById('censusOccupationSelect');
    if (!sel) return;
    function onHeadOccupationChange() {
        syncCensusHeadOccupationOtherVisibility();
        syncCensusHeadPlaceOfWorkState();
    }
    if (sel.dataset.occupationOtherBound !== '1') {
        sel.dataset.occupationOtherBound = '1';
        sel.addEventListener('change', onHeadOccupationChange);
    }
    onHeadOccupationChange();
}

function wireMemberOccupationControls(memberIndex) {
    const sel = document.getElementById(`memberOccupationSelect_${memberIndex}`);
    const wrap = document.getElementById(`memberOccupationOtherWrap_${memberIndex}`);
    const other = document.getElementById(`memberOccupationOther_${memberIndex}`);
    if (!sel || !wrap || !other) return;
    function syncMemberOccupationOther() {
        const show = sel.value === CENSUS_OCCUPATION_EMPLOYED;
        wrap.hidden = !show;
        other.toggleAttribute('required', show);
        if (!show) {
            other.value = '';
        }
    }
    function onMemberOccupationChange() {
        syncMemberOccupationOther();
        syncMemberPlaceOfWorkState(memberIndex);
    }
    sel.addEventListener('change', onMemberOccupationChange);
    onMemberOccupationChange();
}

function wireMemberDisabilityControls(memberIndex) {
    const sel = document.getElementById(`memberDisabilitySelect_${memberIndex}`);
    const wrap = document.getElementById(`memberDisabilityOtherWrap_${memberIndex}`);
    const other = document.getElementById(`memberDisabilityOther_${memberIndex}`);
    if (!sel || !wrap || !other) return;
    function syncMemberDisabilityOther() {
        const show = sel.value === CENSUS_DISABILITY_OTHER;
        wrap.hidden = !show;
        other.toggleAttribute('required', show);
        if (!show) {
            other.value = '';
        }
    }
    sel.addEventListener('change', syncMemberDisabilityOther);
    syncMemberDisabilityOther();
}

// Add a new household member form
function addHouseholdMember() {
    householdMemberCounter++;
    const container = document.getElementById('householdMembersContainer');
    if (!container) return;
    
    const memberCard = document.createElement('div');
    memberCard.className = 'household-member-card';
    memberCard.dataset.memberIndex = householdMemberCounter;
    
    memberCard.innerHTML = `
        <div class="member-card-header">
            <h5><i class="fas fa-user-circle"></i> Household Member ${householdMemberCounter}</h5>
            <button type="button" class="remove-member-btn" onclick="removeHouseholdMember(${householdMemberCounter})" title="Remove this member">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="member-card-body">
            <div class="form-row">
                <div class="form-group">
                    <label for="memberFirstName_${householdMemberCounter}">First Name <span class="required-indicator">*</span></label>
                    <input type="text" id="memberFirstName_${householdMemberCounter}" name="memberFirstName_${householdMemberCounter}" required placeholder="Enter first name">
                </div>
                <div class="form-group">
                    <label for="memberLastName_${householdMemberCounter}">Last Name <span class="required-indicator">*</span></label>
                    <input type="text" id="memberLastName_${householdMemberCounter}" name="memberLastName_${householdMemberCounter}" required placeholder="Enter last name">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="flex: 2;">
                    <label for="memberMiddleName_${householdMemberCounter}">Middle Name</label>
                    <input type="text" id="memberMiddleName_${householdMemberCounter}" name="memberMiddleName_${householdMemberCounter}" placeholder="Enter middle name (optional)">
                </div>
                <div class="form-group" style="flex: 0.5; max-width: 120px;">
                    <label for="memberSuffix_${householdMemberCounter}">Suffix</label>
                    <select id="memberSuffix_${householdMemberCounter}" name="memberSuffix_${householdMemberCounter}">
                        ${CENSUS_SUFFIX_OPTIONS_HTML}
                    </select>
                </div>
                <div class="form-group" style="flex: 1.5;">
                    <label for="memberRelation_${householdMemberCounter}">Family Occupation <span class="required-indicator">*</span></label>
                    <select id="memberRelation_${householdMemberCounter}" name="memberRelation_${householdMemberCounter}" required>
                        ${CENSUS_FAMILY_OCCUPATION_OPTIONS_HTML}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberBirthday_${householdMemberCounter}">Birthday <span class="required-indicator">*</span></label>
                    <input type="date" id="memberBirthday_${householdMemberCounter}" name="memberBirthday_${householdMemberCounter}" required placeholder="Birthday" title="Birthday">
                </div>
                <div class="form-group">
                    <label for="memberAge_${householdMemberCounter}">Age <span class="required-indicator">*</span></label>
                    <input type="number" id="memberAge_${householdMemberCounter}" name="memberAge_${householdMemberCounter}" min="0" max="120" required readonly placeholder="Auto from birthday">
                </div>
                <div class="form-group">
                    <label for="memberSex_${householdMemberCounter}">Sex <span class="required-indicator">*</span></label>
                    <select id="memberSex_${householdMemberCounter}" name="memberSex_${householdMemberCounter}" required>
                        ${CENSUS_SEX_OPTIONS_HTML}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberCivilStatus_${householdMemberCounter}">Civil Status <span class="required-indicator">*</span></label>
                    <select id="memberCivilStatus_${householdMemberCounter}" name="memberCivilStatus_${householdMemberCounter}" required>
                        ${CENSUS_CIVIL_STATUS_OPTIONS_HTML}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberDisabilitySelect_${householdMemberCounter}">Disability <span class="required-indicator">*</span></label>
                    <select id="memberDisabilitySelect_${householdMemberCounter}" class="census-select-long" required>
                        ${CENSUS_DISABILITY_OPTIONS_HTML}
                    </select>
                    <div id="memberDisabilityOtherWrap_${householdMemberCounter}" class="census-occupation-other-wrap" hidden>
                        <label for="memberDisabilityOther_${householdMemberCounter}" class="census-occupation-other-label">Specify disability <span class="required-indicator">*</span></label>
                        <input type="text" id="memberDisabilityOther_${householdMemberCounter}" placeholder="Ilarawan ang kapansanan" maxlength="100" autocomplete="off">
                    </div>
                </div>
                <div class="form-group census-occupation-field">
                    <label for="memberOccupationSelect_${householdMemberCounter}">Occupation/Work <span class="required-indicator">*</span></label>
                    <select id="memberOccupationSelect_${householdMemberCounter}" required>
                        ${CENSUS_OCCUPATION_OPTIONS_HTML}
                    </select>
                    <div id="memberOccupationOtherWrap_${householdMemberCounter}" class="census-occupation-other-wrap" hidden>
                        <label for="memberOccupationOther_${householdMemberCounter}" class="census-occupation-other-label">Job / type of work <span class="required-indicator">*</span></label>
                        <input type="text" id="memberOccupationOther_${householdMemberCounter}" placeholder="e.g., Sales clerk, teacher" autocomplete="off">
                    </div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberPlaceOfWork_${householdMemberCounter}">Place of Work <span id="memberPlaceOfWorkRequiredMark_${householdMemberCounter}" class="required-indicator" hidden>*</span></label>
                    <input type="text" id="memberPlaceOfWork_${householdMemberCounter}" name="memberPlaceOfWork_${householdMemberCounter}" placeholder="None" autocomplete="off">
                </div>
                <div class="form-group">
                    <label for="memberBenefitsSelect_${householdMemberCounter}">Supported Benefits from Barangay <span class="required-indicator">*</span></label>
                    <select id="memberBenefitsSelect_${householdMemberCounter}" required>
                        ${CENSUS_BENEFITS_OPTIONS_HTML}
                    </select>
                    <div id="memberBenefitsOtherWrap_${householdMemberCounter}" class="census-occupation-other-wrap" hidden>
                        <label for="memberBenefitsOther_${householdMemberCounter}" class="census-occupation-other-label">Specify benefit <span class="required-indicator">*</span></label>
                        <input type="text" id="memberBenefitsOther_${householdMemberCounter}" placeholder="Ilarawan ang benepisyo" autocomplete="off">
                    </div>
                </div>
            </div>
            <div class="form-row census-indigenous-row">
                <div class="form-group census-indigenous-group">
                    <span class="census-indigenous-label" id="memberIndigenousLabel_${householdMemberCounter}">Kayo po ba ay kabilang sa Indigenous People? <span class="required-indicator">*</span></span>
                    <div class="census-indigenous-checks" role="group" aria-labelledby="memberIndigenousLabel_${householdMemberCounter}">
                        <label class="census-indigenous-option">
                            <input type="checkbox" id="memberIndigenousYes_${householdMemberCounter}" autocomplete="off">
                            Oo
                        </label>
                        <label class="census-indigenous-option">
                            <input type="checkbox" id="memberIndigenousNo_${householdMemberCounter}" autocomplete="off">
                            Hindi
                        </label>
                    </div>
                    <input type="hidden" id="memberIndigenous_${householdMemberCounter}" name="memberIndigenous_${householdMemberCounter}" value="">
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(memberCard);

    wireMemberBirthdayToAge(householdMemberCounter);
    wireMemberOccupationControls(householdMemberCounter);
    wireMemberDisabilityControls(householdMemberCounter);
    wireMemberBenefitsControls(householdMemberCounter);
    bindCensusIndigenousMemberControls(householdMemberCounter);
    bindHouseholdMemberCardAutoCapitalize(memberCard);

    // Scroll to the new member card
    memberCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Remove a household member form
function removeHouseholdMember(index) {
    const container = document.getElementById('householdMembersContainer');
    if (!container) return;
    
    const memberCard = container.querySelector(`[data-member-index="${index}"]`);
    if (memberCard) {
        // Add fade out animation
        memberCard.style.opacity = '0';
        memberCard.style.transform = 'translateX(-20px)';
        setTimeout(() => {
            memberCard.remove();
            // Update member numbers
            updateMemberNumbers();
        }, 300);
    }
}

// Update member numbers after removal
function updateMemberNumbers() {
    const container = document.getElementById('householdMembersContainer');
    if (!container) return;
    
    const cards = container.querySelectorAll('.household-member-card');
    cards.forEach((card, index) => {
        const header = card.querySelector('.member-card-header h5');
        if (header) {
            header.innerHTML = `<i class="fas fa-user-circle"></i> Household Member ${index + 1}`;
        }
    });
}

// Step 1: validate census form, then show data privacy consent before network submit
function handleCensusSubmission(e) {
    e.preventDefault();
    const form = e.target;
    const tel = getCensusContactDigitsForSubmit();
    if (tel.length !== 11 || !/^09\d{9}$/.test(tel)) {
        const el = document.getElementById('censusContactNumber');
        if (el) el.focus();
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Contact number',
                text: 'Maglagay ng wastong 11-digit na mobile number (09XX-XXX-XXXX).'
            });
        } else {
            alert('Maglagay ng wastong 11-digit na mobile number (09XX-XXX-XXXX).');
        }
        return;
    }
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    const indHidden = document.getElementById('censusIndigenous');
    if (!indHidden || (indHidden.value !== '0' && indHidden.value !== '1')) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Indigenous People',
                text: 'Pumili po ng Oo o Hindi sa tanong tungkol sa Indigenous People.'
            });
        } else {
            alert('Pumili po ng Oo o Hindi sa tanong tungkol sa Indigenous People.');
        }
        return;
    }
    const memberCardsForInd = document.querySelectorAll('.household-member-card');
    for (let mi = 0; mi < memberCardsForInd.length; mi++) {
        const card = memberCardsForInd[mi];
        const memberIndex = card.dataset.memberIndex;
        const fnEl = document.getElementById(`memberFirstName_${memberIndex}`);
        const lnEl = document.getElementById(`memberLastName_${memberIndex}`);
        const fn = fnEl && fnEl.value ? fnEl.value.trim() : '';
        const ln = lnEl && lnEl.value ? lnEl.value.trim() : '';
        if (!fn || !ln) continue;
        const mInd = document.getElementById(`memberIndigenous_${memberIndex}`);
        if (!mInd || (mInd.value !== '0' && mInd.value !== '1')) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'Indigenous People',
                    text: 'Pumili po ng Oo o Hindi sa tanong tungkol sa Indigenous People (household member).'
                });
            } else {
                alert('Pumili po ng Oo o Hindi sa tanong tungkol sa Indigenous People (household member).');
            }
            if (fnEl) fnEl.focus();
            return;
        }
    }
    censusSubmitPendingForm = form;
    openCensusConsentOverlay();
}

// Step 2: after user checks consent and clicks I Agree
async function executeCensusSubmission(form) {
    const submitBtn = form.querySelector('.census-submit');
    if (!submitBtn) return;
    const originalText = submitBtn.innerHTML;

    hideCensusReopenButton();
    localStorage.removeItem(LS_CENSUS_REOPEN_SHORTCUT);

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.innerHTML = '';

    // Ensure place-of-work fields match occupation (None + disabled when not Employed) before read
    syncCensusHeadPlaceOfWorkState();
    document.querySelectorAll('.household-member-card').forEach((card) => {
        const idx = card.dataset.memberIndex;
        if (idx != null && idx !== '') {
            syncMemberPlaceOfWorkState(idx);
        }
    });
    
    // Get form data
    const formData = new FormData(form);
    
    // Collect all household members
    const householdMembers = [];
    const memberCards = document.querySelectorAll('.household-member-card');
    memberCards.forEach((card, index) => {
        const memberIndex = card.dataset.memberIndex;
        const firstName = formData.get(`memberFirstName_${memberIndex}`);
        const lastName = formData.get(`memberLastName_${memberIndex}`);
        const middleName = formData.get(`memberMiddleName_${memberIndex}`) || '';
        const memberSuffixRaw = formData.get(`memberSuffix_${memberIndex}`);
        const memberSuffix =
            memberSuffixRaw != null && String(memberSuffixRaw).trim() !== ''
                ? String(memberSuffixRaw).trim()
                : null;

        const memberIndEl = document.getElementById(`memberIndigenous_${memberIndex}`);
        const member = {
            firstName: firstName,
            middleName: middleName,
            lastName: lastName,
            suffix: memberSuffix,
            relation: formData.get(`memberRelation_${memberIndex}`),
            age: formData.get(`memberAge_${memberIndex}`),
            sex: formData.get(`memberSex_${memberIndex}`),
            birthday: formData.get(`memberBirthday_${memberIndex}`),
            civilStatus: formData.get(`memberCivilStatus_${memberIndex}`),
            disability: getResolvedMemberDisability(memberIndex),
            work: getResolvedMemberOccupation(memberIndex),
            placeOfWork: getResolvedMemberPlaceOfWork(memberIndex),
            benefits: getResolvedMemberBenefits(memberIndex),
            indigenous: memberIndEl && memberIndEl.value === '1' ? 1 : 0
        };
        
        // Only add if first name and last name are provided (required fields)
        if (firstName && firstName.trim() && lastName && lastName.trim()) {
            householdMembers.push(member);
        }
    });
    
    // Get user email for database lookup
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    
    const censusData = {
        form_type: 'census',
        email: userEmail, // Include email for database lookup and user identification
        firstName: formData.get('firstName'),
        middleName: formData.get('middleName'),
        lastName: formData.get('lastName'),
        suffix: formData.get('suffix'),
        familyOccupation: formData.get('familyOccupation'),
        age: formData.get('age'),
        sex: formData.get('sex'),
        birthday: formData.get('birthday'),
        civilStatus: formData.get('civilStatus'),
        contactNumber: getCensusContactDigitsForSubmit(),
        disability: getResolvedHeadDisability(),
        address: formData.get('address'),
        unitHouseNumber: formData.get('unitHouseNumber') || '',
        occupation: getResolvedHeadOccupation(),
        placeOfWork: getResolvedHeadPlaceOfWork(),
        claimedBenefits: getResolvedHeadBenefits(),
        indigenous: (function () {
            const el = document.getElementById('censusIndigenous');
            if (!el) return 0;
            return el.value === '1' ? 1 : 0;
        })(),
        householdMembers: householdMembers,
        totalHouseholdMembers: householdMembers.length + 1 // +1 for the person filling the form
    };
    
    try {
        const response = await fetch('php/submit_census.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(censusData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            clearCensusReminderTimer();
            setProfileCensusedLabel(true);

            // Census completion is now tracked in database, no localStorage needed
            // The server will handle saving to resident_information and census_forms tables
            
            // Show success message
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Census Submitted!',
                    text: 'Thank you for completing the barangay census form.',
                    timer: 3000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top'
                });
            }
            
            // Close modal after a short delay
            setTimeout(() => {
                localStorage.removeItem('census_remind_later');
                localStorage.removeItem(LS_CENSUS_REOPEN_SHORTCUT);
                hideCensusReopenButton();
                closeCensusModal();
            }, 1500);
        } else {
            // Show error message
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'Submission Failed',
                    text: result.message || 'Please try again later.',
                    confirmButtonText: 'OK'
                });
            }
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
            submitBtn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error submitting census form:', error);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Network Error',
                text: 'Please check your connection and try again.',
                confirmButtonText: 'OK'
            });
        }
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        submitBtn.innerHTML = originalText;
    }
}

// Remind me later function
function remindMeLater() {
    localStorage.setItem('census_remind_later', Date.now().toString());
    localStorage.setItem(LS_CENSUS_REOPEN_SHORTCUT, '1');
    scheduleCensusReminder(CENSUS_REMIND_LATER_MINUTES * 60 * 1000);
    closeCensusModal({ deferReopenButton: true });

    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'info',
            title: 'Reminder Set',
            text: `We will remind you again in ${CENSUS_REMIND_LATER_MINUTES} minutes.`,
            timer: 2500,
            showConfirmButton: false,
            toast: true,
            position: 'top'
        }).then(function() {
            showCensusReopenButtonAnimated();
        });
    } else {
        showCensusReopenButtonAnimated();
    }
}
