// Hotline Directory JavaScript

// Carousel functionality
let currentSlide = 0;
let totalSlides = 0;
let itemsPerView = 1;
let resizeTimeoutId;
let infiniteScrollId;
let lastTimestamp;
let scrollPositionPx = 0;
let itemStepPx = 0; // distance to move one card
let autoScrollSpeedPxPerSec = 80; // tune for desired speed
let originalItemsCount = 0;
let originalSetWidthPx = 0;
let isPaused = false;
let pauseTimeoutId = null;
let pauseDuration = 3000; // pause for 3 seconds when tapped

// Function to make a call - opens phone dialer on mobile devices
function makeCall(phoneNumber) {
    // Remove any non-digit characters except + for international numbers
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Check if device is mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Use tel: protocol to open phone dialer
        window.location.href = `tel:${cleanNumber}`;
    } else {
        // For desktop, show a message or copy to clipboard
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(cleanNumber).then(() => {
                showNotification('Phone number copied to clipboard: ' + cleanNumber, 'success');
            }).catch(() => {
                showNotification('Phone number: ' + cleanNumber, 'info');
            });
        } else {
            showNotification('Phone number: ' + cleanNumber, 'info');
        }
    }
}

// Initialize carousel
function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    const items = track.querySelectorAll('.directory-item');
    totalSlides = items.length;
    
    // Calculate items per view based on screen size
    updateItemsPerView();
    setItemWidths();
    computeItemStep();
    duplicateItemsForLoop();
    computeOriginalSetWidth();
    
    // Indicators removed
    
    // Set up event listeners
    setupCarouselControls();
    
    // Set up pause on tap
    pauseCarouselOnTap();
    
    // Start infinite smooth scroll
    startInfiniteScroll();
    
    console.log('Carousel initialized with', totalSlides, 'items');
}

// Update items per view based on screen size
function updateItemsPerView() {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 1200) {
        itemsPerView = 3;
    } else if (screenWidth >= 768) {
        itemsPerView = 2;
    } else {
        itemsPerView = 1;
    }
}

// Set item widths based on itemsPerView
function setItemWidths() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const items = track.querySelectorAll('.directory-item');
    const percent = 100 / itemsPerView;
    items.forEach(item => {
        item.style.flex = `0 0 calc(${percent}% - 0.67rem)`; // leave room for gap
        item.style.minWidth = 'unset';
    });
}

// Compute pixel distance between two adjacent items
function computeItemStep() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const itemA = track.querySelector('.directory-item');
    const itemB = itemA && itemA.nextElementSibling;
    if (itemA && itemB) {
        const rectA = itemA.getBoundingClientRect();
        const rectB = itemB.getBoundingClientRect();
        itemStepPx = Math.round(rectB.left - rectA.left);
        if (itemStepPx <= 0) {
            itemStepPx = Math.round(rectA.width); // fallback
        }
    }
}

// Duplicate the original set once to allow seamless wrap-around
function duplicateItemsForLoop() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    if (track.getAttribute('data-loop-cloned') === 'true') return; // prevent double cloning
    const children = Array.from(track.children);
    children.forEach(node => {
        track.appendChild(node.cloneNode(true));
    });
    track.setAttribute('data-loop-cloned', 'true');
    // Re-setup pause on tap after duplicating items
    pauseCarouselOnTap();
}

function computeOriginalSetWidth() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    const totalChildren = track.children.length;
    originalItemsCount = Math.floor(totalChildren / 2);
    if (originalItemsCount > 1) {
        // Measure distance from first to second to get step width
        const itemA = track.querySelector('.directory-item');
        const itemB = itemA && itemA.nextElementSibling;
        if (itemA && itemB) {
            const rectA = itemA.getBoundingClientRect();
            const rectB = itemB.getBoundingClientRect();
            const step = Math.round(rectB.left - rectA.left) || Math.round(rectA.width);
            originalSetWidthPx = step * originalItemsCount;
        }
    }
}

// Indicators removed

// Setup carousel controls
function setupCarouselControls() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.addEventListener('click', () => moveOneItem(-1));
    nextBtn.addEventListener('click', () => moveOneItem(1));
    
    // Touch/swipe support
    const track = document.getElementById('carouselTrack');
    let startX = 0;
    let endX = 0;
    
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    });
    
    track.addEventListener('touchend', (e) => {
        endX = e.changedTouches[0].clientX;
        handleSwipe();
    });
    
    function handleSwipe() {
        const threshold = 50;
        const diff = startX - endX;
        
        if (Math.abs(diff) > threshold) {
            if (diff > 0) {
                moveOneItem(1);
            } else {
                moveOneItem(-1);
            }
        }
    }
}

// Go to specific slide
function goToSlide(slideIndex) {
    currentSlide = slideIndex;
    updateCarousel();
    // Indicators removed
}

// Next slide
function nextSlide() {
    const maxSlide = Math.ceil(totalSlides / itemsPerView) - 1;
    currentSlide = currentSlide >= maxSlide ? 0 : currentSlide + 1;
    updateCarousel();
    // Indicators removed
}

// Previous slide
function previousSlide() {
    const maxSlide = Math.ceil(totalSlides / itemsPerView) - 1;
    currentSlide = currentSlide <= 0 ? maxSlide : currentSlide - 1;
    updateCarousel();
    updateIndicators();
}

// Update carousel position
function updateCarousel() {
    const track = document.getElementById('carouselTrack');
    const wrapper = document.querySelector('.carousel-wrapper');
    if (!track || !wrapper) return;
    const slideWidth = wrapper.clientWidth;
    const translateX = -(currentSlide * slideWidth);
    track.style.transition = 'transform 0.5s ease-in-out';
    track.style.transform = `translateX(${translateX}px)`;
}

// Update indicators
function updateIndicators() {
    // Indicators removed
}

// Auto-play functionality
let autoPlayInterval;

function startInfiniteScroll() {
    stopInfiniteScroll();
    if (isPaused) return; // Don't start if paused
    lastTimestamp = undefined;
    const loop = (ts) => {
        if (isPaused) {
            infiniteScrollId = requestAnimationFrame(loop);
            return;
        }
        if (lastTimestamp === undefined) lastTimestamp = ts;
        const dt = (ts - lastTimestamp) / 1000; // seconds
        lastTimestamp = ts;
        const track = document.getElementById('carouselTrack');
        if (!track || itemStepPx === 0) {
            infiniteScrollId = requestAnimationFrame(loop);
            return;
        }
        // Disable transition for continuous movement
        if (track.style.transition !== 'none') track.style.transition = 'none';
        scrollPositionPx += autoScrollSpeedPxPerSec * dt;
        // Wrap at the width of the original set for seamless loop
        if (originalSetWidthPx > 0) {
            scrollPositionPx %= originalSetWidthPx;
        }
        track.style.transform = `translateX(${-scrollPositionPx}px)`;
        infiniteScrollId = requestAnimationFrame(loop);
    };
    infiniteScrollId = requestAnimationFrame(loop);
}

function stopInfiniteScroll() {
    if (infiniteScrollId) cancelAnimationFrame(infiniteScrollId);
    infiniteScrollId = undefined;
}

// Pause auto-scroll on hover
function setupAutoPlayControls() {
    const carouselContainer = document.querySelector('.carousel-container');
    
    carouselContainer.addEventListener('mouseenter', stopInfiniteScroll);
    carouselContainer.addEventListener('mouseleave', startInfiniteScroll);
}

// Pause carousel when card is tapped
function pauseCarouselOnTap() {
    const directoryItems = document.querySelectorAll('.directory-item');
    
    directoryItems.forEach(item => {
        // Clear any existing click handlers to avoid duplicates
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // Add tap/click event listener
        newItem.addEventListener('click', function(e) {
            // Don't pause if clicking the call button
            if (e.target.closest('.call-btn')) {
                return;
            }
            
            // Pause the carousel
            pauseCarousel();
        });
        
        // Also handle touch events for mobile
        newItem.addEventListener('touchend', function(e) {
            // Don't pause if tapping the call button
            if (e.target.closest('.call-btn')) {
                return;
            }
            
            // Prevent default to avoid triggering click
            e.preventDefault();
            
            // Pause the carousel
            pauseCarousel();
        });
    });
}

// Pause carousel for a set duration
function pauseCarousel() {
    if (isPaused) return; // Already paused
    
    isPaused = true;
    stopInfiniteScroll();
    
    // Clear any existing pause timeout
    if (pauseTimeoutId) {
        clearTimeout(pauseTimeoutId);
    }
    
    // Resume after pause duration
    pauseTimeoutId = setTimeout(() => {
        isPaused = false;
        startInfiniteScroll();
        pauseTimeoutId = null;
    }, pauseDuration);
}

// Handle window resize
function handleResize() {
    // Debounce resize for performance
    clearTimeout(resizeTimeoutId);
    resizeTimeoutId = setTimeout(() => {
        updateItemsPerView();
        setItemWidths();
        computeItemStep();
        computeOriginalSetWidth();
        // Indicators removed
        // Reset smooth scroll baseline
        scrollPositionPx = 0;
        const track = document.getElementById('carouselTrack');
        if (track) {
            track.style.transition = 'none';
            track.style.transform = 'translateX(0)';
        }
        updateIndicators();
        // Re-setup pause on tap after resize (items might be recreated)
        pauseCarouselOnTap();
    }, 100);
}

// Apply current translateX without transitions
function applyTransform() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;
    track.style.transition = 'none';
    track.style.transform = `translateX(${-scrollPositionPx}px)`;
}

// Smoothly move by exactly one card (left/right)
function moveOneItem(direction) {
    if (!itemStepPx || !originalSetWidthPx) return;
    stopInfiniteScroll();
    // Normalize position to avoid accumulating rounding error
    if (originalSetWidthPx > 0) {
        scrollPositionPx = ((scrollPositionPx % originalSetWidthPx) + originalSetWidthPx) % originalSetWidthPx;
    }
    scrollPositionPx += direction * itemStepPx;
    // Wrap around
    if (originalSetWidthPx > 0) {
        scrollPositionPx = ((scrollPositionPx % originalSetWidthPx) + originalSetWidthPx) % originalSetWidthPx;
    }
    const track = document.getElementById('carouselTrack');
    if (track) {
        track.style.transition = 'transform 350ms ease-in-out';
        track.style.transform = `translateX(${-scrollPositionPx}px)`;
        const onEnd = () => {
            track.removeEventListener('transitionend', onEnd);
            // Remove transition to resume smooth RAF scrolling
            track.style.transition = 'none';
            startInfiniteScroll();
        };
        track.addEventListener('transitionend', onEnd);
    } else {
        startInfiniteScroll();
    }
}

// Function to copy text to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        // Use modern clipboard API
        navigator.clipboard.writeText(text).then(() => {
            console.log('Phone number copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy: ', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(text);
    }
}

// Fallback copy function for older browsers
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        console.log('Phone number copied to clipboard (fallback)');
    } catch (err) {
        console.error('Fallback copy failed: ', err);
    }
    
    document.body.removeChild(textArea);
}

// Function to show notification
function showNotification(message, type = 'info') {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Function to navigate to home page
function goToHome() {
    window.location.href = 'main_UI.html';
}

// Function to navigate to emergency page
function goToEmergency() {
    window.location.href = 'emergency.html';
}

// Function to navigate to concerns page
function goToConcerns() {
    window.location.href = 'concerns.html';
}

// Function to add click animation to call buttons (disabled)
function addCallButtonAnimations() {
    // Call button animations disabled - no action will be performed
    console.log('Call button animations disabled');
}

// Add CSS for ripple animation
function addRippleAnimation() {
    // CSS is now handled in hotline.css
    // This function is kept for compatibility but does nothing
    console.log('Ripple animation CSS is now handled in hotline.css');
}

// Function to add smooth scroll behavior
function addSmoothScroll() {
    document.documentElement.style.scrollBehavior = 'smooth';
}

// Function to add loading animation
function showLoading() {
    const loading = document.createElement('div');
    loading.id = 'loading-overlay';
    loading.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Loading...</p>
        </div>
    `;
    
    // CSS is now handled in hotline.css
    document.body.appendChild(loading);
}

// Function to hide loading animation
function hideLoading() {
    const loading = document.getElementById('loading-overlay');
    if (loading) {
        loading.remove();
    }
}

// Function to add keyboard shortcuts
function addKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Alt + H for Home
        if (e.altKey && e.key === 'h') {
            e.preventDefault();
            goToHome();
        }
        
        // Alt + E for Emergency
        if (e.altKey && e.key === 'e') {
            e.preventDefault();
            goToEmergency();
        }
        
        // Alt + C for Concerns
        if (e.altKey && e.key === 'c') {
            e.preventDefault();
            goToConcerns();
        }
    });
}

// Function to add touch feedback for mobile
function addTouchFeedback() {
    const touchElements = document.querySelectorAll('.directory-item, .action-btn, .call-btn');
    
    touchElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.95)';
        });
        
        element.addEventListener('touchend', function() {
            this.style.transform = '';
        });
    });
}

// Function to initialize all features
function initializeHotlinePage() {
    addRippleAnimation();
    addCallButtonAnimations();
    addSmoothScroll();
    addKeyboardShortcuts();
    addTouchFeedback();
    
    // Initialize carousel
    initializeCarousel();
    setupAutoPlayControls();
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    // Add fade-in animation to page
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
    
    console.log('Hotline Directory page initialized successfully');
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeHotlinePage);

// Add error handling for failed operations
window.addEventListener('error', function(e) {
    console.error('Error occurred:', e.error);
    showNotification('An error occurred. Please try again.', 'error');
});

// Add unhandled promise rejection handling
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showNotification('An error occurred. Please try again.', 'error');
});
