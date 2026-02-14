// Email Verification Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const verificationCodeInput = document.getElementById('verificationCode');
    const userEmailElement = document.getElementById('userEmail');
    let countdownElement = document.getElementById('countdown');
    const verifyBtn = document.querySelector('.verify-btn');
    const resendSection = document.querySelector('.resend-section');

    // Get email from URL parameters or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email') || localStorage.getItem('registrationEmail') || 'user@example.com';
    
    // Set email in the page
    if (userEmailElement) {
        userEmailElement.textContent = email;
    }

    // Timer variables
    let countdownTimer;
    let timeLeft = 180; // 3 minutes

    // Start countdown timer
    function startCountdown() {
        countdownTimer = setInterval(() => {
            timeLeft--;
            
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            if (countdownElement) {
                countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            if (timeLeft <= 0) {
                clearInterval(countdownTimer);
                showResendButton();
            }
        }, 1000);
    }

    // Show resend button
    function showResendButton() {
        if (resendSection) {
            resendSection.innerHTML = `
                <p class="resend-timer">Didn't receive the code?</p>
                <button class="resend-btn" onclick="resendCode()">Resend code</button>
            `;
        }
    }

    // Clear code input
    window.clearCode = function() {
        if (verificationCodeInput) {
            verificationCodeInput.value = '';
            verificationCodeInput.focus();
        }
    };


    // Resend verification code
    window.resendCode = function() {
        const resendBtn = document.querySelector('.resend-btn');
        if (resendBtn) {
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending...';
        }

        // Send resend request to PHP backend
        fetch('php/resend_verification.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Verification code sent successfully!');
                // Reset timer
                timeLeft = 180;
                resendSection.innerHTML = `
                    <p class="resend-timer">Resend code in <span id="countdown">3:00</span> seconds...</p>
                `;
                countdownElement = document.getElementById('countdown');
                startCountdown();
            } else {
                alert(data.message || 'Failed to resend code. Please try again.');
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend code';
                }
            }
        })
        .catch(error => {
            console.error('Resend error:', error);
            alert('Network error. Please try again.');
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend code';
            }
        });
    };

    // Verify code
    window.verifyCode = function() {
        const code = verificationCodeInput.value.trim();
        
        // Clear previous errors
        clearError();
        
        // Validate code
        if (!code) {
            showError('Please enter the verification code');
            return;
        }
        
        if (code.length !== 6) {
            showError('Please enter a valid 6-digit code');
            return;
        }
        
        if (!/^\d{6}$/.test(code)) {
            showError('Code must contain only numbers');
            return;
        }
        
        // Show loading state
        if (verifyBtn) {
            verifyBtn.classList.add('loading');
            verifyBtn.textContent = 'Verifying...';
            verifyBtn.disabled = true;
        }
        
        // Send verification request to PHP backend
        fetch('php/verify_email.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                code: code
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showSuccess('Email verified successfully!');
                
                // Store email for MPIN page
                sessionStorage.setItem('registration_email', email);
                
                // Redirect to next step or dashboard
                setTimeout(() => {
                    window.location.href = 'mpin_password.html?email=' + encodeURIComponent(email); // Redirect to MPIN setup
                }, 1500);
            } else {
                showError(data.message || 'Invalid verification code');
            }
        })
        .catch(error => {
            console.error('Verification error:', error);
            showError('Network error. Please try again.');
        })
        .finally(() => {
            // Reset button
            if (verifyBtn) {
                verifyBtn.classList.remove('loading');
                verifyBtn.textContent = 'Verify Code';
                verifyBtn.disabled = false;
            }
        });
    };

    // Show error message
    function showError(message) {
        clearError();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        if (verificationCodeInput && verificationCodeInput.parentNode) {
            verificationCodeInput.parentNode.appendChild(errorDiv);
            verificationCodeInput.classList.add('error');
        }
    }

    // Show success message
    function showSuccess(message) {
        clearError();
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        if (verificationCodeInput && verificationCodeInput.parentNode) {
            verificationCodeInput.parentNode.appendChild(successDiv);
        }
    }

    // Clear error
    function clearError() {
        if (verificationCodeInput && verificationCodeInput.parentNode) {
            const existingError = verificationCodeInput.parentNode.querySelector('.error-message');
            const existingSuccess = verificationCodeInput.parentNode.querySelector('.success-message');
            
            if (existingError) {
                existingError.remove();
            }
            if (existingSuccess) {
                existingSuccess.remove();
            }
        }
        
        if (verificationCodeInput) {
            verificationCodeInput.classList.remove('error');
        }
    }

    // Navigation functions
    window.goBack = function() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'create_account1.html';
        }
    };

    // Auto-format code input (only numbers)
    if (verificationCodeInput) {
        verificationCodeInput.addEventListener('input', function() {
            // Remove non-numeric characters
            this.value = this.value.replace(/\D/g, '');
            
            // Limit to 6 digits
            if (this.value.length > 6) {
                this.value = this.value.substring(0, 6);
            }
            
            // Clear error when user starts typing
            clearError();
            
            // Auto-submit when 6 digits are entered
            if (this.value.length === 6) {
                setTimeout(() => {
                    verifyCode();
                }, 500);
            }
        });
    }

    // Focus management
    if (verificationCodeInput) {
        verificationCodeInput.addEventListener('focus', function() {
            if (this.parentNode) {
                this.parentNode.style.transform = 'scale(1.02)';
            }
        });

        verificationCodeInput.addEventListener('blur', function() {
            if (this.parentNode) {
                this.parentNode.style.transform = 'scale(1)';
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeElement = document.activeElement;
            if (activeElement === verificationCodeInput) {
                e.preventDefault();
                verifyCode();
            }
        }
    });

    // Start countdown on page load
    startCountdown();

    // Focus on code input
    verificationCodeInput.focus();
});

// Add smooth transitions for input groups
const style = document.createElement('style');
style.textContent = `
    .input-container {
        transition: transform 0.2s ease;
    }
    
    .error-message, .success-message {
        animation: slideDown 0.3s ease;
    }
    
    @keyframes slideDown {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(style);
