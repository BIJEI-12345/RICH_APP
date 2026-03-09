// Emergency Report JavaScript
document.addEventListener('DOMContentLoaded', function() {
    setupEmergencyForm();
    setupNavigation();
    setupHotlineRecommendation();
    
    // Check if reporter name is already filled (for page refreshes)
    const reporterField = document.getElementById('reporterName');
    if (!reporterField.value) {
        populateReporterName();
    }
});

// Get Philippine Time (UTC+8)
function getPhilippineTime() {
    const now = new Date();
    // Convert to Philippine Time (UTC+8)
    const philippineTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return philippineTime.toISOString();
}

// Setup emergency form
function setupEmergencyForm() {
    const form = document.getElementById('emergencyFormElement');
    if (form) {
        form.addEventListener('submit', handleEmergencySubmission);
    }
    
    // Setup emergency type dropdown change handler
    setupEmergencyTypeHandler();
    
    // Setup real-time validation clearing
    setupRealTimeValidation();
    
    // Auto-populate reporter name
    populateReporterName();
    
    // Initialize empty indicator for image preview container
    const imagePreview = document.getElementById('emergencyImagePreview');
    const imageContainer = imagePreview ? imagePreview.closest('.image-preview-container') : null;
    if (imageContainer && (!imagePreview || imagePreview.style.display === 'none' || !imagePreview.src)) {
        imageContainer.classList.add('empty');
    }
}

// Setup emergency type dropdown handler
function setupEmergencyTypeHandler() {
    const emergencyTypeSelect = document.getElementById('emergencyType');
    const otherEmergencyGroup = document.getElementById('otherEmergencyGroup');
    const otherEmergencyInput = document.getElementById('otherEmergencyType');
    const otherEmergencyRequiredIndicator = document.getElementById('otherEmergencyRequiredIndicator');
    
    if (emergencyTypeSelect && otherEmergencyGroup && otherEmergencyInput) {
        emergencyTypeSelect.addEventListener('change', function() {
            if (this.value === 'other') {
                otherEmergencyGroup.style.display = 'block';
                // Show required indicator when "Other" is selected
                if (otherEmergencyRequiredIndicator) {
                    otherEmergencyRequiredIndicator.style.display = 'inline';
                }
                otherEmergencyInput.required = true;
            } else {
                otherEmergencyGroup.style.display = 'none';
                otherEmergencyInput.value = ''; // Clear the value when hiding
                // Hide required indicator when other option is selected
                if (otherEmergencyRequiredIndicator) {
                    otherEmergencyRequiredIndicator.style.display = 'none';
                }
                otherEmergencyInput.required = false;
            }
        });
    }
}

    // Setup real-time validation clearing
    function setupRealTimeValidation() {
        // Get all form fields
        const emergencyType = document.getElementById('emergencyType');
        const location = document.getElementById('location');
        const landmark = document.getElementById('landmark');
        const description = document.getElementById('description');
        const otherEmergencyType = document.getElementById('otherEmergencyType');
        const emergencyImage = document.getElementById('emergencyImage');
        const emergencyCamera = document.getElementById('emergencyCamera');
    
    // Clear error when user selects emergency type
    if (emergencyType) {
        emergencyType.addEventListener('change', function() {
            clearFieldError(this);
        });
    }
    
    // Clear error when user types in location
    if (location) {
        location.addEventListener('input', function() {
            clearFieldError(this);
        });
    }
    
    // Clear error when user types in description
    if (description) {
        description.addEventListener('input', function() {
            clearFieldError(this);
        });
    }
    
    // Clear error when user types in other emergency type
    if (otherEmergencyType) {
        otherEmergencyType.addEventListener('input', function() {
            clearFieldError(this);
        });
    }
    
    // Clear error when user types in landmark
    if (landmark) {
        landmark.addEventListener('input', function() {
            clearFieldError(this);
        });
    }
    
    // Clear error when user selects image
    const emergencyImageUpload = document.getElementById('emergencyImageUpload');
    if (emergencyImageUpload) {
        emergencyImageUpload.addEventListener('change', function() {
            previewImage(this, 'emergencyImagePreview');
            // Show remove button
            const removeBtn = document.getElementById('emergencyRemoveImageBtn');
            if (removeBtn && this.files && this.files.length > 0) {
                removeBtn.style.display = 'flex';
            }
            clearFieldError(this); // Clear any validation errors when image is uploaded
            
            // Hide required indicator when image is uploaded
            const formGroup = this.closest('.form-group');
            if (formGroup) {
                const labelInGroup = formGroup.querySelector('label');
                if (labelInGroup) {
                    const requiredIndicator = labelInGroup.querySelector('.required-indicator');
                    if (requiredIndicator && this.files && this.files.length > 0) {
                        requiredIndicator.style.display = 'none';
                    } else if (requiredIndicator && (!this.files || this.files.length === 0)) {
                        requiredIndicator.style.display = 'inline';
                    }
                }
            }
        });
    }
}

// Open camera for emergency photo
window.openEmergencyCamera = function() {
    console.log('Opening camera for emergency photo...');
    
    const emergencyImageUpload = document.getElementById('emergencyImageUpload');
    if (!emergencyImageUpload) {
        console.error('Emergency image upload input not found');
        return;
    }
    
    // Clear any previous file selection
    emergencyImageUpload.value = '';
    
    // Detect mobile device
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Mobile device detected:', isMobile);
    
    // Set attributes for camera capture
    emergencyImageUpload.setAttribute('capture', 'environment');
    emergencyImageUpload.setAttribute('accept', 'image/*');
    
    // Remove existing change listener and add new one
    const newInput = emergencyImageUpload.cloneNode(false); // Don't clone event listeners
    newInput.setAttribute('id', 'emergencyImageUpload');
    newInput.setAttribute('name', 'emergencyImageUpload');
    newInput.setAttribute('type', 'file');
    newInput.setAttribute('accept', 'image/*');
    newInput.setAttribute('capture', 'environment');
    newInput.setAttribute('style', 'display:none');
    
    // Replace the old input with the new one
    emergencyImageUpload.parentNode.replaceChild(newInput, emergencyImageUpload);
    
    // Add event listener for camera capture
    newInput.addEventListener('change', function(e) {
        console.log('Camera capture triggered');
        const file = e.target.files[0];
        if (file) {
            console.log('File captured from camera:', file.name, file.type, file.size);
            previewImage(e.target, 'emergencyImagePreview');
            // Show remove button
            const removeBtn = document.getElementById('emergencyRemoveImageBtn');
            if (removeBtn) {
                removeBtn.style.display = 'flex';
            }
            // Clear any validation errors when image is uploaded
            const formGroup = e.target.closest('.form-group');
            if (formGroup) {
                const labelInGroup = formGroup.querySelector('label');
                if (labelInGroup) {
                    const requiredIndicator = labelInGroup.querySelector('.required-indicator');
                    if (requiredIndicator && e.target.files && e.target.files.length > 0) {
                        requiredIndicator.style.display = 'none';
                    }
                }
            }
        }
    });
    
    // Trigger camera
    setTimeout(() => {
        console.log('Triggering camera...');
        newInput.click();
    }, 100);
};

// Open file upload for emergency photo (without camera)
window.openEmergencyFileUpload = function() {
    console.log('Opening file upload for emergency photo...');
    
    let emergencyImageUpload = document.getElementById('emergencyImageUpload');
    if (!emergencyImageUpload) {
        console.error('Emergency image upload input not found');
        return;
    }
    
    // Store parent reference before replacing
    const parent = emergencyImageUpload.parentNode;
    if (!parent) {
        console.error('Parent node not found for emergency image upload');
        return;
    }
    
    // Create a new input element without capture attribute
    const newInput = document.createElement('input');
    newInput.id = 'emergencyImageUpload';
    newInput.name = 'emergencyImageUpload';
    newInput.type = 'file';
    newInput.accept = 'image/*';
    newInput.style.display = 'none';
    // Explicitly ensure no capture attribute
    if (newInput.hasAttribute('capture')) {
        newInput.removeAttribute('capture');
    }
    
    // Replace the old input with the new one
    try {
        parent.replaceChild(newInput, emergencyImageUpload);
        console.log('Input element replaced successfully');
    } catch (error) {
        console.error('Error replacing input element:', error);
        return;
    }
    
    // Add event listener for file selection
    newInput.addEventListener('change', function(e) {
        console.log('File selected for upload');
        const file = e.target.files[0];
        if (file) {
            console.log('File selected:', file.name, file.type, file.size);
            previewImage(e.target, 'emergencyImagePreview');
            // Show remove button
            const removeBtn = document.getElementById('emergencyRemoveImageBtn');
            if (removeBtn) {
                removeBtn.style.display = 'flex';
                console.log('Remove button displayed');
            }
            clearFieldError(e.target); // Clear any validation errors when image is uploaded
            
            // Hide required indicator when image is uploaded
            const formGroup = e.target.closest('.form-group');
            if (formGroup) {
                const labelInGroup = formGroup.querySelector('label');
                if (labelInGroup) {
                    const requiredIndicator = labelInGroup.querySelector('.required-indicator');
                    if (requiredIndicator && e.target.files && e.target.files.length > 0) {
                        requiredIndicator.style.display = 'none';
                    } else if (requiredIndicator && (!e.target.files || e.target.files.length === 0)) {
                        requiredIndicator.style.display = 'inline';
                    }
                }
            }
        }
    });
    
    // Trigger file picker with multiple attempts if needed
    setTimeout(() => {
        console.log('Triggering file picker...');
        try {
            newInput.click();
        } catch (error) {
            console.error('Error triggering file picker:', error);
            // Try again after a short delay
            setTimeout(() => {
                newInput.click();
            }, 100);
        }
    }, 100);
};

// Preview image function (same as concerns.js)
function previewImage(input, previewId) {
    const img = document.getElementById(previewId);
    const file = input.files[0];
    const container = img ? img.closest('.image-preview-container') : null;
    if (!img) return;
    if (file) {
        const reader = new FileReader();
        reader.onload = e => {
            img.src = e.target.result;
            img.style.display = 'block';
            // Show remove button
            if (previewId === 'emergencyImagePreview') {
                const removeBtn = document.getElementById('emergencyRemoveImageBtn');
                if (removeBtn) {
                    removeBtn.style.display = 'flex';
                }
            }
        };
        reader.readAsDataURL(file);
    } else {
        img.style.display = 'none';
        // Hide remove button
        if (previewId === 'emergencyImagePreview') {
            const removeBtn = document.getElementById('emergencyRemoveImageBtn');
            if (removeBtn) {
                removeBtn.style.display = 'none';
            }
        }
    }
}

// Remove emergency image
window.removeEmergencyImage = function() {
    const emergencyImageUpload = document.getElementById('emergencyImageUpload');
    const emergencyImagePreview = document.getElementById('emergencyImagePreview');
    const removeBtn = document.getElementById('emergencyRemoveImageBtn');
    
    if (emergencyImageUpload) {
        emergencyImageUpload.value = '';
    }
    
    if (emergencyImagePreview) {
        emergencyImagePreview.src = '';
        emergencyImagePreview.style.display = 'none';
    }
    
    if (removeBtn) {
        removeBtn.style.display = 'none';
    }
};

// Handle image preview display
function handleImagePreview(input) {
    const file = input.files[0];
    const imagePreview = document.getElementById('imagePreview');
    
    if (file) {
        // Check if file is an image
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // Create image element
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '200px';
                img.style.borderRadius = '8px';
                img.style.objectFit = 'cover';
                
                // Clear previous content and add image
                imagePreview.innerHTML = '';
                imagePreview.appendChild(img);
                
                // Add click functionality to change image
                imagePreview.style.cursor = 'pointer';
                imagePreview.onclick = function() {
                    input.click();
                };
            };
            
            reader.readAsDataURL(file);
        } else {
            alert('Please select a valid image file.');
            input.value = ''; // Clear the input
        }
    }
}

// Function to populate reporter name from user profile
function populateReporterName() {
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || 'test@example.com';
    const reporterNameField = document.getElementById('reporterName');
    
    if (!reporterNameField) return;
    
    if (userEmail && userEmail !== 'test@example.com') {
        // Get user name from resident_information table
        fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: userEmail })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.user) {
                const fullName = `${data.user.first_name} ${data.user.last_name}`.trim();
                reporterNameField.value = fullName;
            } else {
                reporterNameField.value = 'Unknown User';
            }
        })
        .catch(error => {
            console.error('Error fetching user name:', error);
            reporterNameField.value = 'Unknown User';
        });
    } else {
        reporterNameField.value = 'Unknown User';
    }
}

// Setup navigation
function setupNavigation() {
    // Navigation is now handled by onclick in HTML
    console.log('Navigation setup complete');
}

// Set current date and time
// Removed explicit date-time input initialization; timestamp is captured at submit

// Handle emergency form submission
async function handleEmergencySubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Clear previous validation errors
    clearValidationErrors();
    
    // Validate required fields with custom messages
    let isValid = true;
    
    // Validate Emergency Type
    const emergencyType = document.getElementById('emergencyType');
    if (!emergencyType.value) {
        showFieldError(emergencyType, 'Please select an emergency type.');
        isValid = false;
    }
    
    // Validate Location
    const location = document.getElementById('location');
    if (!location.value.trim()) {
        showFieldError(location, 'Please enter the location.');
        isValid = false;
    }
    
    // Validate Landmark
    const landmark = document.getElementById('landmark');
    if (!landmark.value.trim()) {
        showFieldError(landmark, 'Please enter a landmark or reference point.');
        isValid = false;
    }
    
    // Validate Description
    const description = document.getElementById('description');
    if (!description.value.trim()) {
        showFieldError(description, 'Please provide a description of the emergency.');
        isValid = false;
    }
    
    // Validate Other Emergency Type if "Other" is selected
    if (emergencyType.value === 'other') {
        const otherEmergencyType = document.getElementById('otherEmergencyType');
        if (!otherEmergencyType.value.trim()) {
            showFieldError(otherEmergencyType, 'Please specify the emergency type.');
            isValid = false;
        }
    }
    
    // Image upload is optional (UI only)
    
    if (!isValid) {
        // Scroll to the first error field
        const firstErrorField = document.querySelector('.error');
        if (firstErrorField) {
            firstErrorField.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
        return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    try {
        // Get user email from session/local storage
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || 'test@example.com';
        
        // Determine emergency type (use custom value if "other" is selected)
        let emergencyType = formData.get('emergencyType');
        if (emergencyType === 'other') {
            const otherType = formData.get('otherEmergencyType');
            if (otherType && otherType.trim()) {
                emergencyType = otherType.trim();
            } else {
                showMessage('Please specify the emergency type when selecting "Other".', 'error');
                return;
            }
        }
        
        // Handle image upload (optional)
        let imageData = null;
        const imageInput = document.getElementById('emergencyImageUpload');
        if (imageInput.files && imageInput.files[0]) {
            const file = imageInput.files[0];
            const reader = new FileReader();
            imageData = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result.split(',')[1]); // Remove data:image/...;base64, prefix
                reader.readAsDataURL(file);
            });
        }
        
        // Prepare data for submission
        const submissionData = {
            emergency_type: emergencyType,
            user_email: userEmail,
            date_and_time: getPhilippineTime(),
            description: formData.get('description'),
            location: formData.get('location'),
            landmark: formData.get('landmark'),
            image_data: imageData
        };
        
        // Debug: Log submission data
        console.log('Submitting emergency report:', submissionData);
        
        // Submit to PHP backend
        const response = await fetch('php/emergency.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            // Display the submitted report
            displayEmergencyReport(formData, result.report_id);
            
            // Hide form and show report display
            document.querySelector('.form-container').style.display = 'none';
            document.getElementById('reportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('reportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('Emergency report submitted successfully!', 'success');
        } else {
            // For debugging: Show summary even if database insert fails
            console.log('Database insert failed, but showing summary for debugging');
            displayEmergencyReport(formData, 'DEBUG');
            
            // Hide form and show report display
            document.querySelector('.form-container').style.display = 'none';
            document.getElementById('reportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('reportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('Emergency report form submitted (Database error: ' + result.message + ')', 'error');
        }
        
    } catch (error) {
        console.error('Error submitting emergency report:', error);
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        showMessage('Check your internet connection and try again.', 'error');
    }
}

// Display emergency report
function displayEmergencyReport(formData, reportId = null) {
    // Format emergency type
    let emergencyType = formData.get('emergencyType');
    if (emergencyType === 'other') {
        emergencyType = formData.get('otherEmergencyType') || 'Other';
    }
    const emergencyTypeDisplay = emergencyType.charAt(0).toUpperCase() + emergencyType.slice(1).replace('-', ' ');
    
    // Format date and time
    // Capture current timestamp for submission and display
    const dateTimeObj = new Date();
    const formattedDateTime = dateTimeObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
    
    // Update display elements
    document.getElementById('displayEmergencyType').textContent = emergencyTypeDisplay.toUpperCase();
    document.getElementById('displayLocation').textContent = formData.get('location');
    document.getElementById('displayLandmark').textContent = formData.get('landmark') || 'Not specified';
    document.getElementById('displayReporter').textContent = formData.get('reporterName');
    document.getElementById('displayDateTime').textContent = formattedDateTime;
    document.getElementById('displayDescription').textContent = formData.get('description');
    
    // Display uploaded image
    const emergencyImageUpload = document.getElementById('emergencyImageUpload');
    const imageCard = document.getElementById('imageCard');
    const displayImage = document.getElementById('displayEmergencyImage');
    
    let imageFile = null;
    if (emergencyImageUpload.files.length > 0) {
        imageFile = emergencyImageUpload.files[0];
    }
    
    if (imageFile) {
        const reader = new FileReader();
        reader.onload = function(e) {
            displayImage.src = e.target.result;
            displayImage.alt = 'Emergency Image';
            imageCard.style.display = 'block';
        };
        reader.readAsDataURL(imageFile);
    } else {
        imageCard.style.display = 'none';
    }
}

// Go back to form
function goBackToForm() {
    document.querySelector('.form-container').style.display = 'block';
    document.getElementById('reportDisplay').style.display = 'none';
    
    // Reset form
    document.getElementById('emergencyFormElement').reset();
    
    // Reset image preview
    const emergencyImagePreview = document.getElementById('emergencyImagePreview');
    if (emergencyImagePreview) {
        emergencyImagePreview.style.display = 'none';
        emergencyImagePreview.src = '';
    }
    
    // Auto-populate reporter name again after a short delay
    setTimeout(() => {
        populateReporterName();
    }, 100);
    
    // Scroll to top of form
    document.querySelector('.form-container').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// Go to home
function goToHome() {
    window.location.href = 'main_UI.html';
}

// Show field error
function showFieldError(field, message) {
    // Remove existing error for this field
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Add error styling to field
    field.classList.add('error');
    
    // For file uploads, show error near the upload button
    if (field.type === 'file') {
        const uploadBtn = field.parentNode.querySelector('.upload-btn');
        if (uploadBtn) {
            uploadBtn.classList.add('error-indicator');
            // Insert error message after the upload button
            const errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            errorDiv.textContent = message;
            uploadBtn.parentNode.insertBefore(errorDiv, uploadBtn.nextSibling);
        } else {
            // Fallback: insert after the field
            const errorDiv = document.createElement('div');
            errorDiv.className = 'field-error';
            errorDiv.textContent = message;
            field.parentNode.insertBefore(errorDiv, field.nextSibling);
        }
    } else {
        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error';
        errorDiv.textContent = message;
        
        // Insert error message after the field
        field.parentNode.insertBefore(errorDiv, field.nextSibling);
        
        // Focus on the field
        field.focus();
    }
}

// Clear field error for a specific field
function clearFieldError(field) {
    // Remove error styling from field
    field.classList.remove('error');
    
    // For file uploads, also remove error indicator from upload button
    if (field.type === 'file') {
        const uploadBtn = field.parentNode.querySelector('.upload-btn');
        if (uploadBtn) {
            uploadBtn.classList.remove('error-indicator');
        }
    }
    
    // Remove error message for this field
    const errorMessage = field.parentNode.querySelector('.field-error');
    if (errorMessage) {
        errorMessage.remove();
    }
}

// Clear all validation errors
function clearValidationErrors() {
    // Remove all error messages
    const errorMessages = document.querySelectorAll('.field-error');
    errorMessages.forEach(msg => msg.remove());
    
    // Remove error styling from all fields
    const errorFields = document.querySelectorAll('.error');
    errorFields.forEach(field => field.classList.remove('error'));
}

// Show message
function showMessage(message, type) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.success-message, .error-message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
    messageDiv.textContent = message;
    
    // Insert at the top of the form
    const form = document.getElementById('emergencyFormElement');
    form.insertBefore(messageDiv, form.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Setup hotline recommendation
function setupHotlineRecommendation() {
    const emergencyTypeSelect = document.getElementById('emergencyType');
    const descriptionField = document.getElementById('description');
    const hotlineSection = document.getElementById('hotlineRecommendations');
    
    // Show recommendations when emergency type is selected
    if (emergencyTypeSelect) {
        emergencyTypeSelect.addEventListener('change', function() {
            if (this.value) {
                loadHotlineRecommendations(this.value, descriptionField.value);
            } else {
                hotlineSection.style.display = 'none';
            }
        });
    }
    
    // Update recommendations when description changes (debounced)
    let descriptionTimeout;
    if (descriptionField) {
        descriptionField.addEventListener('input', function() {
            clearTimeout(descriptionTimeout);
            const emergencyType = emergencyTypeSelect?.value;
            if (emergencyType) {
                descriptionTimeout = setTimeout(() => {
                    loadHotlineRecommendations(emergencyType, this.value);
                }, 1000); // Wait 1 second after user stops typing
            }
        });
    }
}

// Load hotline recommendations
async function loadHotlineRecommendations(emergencyType, description = '') {
    const hotlineSection = document.getElementById('hotlineRecommendations');
    const hotlineContainer = document.getElementById('hotlineContainer');
    
    if (!hotlineSection || !hotlineContainer) return;
    
    // Show loading state
    hotlineSection.style.display = 'block';
    hotlineContainer.innerHTML = '<div class="hotline-loading">Analyzing emergency type...</div>';
    
    try {
        const response = await fetch('php/emergency_hotline_recommendation.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                emergency_type: emergencyType,
                description: description
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.hotlines && data.hotlines.length > 0) {
            displayHotlines(data.hotlines);
        } else {
            hotlineContainer.innerHTML = '<div class="hotline-error">Unable to load recommendations. Please call 911 for emergencies.</div>';
        }
    } catch (error) {
        console.error('Error loading hotline recommendations:', error);
        hotlineContainer.innerHTML = '<div class="hotline-error">Unable to load recommendations. Please call 911 for emergencies.</div>';
    }
}

// Function to make a call - opens phone dialer on mobile devices
function makeCall(phoneNumber) {
    // Remove any non-digit characters except + for international numbers
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    // Use tel: protocol to open phone dialer
    window.location.href = `tel:${cleanNumber}`;
}

// Display hotlines
function displayHotlines(hotlines) {
    const hotlineContainer = document.getElementById('hotlineContainer');
    if (!hotlineContainer) return;
    
    hotlineContainer.innerHTML = '';
    
    hotlines.forEach((hotline, index) => {
        const hotlineCard = document.createElement('div');
        hotlineCard.className = 'hotline-card';
        if (index === 0) {
            hotlineCard.classList.add('hotline-primary');
        }
        
        // Clean phone number for tel: link (remove spaces and dashes)
        const cleanNumber = hotline.number.replace(/[\s-]/g, '');
        
        // Make entire card clickable for mobile
        hotlineCard.style.cursor = 'pointer';
        hotlineCard.onclick = function() {
            makeCall(hotline.number);
        };
        
        hotlineCard.innerHTML = `
            <div class="hotline-header">
                <i class="fas fa-phone-alt"></i>
                <div class="hotline-info">
                    <div class="hotline-name">${hotline.name}</div>
                    <div class="hotline-number">
                        <a href="tel:${cleanNumber}" onclick="event.stopPropagation(); return false;">${hotline.number}</a>
                    </div>
                </div>
            </div>
            <div class="hotline-description">${hotline.description}</div>
        `;
        
        hotlineContainer.appendChild(hotlineCard);
    });
}
