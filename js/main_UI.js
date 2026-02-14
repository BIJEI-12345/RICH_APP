// Main UI JavaScript for Barangay Bigte Portal

// Global variables
let currentUser = null;
let editMode = false;
const CENSUS_REMIND_LATER_MINUTES = 2; // How long to hide the census reminder after "Remind Me Later" is clicked
let censusReminderTimeoutId = null;

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

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadUserData();
    setupEventListeners();
    loadAnnouncements();
});

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
                // Only redirect to login if not on localhost
                window.location.href = 'index.html';
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
        fetch('php/main_UI.php', {
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
                updateUserInterface(data.user);
                // Only check census status if user data was successfully loaded
                checkCensusStatus();
            } else {
                console.warn('Server returned error:', data.message);
                // User not found - don't set currentUser and don't check census
                currentUser = null;
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
            // Use actual logged-in user data if available
            const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
            const userName = userEmail ? userEmail.split('@')[0].toUpperCase() : 'JUAN';
            updateUserInterface({
                first_name: userName,
                mobile: '+63 935 *** 8039'
            });
        });
    } else {
        // Use default data for testing when no session exists
        updateUserInterface({
            first_name: 'JUAN',
            mobile: '+63 935 *** 8039'
        });
    }
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
    
    // Update phone number
    const phoneElement = document.querySelector('.phone-number');
    if (phoneElement) {
        const phone = user.mobile || user.phone || '+63 935 *** 8039';
        phoneElement.textContent = phone;
    }
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
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Find the document title from the card
            const card = button.closest('.request-card');
            const documentTitle = card.querySelector('h4').textContent;
            
            // Get the corresponding document type
            const documentType = documentTypeMap[documentTitle] || 'barangay-id';
            
            // Navigate to request page with document type parameter
            window.location.href = `request.html?type=${documentType}`;
        });
    });
    
    console.log('Document request buttons navigation initialized');
}

// Setup See All button navigation
function setupSeeAllButton() {
    const seeAllBtn = document.querySelector('.see-all-btn');
    if (seeAllBtn) {
        seeAllBtn.addEventListener('click', function() {
            // Navigate to news & article page
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

// Global variable to store carousel state
let announcementCarousel = null;

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
        const response = await fetch('php/announcements.php');
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

// Function to create announcement card HTML for main UI
function createMainUIAnnouncementCard(announcement) {
    const imageSrc = announcement.image ? announcement.image : 'Images/brgyHall.jpg';
    const imageAlt = announcement.title || 'Announcement';
    const formattedDate = announcement.formatted_date || '';
    const defaultImage = 'Images/brgyHall.jpg';
    
    return `
        <div class="announcement-card">
            <div class="announcement-image-container">
                <img src="${imageSrc}" alt="${imageAlt}" class="announcement-image" 
                     onerror="this.onerror=null; this.src='${defaultImage}';">
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
        const cardsHTML = announcements.map(announcement => createMainUIAnnouncementCard(announcement)).join('');
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

function Documents() {
    window.location.href = 'request.html';
}

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

function editProfile() {
    // Close dropdown
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    
    // Show edit profile modal or redirect to profile page
    alert('Edit Profile functionality will be implemented soon!');
    // TODO: Implement edit profile functionality
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
        confirmButtonColor: '#d33',
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
                timer: 1000
            });
            
            // Clear user session data
            sessionStorage.removeItem('user_email');
            localStorage.removeItem('user_email');
            sessionStorage.removeItem('user_data');
            localStorage.removeItem('user_data');
            sessionStorage.removeItem('reporter_name');
            localStorage.removeItem('reporter_name');
            
            // Redirect to login page after a short delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        }
    });
}

// Note: All CSS styles have been moved to main_UI.css file for better organization

// Edit Profile Modal Functions
function editProfile() {
    console.log('Opening edit profile modal');
    
    // Reset edit mode
    editMode = false;
    
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
            
            // Check if elements exist before trying to set values
            const firstNameEl = document.getElementById('firstName');
            const middleNameEl = document.getElementById('middleName');
            const lastNameEl = document.getElementById('lastName');
            const suffixEl = document.getElementById('suffix');
            const userEmailEl = document.getElementById('userEmail');
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
            if (ageEl) ageEl.value = user.age || '';
            if (sexEl) sexEl.value = user.sex || '';
            if (birthdayEl) birthdayEl.value = user.birthday || '';
            if (civilStatusEl) civilStatusEl.value = user.civil_status || '';
            if (userAddressEl) userAddressEl.value = user.address || '';
            
            // Ensure inputs are in view mode
            disableInputs();
            
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
    
    // Clear any error messages
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }
}

// Toggle edit mode
function toggleEditMode() {
    const modal = document.getElementById('editProfileModal');
    const header = modal.querySelector('.modal-header h3');
    const editBtn = document.getElementById('editProfileBtn');
    const formActions = document.getElementById('formActions');
    
    if (editMode === false) {
        // Enter edit mode
        editMode = true;
        header.textContent = 'Edit Profile';
        editBtn.innerHTML = '<i class="fas fa-eye"></i><span>View</span>';
        formActions.style.display = 'flex';
        
        // Enable all inputs except email
        enableInputs();
    } else {
        // Exit edit mode
        exitEditMode();
    }
}

// Exit edit mode
function exitEditMode() {
    editMode = false;
    const modal = document.getElementById('editProfileModal');
    const header = modal.querySelector('.modal-header h3');
    const editBtn = document.getElementById('editProfileBtn');
    const formActions = document.getElementById('formActions');
    
    header.textContent = 'View Profile';
    editBtn.innerHTML = '<i class="fas fa-edit"></i><span>Edit</span>';
    if (formActions) formActions.style.display = 'none';
    
    // Disable all inputs except email (keep readonly)
    disableInputs();
}

// Enable inputs for editing
function enableInputs() {
    const inputs = ['firstName', 'middleName', 'lastName', 'suffix', 'age', 'birthday', 'userAddress'];
    const selects = ['sex', 'civilStatus'];
    
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.removeAttribute('readonly');
            
            // Only set as required if it's not optional field
            const optionalFields = ['middleName', 'suffix'];
            if (!optionalFields.includes(input.id)) {
                input.required = true;
            } else {
                input.required = false;
            }
            
            // Remove readonly styling class
            input.classList.remove('readonly-field');
            if (input.placeholder === 'None') {
                input.placeholder = input.id === 'middleName' || input.id === 'suffix' ? '' : 'Enter your ' + id.replace(/([A-Z])/g, ' $1').toLowerCase();
            }
        }
    });
    
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.disabled = false;
            select.required = true;
        }
    });
}

// Disable inputs (view mode)
function disableInputs() {
    const inputs = ['firstName', 'middleName', 'lastName', 'suffix', 'age', 'birthday', 'userAddress'];
    const selects = ['sex', 'civilStatus'];
    
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

// Cancel edit
function cancelEdit() {
    exitEditMode();
    // Optionally reload the data
    loadUserDataForEditProfile();
}

function previewProfileImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const profilePreview = document.getElementById('profilePreview');
            const profilePlaceholder = document.getElementById('profilePlaceholder');
            const initialsModal = document.querySelector('.profile-initials-modal');
            
            profilePreview.src = e.target.result;
            profilePreview.style.display = 'block';
            profilePlaceholder.style.display = 'none';
            if (initialsModal) initialsModal.style.display = 'none';
        };
        
        reader.readAsDataURL(input.files[0]);
    }
}

async function saveProfileChanges() {
    console.log('Saving profile changes');
    
    const form = document.getElementById('editProfileForm');
    const saveBtn = document.querySelector('.save-btn');
    const formData = new FormData(form);
    
    // Show loading state
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;
    
    // Clear any existing messages
    const existingMessage = document.querySelector('.form-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Validate required fields
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const age = document.getElementById('age').value;
    const sex = document.getElementById('sex').value;
    const birthday = document.getElementById('birthday').value;
    const civilStatus = document.getElementById('civilStatus').value;
    const address = document.getElementById('userAddress').value.trim();
    
    // Optional fields don't need validation
    if (!firstName || !lastName || !age || !sex || !birthday || !civilStatus || !address) {
        showFormMessage('Please fill in all required fields.', 'error');
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
        return;
    }
    
    try {
        // Add email to formData
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        formData.append('email', userEmail);
        
        // Handle profile picture if changed
        const profilePicture = document.getElementById('profilePicture').files[0];
        if (profilePicture) {
            formData.append('profilePicture', profilePicture);
        }
        
        // Send to PHP endpoint for saving
        const response = await fetch('php/update_profile.php', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update local storage
            sessionStorage.setItem('user_name', firstName);
            localStorage.setItem('user_name', firstName);
            
            // Update the main UI with new name
            updateUserGreeting(userEmail);
            
            // Update profile picture in header if changed
            const profilePreview = document.getElementById('profilePreview');
            const headerProfileImg = document.querySelector('.profile-picture img');
            if (profilePreview.src && headerProfileImg) {
                headerProfileImg.src = profilePreview.src;
            }
            
            // Show success notification with SweetAlert2 in upper center
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Profile Updated Successfully',
                    text: 'Your changes have been saved.',
                    timer: 5000,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top',
                    width: '400px'
                });
            } else {
                // Fallback if SweetAlert2 is not loaded
                showFormMessage('Profile updated successfully!', 'success');
            }
            
            // Exit edit mode and close modal after a short delay
            setTimeout(() => {
                exitEditMode();
                setTimeout(() => {
                    closeEditProfileModal();
                }, 500);
            }, 1500);
            
        } else {
            showFormMessage(data.message || 'Error updating profile. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        showFormMessage('Error updating profile. Please try again.', 'error');
    } finally {
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
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
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveProfileChanges();
        });
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

// Check if user has completed census
async function checkCensusStatus() {
    // First check if user is actually loaded and exists in database
    if (!currentUser) {
        console.log('No valid user found, blocking census form');
        return;
    }
    
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    if (!userEmail) {
        console.log('No user email found, skipping census check');
        return;
    }

    // Check if user clicked "Remind Me Later" (temporary client-side preference only)
    const remindLaterTime = localStorage.getItem('census_remind_later');
    if (remindLaterTime) {
        const remindTime = parseInt(remindLaterTime, 10);
        const now = Date.now();
        const minutesPassed = (now - remindTime) / (1000 * 60);
        
        if (minutesPassed < CENSUS_REMIND_LATER_MINUTES) {
            const remainingMs = (CENSUS_REMIND_LATER_MINUTES - minutesPassed) * 60 * 1000;
            console.log(`User asked to be reminded later, skipping census modal for ${CENSUS_REMIND_LATER_MINUTES} minutes`);
            scheduleCensusReminder(remainingMs);
            return;
        } else {
            // Reminder window passed, clear the reminder
            localStorage.removeItem('census_remind_later');
        }
    }

    // Check with server - purely cloud-based, no localStorage for completion status
    try {
        const response = await fetch('php/check_census.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Census check response:', data);
        
        // Show modal if email is NOT in resident_information table OR census not completed
        // But only if currentUser exists (user is actually logged in and exists in database)
        if (data.success && currentUser) {
            if (data.emailExists === false) {
                // Email not in resident_information table - show modal immediately
                console.log('Email not found in resident_information table - showing census form');
                showCensusModal();
            } else if (data.emailExists === true && !data.hasCompletedCensus) {
                // Email exists but census not completed - show modal
                console.log('Email exists but census not completed - showing census form');
                showCensusModal();
            } else if (data.emailExists === true && data.hasCompletedCensus) {
                // Census already completed - do nothing
                console.log('Census already completed - not showing modal');
            }
        } else {
            // On error or unclear response, only show modal if user is logged in
            // Check if error is due to user not found
            if (data.message && data.message.includes('User not found')) {
                console.log('User not found, blocking census form');
                return;
            }
            // For other errors, only show if user is logged in
            const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
            if (userEmail) {
                console.log('Unclear response or error - showing census form');
                showCensusModal();
            }
        }
    } catch (error) {
        // Only show modal if user is logged in
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        if (userEmail) {
            console.log('Error checking census status, showing census form');
            showCensusModal();
        } else {
            console.log('Error checking census status and no user logged in, blocking census form');
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

// Close census modal
function closeCensusModal() {
    const modal = document.getElementById('censusModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // Reset form
        const form = document.getElementById('censusForm');
        if (form) {
            form.reset();
        }
        
        // Clear household members
        const container = document.getElementById('householdMembersContainer');
        if (container) {
            container.innerHTML = '';
        }
        
        // Reset counter
        householdMemberCounter = 0;
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
            
            // Populate other fields
            if (ageEl) ageEl.value = user.age || '';
            if (sexEl) sexEl.value = user.sex || '';
            if (birthdayEl) birthdayEl.value = user.birthday || '';
            if (civilStatusEl) civilStatusEl.value = user.civil_status || '';
            if (addressEl) addressEl.value = user.address || '';
            
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

// Setup census form event listeners
function setupCensusFormListeners() {
    // Form submission
    const censusForm = document.getElementById('censusForm');
    if (censusForm) {
        censusForm.addEventListener('submit', handleCensusSubmission);
    }
    
    // Initialize with at least one household member field
    const container = document.getElementById('householdMembersContainer');
    if (container && container.children.length === 0) {
        addHouseholdMember();
    }
}

// Counter for household members
let householdMemberCounter = 0;

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
                <div class="form-group" style="flex: 1.5;">
                    <label for="memberRelation_${householdMemberCounter}">Family Occupation <span class="required-indicator">*</span></label>
                    <select id="memberRelation_${householdMemberCounter}" name="memberRelation_${householdMemberCounter}" required>
                        <option value="">Select family occupation</option>
                        <option value="Mother">Mother</option>
                        <option value="Father">Father</option>
                        <option value="Son">Son</option>
                        <option value="Daughter">Daughter</option>
                        <option value="Grandparent">Grandparent</option>
                        <option value="Cousin">Cousin</option>
                        <option value="Other Relative">Other Relative</option>
                        <option value="Non-Relative">Non-Relative</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberAge_${householdMemberCounter}">Age <span class="required-indicator">*</span></label>
                    <input type="number" id="memberAge_${householdMemberCounter}" name="memberAge_${householdMemberCounter}" min="0" max="120" required placeholder="Age">
                </div>
                <div class="form-group">
                    <label for="memberSex_${householdMemberCounter}">Sex <span class="required-indicator">*</span></label>
                    <select id="memberSex_${householdMemberCounter}" name="memberSex_${householdMemberCounter}" required>
                        <option value="">Select sex</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberBirthday_${householdMemberCounter}">Birthday <span class="required-indicator">*</span></label>
                    <input type="date" id="memberBirthday_${householdMemberCounter}" name="memberBirthday_${householdMemberCounter}" required>
                </div>
                <div class="form-group">
                    <label for="memberCivilStatus_${householdMemberCounter}">Civil Status <span class="required-indicator">*</span></label>
                    <select id="memberCivilStatus_${householdMemberCounter}" name="memberCivilStatus_${householdMemberCounter}" required>
                        <option value="">Select status</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="memberWork_${householdMemberCounter}">Occupation/Work</label>
                    <input type="text" id="memberWork_${householdMemberCounter}" name="memberWork_${householdMemberCounter}" placeholder="e.g., Student, Teacher, None">
                </div>
                <div class="form-group">
                    <label for="memberPlaceOfWork_${householdMemberCounter}">Place of Work</label>
                    <input type="text" id="memberPlaceOfWork_${householdMemberCounter}" name="memberPlaceOfWork_${householdMemberCounter}" placeholder="Company or school name">
                </div>
            </div>
            <div class="form-group">
                <label for="memberBenefits_${householdMemberCounter}">Supported Benefits from Barangay</label>
                <input type="text" id="memberBenefits_${householdMemberCounter}" name="memberBenefits_${householdMemberCounter}" placeholder="List any benefits received (optional)">
            </div>
        </div>
    `;
    
    container.appendChild(memberCard);
    
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

// Handle census form submission
async function handleCensusSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('.census-submit');
    const originalText = submitBtn.innerHTML;
    
    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.innerHTML = '';
    
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
        
        const member = {
            firstName: firstName,
            middleName: middleName,
            lastName: lastName,
            relation: formData.get(`memberRelation_${memberIndex}`),
            age: formData.get(`memberAge_${memberIndex}`),
            sex: formData.get(`memberSex_${memberIndex}`),
            birthday: formData.get(`memberBirthday_${memberIndex}`),
            civilStatus: formData.get(`memberCivilStatus_${memberIndex}`),
            work: formData.get(`memberWork_${memberIndex}`) || '',
            placeOfWork: formData.get(`memberPlaceOfWork_${memberIndex}`) || '',
            benefits: formData.get(`memberBenefits_${memberIndex}`) || ''
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
        contactNumber: formData.get('contactNumber'),
        address: formData.get('address'),
        occupation: formData.get('occupation'),
        placeOfWork: formData.get('placeOfWork'),
        claimedBenefits: formData.get('claimedBenefits'),
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
                closeCensusModal();
                // Clear any "remind later" setting (temporary client-side preference only)
                localStorage.removeItem('census_remind_later');
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
    // Store current timestamp
    localStorage.setItem('census_remind_later', Date.now().toString());
    scheduleCensusReminder(CENSUS_REMIND_LATER_MINUTES * 60 * 1000);
    
    // Close modal
    closeCensusModal();
    
    // Show confirmation
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'info',
            title: 'Reminder Set',
            text: `We will remind you again in ${CENSUS_REMIND_LATER_MINUTES} minutes.`,
            timer: 2000,
            showConfirmButton: false,
            toast: true,
            position: 'top'
        });
    }
}
