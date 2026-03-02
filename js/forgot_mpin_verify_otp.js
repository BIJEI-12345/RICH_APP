// Forgot MPIN OTP Verification Functionality
document.addEventListener('DOMContentLoaded', function() {
    const otpInputs = document.querySelectorAll('.otp-digit');
    const verifyBtn = document.getElementById('verifyBtn');
    const errorMessage = document.getElementById('errorMessage');
    const emailDisplay = document.getElementById('emailDisplay');
    const resendSection = document.getElementById('resendSection');
    
    // Get email from sessionStorage
    const email = sessionStorage.getItem('forgotMpinEmail');
    
    // Check if email exists
    if (!email) {
        // Redirect back to forgot MPIN page
        window.location.href = 'forgot_mpin_otp.html';
        return;
    }
    
    // Display email
    emailDisplay.textContent = email;
    
    // Timer variables for resend
    let countdownTimer;
    let timeLeft = 60; // 1 minute
    let countdownElement = document.getElementById('countdown');
    
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
                <button class="resend-btn" onclick="resendOTP()">Resend code</button>
            `;
        }
    }
    
    // Resend OTP
    window.resendOTP = function() {
        const resendBtn = document.querySelector('.resend-btn');
        if (resendBtn) {
            resendBtn.disabled = true;
            resendBtn.textContent = 'Sending...';
        }
        
        // Send resend request to PHP backend
        fetch('php/forgot_mpin_send_otp.php', {
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
                // Reset timer
                timeLeft = 60;
                resendSection.innerHTML = `
                    <p class="resend-timer">Resend code in <span id="countdown">1:00</span></p>
                `;
                countdownElement = document.getElementById('countdown');
                startCountdown();
                
                // Show success message
                hideError();
                errorMessage.style.display = 'none';
            } else {
                showError(data.message || 'Failed to resend code. Please try again.');
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend code';
                }
            }
        })
        .catch(error => {
            console.error('Resend error:', error);
            showError('Network error. Please check your connection and try again.');
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend code';
            }
        });
    };
    
    // Start countdown on page load
    startCountdown();
    
    // OTP input handling
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d$/.test(value)) {
                e.target.value = '';
                input.classList.remove('filled');
                return;
            }
            
            // Add filled class for styling
            if (value) {
                input.classList.add('filled');
            } else {
                input.classList.remove('filled');
            }
            
            // Move to next input
            if (value && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
            
            // Update button state
            updateVerifyButton();
            
            // Auto-verify when complete
            const otpValue = getOTPValue();
            if (otpValue.length === 6) {
                setTimeout(() => {
                    verifyOTP();
                }, 100);
            }
        });
        
        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace') {
                if (!e.target.value && index > 0) {
                    otpInputs[index - 1].focus();
                    otpInputs[index - 1].value = '';
                    otpInputs[index - 1].classList.remove('filled');
                } else if (e.target.value) {
                    e.target.value = '';
                    e.target.classList.remove('filled');
                }
                updateVerifyButton();
            }
            
            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                otpInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }
        });
        
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text');
            const digits = pastedData.replace(/\D/g, '').slice(0, 6);
            
            // Fill inputs with pasted digits
            digits.split('').forEach((digit, i) => {
                if (i < otpInputs.length) {
                    otpInputs[i].value = digit;
                    otpInputs[i].classList.add('filled');
                }
            });
            
            // Focus last filled input or next empty input
            const nextEmptyIndex = Math.min(digits.length, otpInputs.length - 1);
            otpInputs[nextEmptyIndex].focus();
            
            updateVerifyButton();
            
            // Auto-verify when complete
            if (digits.length === 6) {
                setTimeout(() => {
                    verifyOTP();
                }, 100);
            }
        });
    });
    
    // Get current OTP value
    function getOTPValue() {
        return Array.from(otpInputs).map(input => input.value).join('');
    }
    
    // Update verify button state
    function updateVerifyButton() {
        const otpValue = getOTPValue();
        const isComplete = otpValue.length === 6;
        
        verifyBtn.disabled = !isComplete;
        
        if (isComplete) {
            verifyBtn.classList.add('ready');
        } else {
            verifyBtn.classList.remove('ready');
        }
    }
    
    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Add error styling to inputs
        otpInputs.forEach(input => {
            input.classList.add('error');
        });
        
        // Clear error styling after animation
        setTimeout(() => {
            otpInputs.forEach(input => {
                input.classList.remove('error');
            });
        }, 500);
    }
    
    // Hide error message
    function hideError() {
        errorMessage.style.display = 'none';
    }
    
    // Verify OTP
    window.verifyOTP = function() {
        const otp = getOTPValue();
        
        if (otp.length !== 6) {
            showError('Please enter a complete 6-digit OTP');
            return;
        }
        
        // Show loading state
        verifyBtn.classList.add('loading');
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
        hideError();
        
        // Send verification request
        fetch('php/forgot_mpin_verify_otp.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                otp: otp
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Redirect to reset password page
                window.location.href = 'reset_mpin_password.html';
            } else {
                showError(data.message || 'Invalid OTP. Please try again.');
                // Clear inputs
                otpInputs.forEach(input => {
                    input.value = '';
                    input.classList.remove('filled');
                });
                otpInputs[0].focus();
                updateVerifyButton();
            }
        })
        .catch(error => {
            console.error('OTP verification error:', error);
            showError('Network error. Please check your connection and try again.');
            // Clear inputs
            otpInputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled');
            });
            otpInputs[0].focus();
            updateVerifyButton();
        })
        .finally(() => {
            // Reset button
            verifyBtn.classList.remove('loading');
            verifyBtn.disabled = false;
            verifyBtn.textContent = 'Verify';
        });
    };
    
    // Go back
    window.goBack = function() {
        window.location.href = 'forgot_mpin_otp.html';
    };
    
    // Auto-focus first input
    otpInputs[0].focus();
});

