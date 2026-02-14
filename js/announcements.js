// News & Article Page JavaScript

// Global variables for swipe navigation
let allAnnouncements = [];
let currentDetailIndex = -1;

// Function to go back to main page
function goBack() {
    window.location.href = 'main_UI.html';
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

// Function to create announcement card HTML
function createAnnouncementCard(announcement) {
    const imageSrc = announcement.image ? announcement.image : 'Images/brgyHall.jpg';
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
    
    // Format timestamp to match image style (e.g., "15mins", "1hr", "2hrs")
    let timestamp = announcement.days_ago || '1hr';
    if (timestamp.includes('day')) {
        const days = timestamp.match(/\d+/);
        if (days) {
            timestamp = days[0] + 'd';
        }
    } else if (timestamp.includes('hour')) {
        const hours = timestamp.match(/\d+/);
        if (hours) {
            timestamp = hours[0] + 'hr';
        }
    } else if (timestamp.includes('minute')) {
        const minutes = timestamp.match(/\d+/);
        if (minutes) {
            timestamp = minutes[0] + 'mins';
        }
    }
    
    const defaultImage = 'Images/brgyHall.jpg';
    
    return `
        <div class="full-announcement-card">
            <div class="announcement-image-container">
                <img src="${imageSrc}" alt="${imageAlt}" class="announcement-image"
                     onerror="this.onerror=null; this.src='${defaultImage}';">
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
    
    if (announcements.length === 0) {
        // Show no announcements message
        noAnnouncements.style.display = 'block';
    } else {
        // Hide no announcements message
        noAnnouncements.style.display = 'none';
        
        // Create and insert announcement cards
        const cardsHTML = announcements.map(announcement => createAnnouncementCard(announcement)).join('');
        container.insertAdjacentHTML('beforeend', cardsHTML);
        
        // Add click event listeners to announcement cards
        const cards = container.querySelectorAll('.full-announcement-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 0.1}s`;
            
            // Add click event listener to show detail view
            card.addEventListener('click', function(e) {
                const announcementIndex = Array.from(cards).indexOf(card);
                currentDetailIndex = announcementIndex;
                showAnnouncementDetail(announcements[announcementIndex]);
            });
        });
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
    
    // Set timestamp
    let timestamp = announcement.days_ago || '1hr';
    if (timestamp.includes('day')) {
        const days = timestamp.match(/\d+/);
        if (days) {
            timestamp = days[0] + 'd';
        }
    } else if (timestamp.includes('hour')) {
        const hours = timestamp.match(/\d+/);
        if (hours) {
            timestamp = hours[0] + 'hr';
        }
    } else if (timestamp.includes('minute')) {
        const minutes = timestamp.match(/\d+/);
        if (minutes) {
            timestamp = minutes[0] + 'mins';
        }
    }
    
    document.getElementById('detail-timestamp').textContent = timestamp;
    document.getElementById('detail-title').textContent = announcement.title || 'No Title';
    
    // Set date information
    // "Posted on:" - use created_at date
    const postedDate = announcement.formatted_created_date || announcement.formatted_date || 'Not specified';
    document.getElementById('detail-date').textContent = postedDate;
    
    // "Time posted:" - use created_at time (PH time)
    const createdTime = announcement.formatted_created_time || 'Not specified';
    document.getElementById('detail-time').textContent = createdTime;
    
    // "When:" - use date_and_time (full date and time)
    const whenDate = announcement.formatted_when || announcement.date_and_time || 'Not specified';
    document.getElementById('detail-duration').textContent = whenDate;
    
    // Set description
    document.getElementById('detail-description').textContent = announcement.description || announcement.content || 'No description available.';
    
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
                        }, 400);
                    }, 200);
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
    
    // Populate detail view with announcement data
    populateAnnouncementDetail(announcement);
    
    // Initialize swipe functionality
    setupDetailSwipe();
    
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
                // Slide in from left
                detailContainer.classList.add('slide-in-left');
                
                // Scroll to top
                document.getElementById('announcement-detail-section').scrollIntoView({ behavior: 'smooth' });
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    detailContainer.classList.remove('slide-in-left');
                }, 400);
            }, 200);
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
                // Slide in from right
                detailContainer.classList.add('slide-in-right');
                
                // Scroll to top
                document.getElementById('announcement-detail-section').scrollIntoView({ behavior: 'smooth' });
                
                // Remove animation class after animation completes
                setTimeout(() => {
                    detailContainer.classList.remove('slide-in-right');
                }, 400);
            }, 200);
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
            // Always go to next announcement on swipe
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
                        }, 400);
                    }, 200);
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
            // Always go to next announcement on swipe
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
                        }, 400);
                    }, 200);
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
    
    if (navigator.share) {
        navigator.share({
            title: title,
            text: description,
            url: window.location.href
        }).catch(err => console.log('Error sharing:', err));
    } else {
        // Fallback for browsers that don't support Web Share API
        const shareText = `${title}\n\n${description}\n\nShared from RICH App`;
        navigator.clipboard.writeText(shareText).then(() => {
            alert('Announcement details copied to clipboard!');
        }).catch(() => {
            alert('Share functionality not available in this browser.');
        });
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
    
    // Fetch and display announcements
    const announcements = await fetchAnnouncements();
    displayAnnouncements(announcements);
    
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
