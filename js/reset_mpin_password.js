// Reset MPIN Password Functionality
document.addEventListener('DOMContentLoaded', function() {
    const newMpinInputs = document.querySelectorAll('.mpin-digit');
    const retypeMpinInputs = document.querySelectorAll('.mpin-digit-retype');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    // Get email from sessionStorage
    const email = sessionStorage.getItem('forgotMpinEmail');
    
    // Check if email exists
    if (!email) {
        // Redirect back to login if no email found
        window.location.href = 'index.php';
        return;
    }
    
    // MPIN input handling for new MPIN
    newMpinInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }
            
            // Move to next input
            if (value && index < newMpinInputs.length - 1) {
                newMpinInputs[index + 1].focus();
            }
            
            // Update button state
            updateSubmitButton();
            hideError();
        });
        
        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                newMpinInputs[index - 1].focus();
            }
            
            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                newMpinInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < newMpinInputs.length - 1) {
                newMpinInputs[index + 1].focus();
            }
        });
    });
    
    // MPIN input handling for re-type MPIN
    retypeMpinInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;
            
            // Only allow numbers
            if (!/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }
            
            // Move to next input
            if (value && index < retypeMpinInputs.length - 1) {
                retypeMpinInputs[index + 1].focus();
            }
            
            // Update button state
            updateSubmitButton();
            hideError();
        });
        
        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                retypeMpinInputs[index - 1].focus();
            }
            
            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                retypeMpinInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < retypeMpinInputs.length - 1) {
                retypeMpinInputs[index + 1].focus();
            }
        });
    });
    
    // Get MPIN value from inputs
    function getMPINValue(inputs) {
        return Array.from(inputs).map(input => input.value).join('');
    }
    
    // Update submit button state
    function updateSubmitButton() {
        const newMpin = getMPINValue(newMpinInputs);
        const retypeMpin = getMPINValue(retypeMpinInputs);
        const isComplete = newMpin.length === 6 && retypeMpin.length === 6;
        
        submitBtn.disabled = !isComplete;
        
        if (isComplete) {
            submitBtn.classList.add('ready');
        } else {
            submitBtn.classList.remove('ready');
        }
    }
    
    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Add error styling to inputs
        [...newMpinInputs, ...retypeMpinInputs].forEach(input => {
            input.classList.add('error');
        });
        
        // Clear error styling after animation
        setTimeout(() => {
            [...newMpinInputs, ...retypeMpinInputs].forEach(input => {
                input.classList.remove('error');
            });
        }, 500);
    }
    
    // Hide error message
    function hideError() {
        errorMessage.style.display = 'none';
    }
    
    // Reset MPIN
    window.resetMPIN = function() {
        const newMpin = getMPINValue(newMpinInputs);
        const retypeMpin = getMPINValue(retypeMpinInputs);
        
        // Validate MPINs
        if (newMpin.length !== 6) {
            showError('Please enter a complete 6-digit MPIN');
            return;
        }
        
        if (retypeMpin.length !== 6) {
            showError('Please re-enter your MPIN');
            return;
        }
        
        if (newMpin !== retypeMpin) {
            showError('MPINs do not match. Please try again.');
            // Clear re-type inputs
            retypeMpinInputs.forEach(input => {
                input.value = '';
            });
            retypeMpinInputs[0].focus();
            return;
        }
        
        // Show loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Resetting...';
        hideError();
        
        // Send reset request
        fetch('php/reset_mpin_password.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                mpin: newMpin
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Clear session storage
                sessionStorage.removeItem('forgotMpinEmail');
                sessionStorage.removeItem('loginEmail');
                sessionStorage.removeItem('loginMobile');
                
                // Show success message with SweetAlert and redirect
                Swal.fire({
                    title: 'Success!',
                    html: '<div class="custom-check-icon"><svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="#10b981" stroke="#059669" stroke-width="2"/><path d="M20 32 L28 40 L44 24" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><p style="margin-top: 16px; color: #6b7280; font-size: 16px; line-height: 1.6;">MPIN reset successfully! Redirecting to login...</p>',
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: false,
                    customClass: {
                        popup: 'swal2-reset-mpin-popup',
                        htmlContainer: 'swal2-reset-mpin-html'
                    },
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    window.location.href = 'index.php';
                });
            } else {
                showError(data.message || 'Failed to reset MPIN. Please try again.');
                // Clear inputs
                newMpinInputs.forEach(input => {
                    input.value = '';
                });
                retypeMpinInputs.forEach(input => {
                    input.value = '';
                });
                newMpinInputs[0].focus();
                updateSubmitButton();
            }
        })
        .catch(error => {
            console.error('Reset MPIN error:', error);
            showError('Network error. Please check your connection and try again.');
            // Clear inputs
            newMpinInputs.forEach(input => {
                input.value = '';
            });
            retypeMpinInputs.forEach(input => {
                input.value = '';
            });
            newMpinInputs[0].focus();
            updateSubmitButton();
        })
        .finally(() => {
            // Reset button
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Reset MPIN';
        });
    };
    
    // Go back
    window.goBack = function() {
        window.location.href = 'forgot_mpin_verify_otp.html';
    };
    
    // Auto-focus first input
    newMpinInputs[0].focus();
});

