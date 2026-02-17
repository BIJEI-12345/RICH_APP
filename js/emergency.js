// Emergency Report JavaScript
document.addEventListener('DOMContentLoaded', function() {
    setupEmergencyForm();
    setupNavigation();
    
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
        };
        reader.readAsDataURL(file);
    } else {
        img.style.display = 'none';
    }
}

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
        
        showMessage('Network error. Please try again.', 'error');
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
