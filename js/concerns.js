// Location via GPS functionality removed

document.addEventListener('DOMContentLoaded', function() {
    setupConcernForm();
    autoPopulateReporter();
    setupContactValidation();
    
    // Check if reporter name is already filled (for page refreshes)
    const reporterField = document.getElementById('cfReporter');
    if (!reporterField.value) {
        autoPopulateReporter();
    }
    
});

function setupConcernForm() {
    const form = document.getElementById('concernFormElement');
    if (!form) return;

    form.addEventListener('submit', handleConcernSubmission);
}

// Setup contact field validation to only allow numbers
function setupContactValidation() {
    const contactField = document.getElementById('cfContact');
    if (!contactField) return;

    // Prevent non-numeric input
    contactField.addEventListener('input', function(e) {
        // Remove any non-numeric characters
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    // Prevent pasting non-numeric content
    contactField.addEventListener('paste', function(e) {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const numericOnly = paste.replace(/[^0-9]/g, '');
        e.target.value = numericOnly;
    });

    // Prevent non-numeric key presses
    contactField.addEventListener('keypress', function(e) {
        const char = String.fromCharCode(e.which);
        if (!/[0-9]/.test(char)) {
            e.preventDefault();
        }
    });
}

// Get Philippine Time (UTC+8)
function getPhilippineTime() {
    const now = new Date();
    // Convert to Philippine Time (UTC+8)
    const philippineTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return philippineTime.toISOString();
}

// Auto-populate reporter name from logged-in user
async function autoPopulateReporter() {
    try {
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || 'test@example.com';
        
        // Get user name from resident_information table
        const response = await fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: userEmail
            })
        });
        
        const result = await response.json();
        if (result.success && result.user) {
            const fullName = `${result.user.first_name} ${result.user.last_name}`.trim();
            document.getElementById('cfReporter').value = fullName;
        } else {
            document.getElementById('cfReporter').value = 'Unknown User';
        }
    } catch (error) {
        console.error('Error auto-populating reporter:', error);
        document.getElementById('cfReporter').value = 'Unknown User';
    }
}

// Handle concern form submission
async function handleConcernSubmission(e) {
        e.preventDefault();

    const form = e.target;
        const formData = new FormData(form);

    // Validate required fields
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = '#dc3545';
        } else {
            field.style.borderColor = '#e9ecef';
        }
    });
    
    if (!isValid) {
        return;
    }
    
    // Validate contact number length
    const contactNumber = formData.get('cfContact');
    if (contactNumber && contactNumber.length > 11) {
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
        
        // Handle image upload (optional)
        let imageData = null;
        const imageInput = document.getElementById('cfImageUpload');
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
            user_email: userEmail,
            contact: formData.get('cfContact'),
            date_and_time: getPhilippineTime(),
            location: formData.get('cfLocation'),
            statement: formData.get('cfStatement'),
            image_data: imageData
        };
        
        // Debug: Log submission data
        console.log('Submitting concern:', submissionData);
        
        // Submit to PHP backend
        const response = await fetch('php/concerns.php', {
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
            // Display the submitted concern
            displayConcern(formData, result.concern_id);
            
            // Hide form and show report display
            document.querySelector('.form-container').style.display = 'none';
            document.getElementById('cfReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('cfReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        } else {
            // For debugging: Show summary even if database insert fails
            console.log('Database insert failed, but showing summary for debugging');
            displayConcern(formData, 'DEBUG');
            
            // Hide form and show report display
            document.querySelector('.form-container').style.display = 'none';
            document.getElementById('cfReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('cfReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            // Database error occurred but form was processed
        }
        
    } catch (error) {
        console.error('Error submitting concern:', error);
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        // Network error occurred
    }
}

// Display concern summary
function displayConcern(formData, concernId) {
        const imageInput = document.getElementById('cfImageUpload');
        const imgWrap = document.getElementById('cfDisplayImageWrap');
        const img = document.getElementById('cfDisplayImage');

        if (imageInput.files && imageInput.files[0]) {
            const reader = new FileReader();
            reader.onload = e2 => {
                img.src = e2.target.result;
                imgWrap.style.display = 'block';
            };
            reader.readAsDataURL(imageInput.files[0]);
        } else {
            imgWrap.style.display = 'none';
        }

        document.getElementById('cfDisplayReporter').textContent = formData.get('cfReporter');
        document.getElementById('cfDisplayContact').textContent = formData.get('cfContact');
        document.getElementById('cfDisplayLocation').textContent = formData.get('cfLocation');
        document.getElementById('cfDisplayStatement').textContent = formData.get('cfStatement');

        const now = new Date();
        document.getElementById('cfDisplayDateTime').textContent = now.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true
        });
}

function previewImage(input, previewId) {
    const img = document.getElementById(previewId);
    const file = input.files[0];
    if (!img) return;
    if (file) {
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; img.style.display = 'block'; };
        reader.readAsDataURL(file);
    } else {
        img.style.display = 'none';
    }
}

function cfSubmitAnother() {
    // Reset the form
    document.getElementById('concernFormElement').reset();
    document.getElementById('cfImagePreview').style.display = 'none';
    
    // Auto-populate reporter name again after a short delay
    setTimeout(() => {
        autoPopulateReporter();
    }, 100);
    
    // Show form and hide display
    document.querySelector('.form-container').style.display = 'block';
    document.getElementById('cfReportDisplay').style.display = 'none';
}

function goToHome() {
    window.location.href = 'main_UI.html';
}

// GPS getCurrentLocation() and related helpers removed

// Show location help dialog
function showLocationHelp() {
    const helpMessage = `
        <div style="text-align: left; line-height: 1.6;">
            <h3 style="margin-bottom: 15px; color: #2c5aa0;">📍 Location Help</h3>
            <p><strong>Option 1:</strong> Click the GPS button (📍) to automatically detect your location</p>
            <p><strong>Option 2:</strong> Manually type your location (e.g., "Barangay Hall, Quezon City")</p>
            <p><strong>Option 3:</strong> Enter coordinates if GPS shows them (e.g., "14.5995, 120.9842")</p>
            <br>
            <p style="color: #666; font-size: 0.9em;">
                <strong>Note:</strong> If GPS shows coordinates instead of an address, 
                you can still submit your concern. The coordinates will help locate your issue.
            </p>
        </div>
    `;
    
    showMessage(helpMessage, 'info');
}

// Enhanced show message function to handle HTML content
function showMessage(message, type) {
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // Check if message contains HTML
    if (message.includes('<')) {
        messageDiv.innerHTML = message;
    } else {
        messageDiv.textContent = message;
    }
    
    // Style the message
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        max-width: 400px;
        word-wrap: break-word;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    if (type === 'success') {
        messageDiv.style.backgroundColor = '#28a745';
    } else if (type === 'error') {
        messageDiv.style.backgroundColor = '#dc3545';
    } else if (type === 'info') {
        messageDiv.style.backgroundColor = '#17a2b8';
        messageDiv.style.color = 'white';
    }
    
    // Add to page
    document.body.appendChild(messageDiv);
    
    // Remove after 8 seconds for info messages, 5 seconds for others
    const timeout = type === 'info' ? 8000 : 5000;
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, timeout);
}

