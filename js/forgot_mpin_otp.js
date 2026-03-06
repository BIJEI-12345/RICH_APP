// Forgot MPIN OTP Functionality
document.addEventListener('DOMContentLoaded', function() {
    const emailDisplay = document.getElementById('emailDisplay');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    
    // Get email from sessionStorage (from login page)
    const loginEmail = sessionStorage.getItem('loginEmail');
    
    // Check if email exists
    if (!loginEmail) {
        // Redirect back to login if no email found
        window.location.href = 'index.php';
        return;
    }
    
    // Display email
    emailDisplay.textContent = loginEmail;
    
    // Function to show error
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }
    
    // Function to show success
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }
    
    // Function to hide messages
    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }
    
    // Send OTP
    window.sendOTP = function() {
        hideMessages();
        
        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        submitBtn.classList.add('loading');
        
        // Send request to PHP backend
        fetch('php/forgot_mpin_send_otp.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: loginEmail
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showSuccess('OTP sent successfully! Redirecting...');
                // Store email in sessionStorage for next page
                sessionStorage.setItem('forgotMpinEmail', loginEmail);
                // Redirect to OTP verification page after short delay
                setTimeout(() => {
                    window.location.href = 'forgot_mpin_verify_otp.html';
                }, 1500);
            } else {
                showError(data.message || 'Failed to send OTP. Please try again.');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send OTP';
                submitBtn.classList.remove('loading');
            }
        })
        .catch(error => {
            console.error('Send OTP error:', error);
            showError('Network error. Please check your connection and try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send OTP';
            submitBtn.classList.remove('loading');
        });
    };
    
    // Go back
    window.goBack = function() {
        window.location.href = 'mpin_login.html';
    };
});

