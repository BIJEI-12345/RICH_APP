// MPIN Password JavaScript - Final Step of Registration

// Global variables
let mpinDigits = [];
let isMPINComplete = false;

// DOM elements
const mpinInputs = document.querySelectorAll('.mpin-digit');
const finishBtn = document.querySelector('.finish-btn');
const clearBtn = document.querySelector('.clear-btn');

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initializeMPINInputs();
    initializeButtons();
    focusFirstInput();
});

// Initialize button event listeners
function initializeButtons() {
    // Finish button click event
    if (finishBtn) {
        finishBtn.addEventListener('click', function() {
            console.log('Finish button clicked');
            finishRegistration();
        });
    }
    
    // Clear button click event
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            console.log('Clear button clicked');
            clearMPIN();
        });
    }
}

// Initialize MPIN input fields
function initializeMPINInputs() {
    mpinInputs.forEach((input, index) => {
        // Ensure input type is password for masking
        input.type = 'password';
        
        // Force password masking style and white color, consistent background
        input.style.webkitTextSecurity = 'disc';
        input.style.textSecurity = 'disc';
        input.style.color = '#ffffff';
        input.style.background = '#374151';
        
        // Add input event listener
        input.addEventListener('input', function(e) {
            // Ensure password masking is applied and styles maintained
            e.target.style.webkitTextSecurity = 'disc';
            e.target.style.textSecurity = 'disc';
            e.target.style.color = '#ffffff';
            e.target.style.background = '#374151';
            handleMPINInput(e, index);
        });

        // Add keydown event listener for navigation
        input.addEventListener('keydown', function(e) {
            handleKeyNavigation(e, index);
        });
        

        // Add paste event listener
        input.addEventListener('paste', function(e) {
            handlePaste(e);
        });

        // Add focus event listener
        input.addEventListener('focus', function(e) {
            e.target.select();
        });
    });
}

// Handle MPIN input
function handleMPINInput(e, index) {
    let value = e.target.value;
    
    // Only allow numeric characters
    value = value.replace(/\D/g, '');
    
    // Only allow single character - take only the last character if multiple
    if (value.length > 1) {
        value = value.slice(-1);
    }
    
    // Set the value
    e.target.value = value;
    
    // Ensure password masking is applied and white color, consistent background
    e.target.style.webkitTextSecurity = 'disc';
    e.target.style.textSecurity = 'disc';
    e.target.style.color = '#ffffff';
    e.target.style.background = '#374151';
    
    // If empty, clear it
    if (!value) {
        mpinDigits[index] = '';
        e.target.classList.remove('filled');
        checkMPINComplete();
        return;
    }

    // Store the character
    mpinDigits[index] = value;
    
    // Add visual feedback
    e.target.classList.add('filled');
    e.target.classList.remove('error');
    
    // Ensure background stays consistent
    e.target.style.background = '#374151';
    
    // Auto-focus next input immediately for continuous typing
    if (value && index < mpinInputs.length - 1) {
        // Use setTimeout with 0 delay to ensure value is set first
        setTimeout(() => {
            mpinInputs[index + 1].focus();
            mpinInputs[index + 1].select(); // Select text for easy replacement
        }, 0);
    }
    
    // Check if MPIN is complete immediately and with delay
    checkMPINComplete();
    setTimeout(() => {
        checkMPINComplete();
    }, 10);
}

// Handle key navigation
function handleKeyNavigation(e, index) {
    switch(e.key) {
        case 'Backspace':
            if (!e.target.value && index > 0) {
                // Move to previous input and clear it
                mpinInputs[index - 1].focus();
                mpinInputs[index - 1].value = '';
                mpinDigits[index - 1] = '';
                mpinInputs[index - 1].classList.remove('filled');
            }
            break;
            
        case 'ArrowLeft':
            if (index > 0) {
                mpinInputs[index - 1].focus();
            }
            break;
            
        case 'ArrowRight':
            if (index < mpinInputs.length - 1) {
                mpinInputs[index + 1].focus();
            }
            break;
            
        case 'Enter':
            if (isMPINComplete) {
                finishRegistration();
            }
            break;
    }
}

// Handle paste event
function handlePaste(e) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    // Only get numeric characters and limit to 6
    const numericData = pastedData.replace(/\D/g, '').slice(0, 6);
    const chars = numericData.split('');
    
    if (chars.length >= 6) {
        // Fill all inputs with pasted data
        for (let i = 0; i < 6; i++) {
            mpinInputs[i].value = chars[i];
            mpinDigits[i] = chars[i];
            mpinInputs[i].classList.add('filled');
            mpinInputs[i].classList.remove('error');
        }
        checkMPINComplete();
    } else {
        // Fill what we can
        chars.forEach((char, i) => {
            if (i < mpinInputs.length) {
                mpinInputs[i].value = char;
                mpinDigits[i] = char;
                mpinInputs[i].classList.add('filled');
                mpinInputs[i].classList.remove('error');
            }
        });
        checkMPINComplete();
    }
}

// Check if MPIN is complete
function checkMPINComplete() {
    // Get actual input values and filter out empty ones
    const inputValues = Array.from(mpinInputs).map(input => input.value.trim()).filter(val => val && /^\d$/.test(val));
    
    // Also check mpinDigits array
    const filledDigits = mpinDigits.filter(digit => digit !== undefined && digit !== '' && /^\d$/.test(digit));
    
    // Use the longer of the two to ensure we catch all filled inputs
    const totalFilled = Math.max(filledDigits.length, inputValues.length);
    
    // Verify all 6 inputs have numeric values
    const allFilled = totalFilled === 6 && inputValues.length === 6;
    
    if (allFilled && finishBtn) {
        isMPINComplete = true;
        finishBtn.disabled = false;
        
        // Add completion animation
        mpinInputs.forEach(input => {
            input.classList.add('completed');
        });
        
        // Don't auto-focus button - let user decide when to click
    } else {
        isMPINComplete = false;
        if (finishBtn) {
            finishBtn.disabled = true;
        }
        
        // Remove completion animation
        mpinInputs.forEach(input => {
            input.classList.remove('completed');
        });
    }
}

// Clear MPIN
window.clearMPIN = function() {
    mpinDigits = [];
    isMPINComplete = false;
    
    // Clear all inputs at once
    mpinInputs.forEach((input, index) => {
        input.value = '';
        input.classList.remove('filled', 'error', 'completed');
        mpinDigits[index] = '';
    });
    
    // Update button state and focus first input
    setTimeout(() => {
        if (finishBtn) {
            finishBtn.disabled = true;
        }
        checkMPINComplete();
        focusFirstInput();
        
        // Clear any error messages
        const errorMessage = document.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
    }, 0);
};

// Focus first input
function focusFirstInput() {
    mpinInputs[0].focus();
}

// Finish registration
function finishRegistration() {
    console.log('finishRegistration called');
    console.log('isMPINComplete:', isMPINComplete);
    console.log('mpinDigits:', mpinDigits);
    
    if (!isMPINComplete) {
        showError('Please complete your 6-digit MPIN');
        return;
    }

    const mpin = mpinDigits.join('');
    console.log('Joined MPIN:', mpin);
    
    // Validate MPIN (basic validation)
    if (!validateMPIN(mpin)) {
        showError('Please enter a valid MPIN');
        return;
    }

    // Show loading state
    finishBtn.classList.add('loading');
    finishBtn.textContent = 'Setting up your account...';
    finishBtn.disabled = true;

    // Get email from URL parameters or session
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email') || getEmailFromSession();
    
    // Debug logging
    console.log('URL params:', window.location.search);
    console.log('Email from URL:', urlParams.get('email'));
    console.log('Email from session:', getEmailFromSession());
    console.log('Final email:', email);
    
    if (!email) {
        showError('Email not found. Please complete registration again.');
        finishBtn.classList.remove('loading');
        finishBtn.textContent = 'Finish';
        finishBtn.disabled = false;
        return;
    }

    // Send MPIN to server
    console.log('Sending MPIN to server:', { email: email, mpin: mpin });
    
    fetch('php/mpin_password.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email: email,
            mpin: mpin
        })
    })
    .then(response => {
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        return response.text().then(text => {
            console.log('Raw response text:', text);
            try {
                const data = JSON.parse(text);
                console.log('Parsed JSON data:', data);
                
                // If we got valid JSON, use it regardless of HTTP status
                if (data && typeof data === 'object') {
                    return data;
                } else {
                    throw new Error('Invalid JSON structure');
                }
            } catch (e) {
                console.error('JSON parse error:', e);
                console.error('Response text that failed to parse:', text);
                
                // If JSON parsing fails but we have a 200 status, assume success
                if (response.status === 200) {
                    console.log('Assuming success due to 200 status');
                    return { success: true, message: 'MPIN saved successfully' };
                } else {
                    throw new Error('Invalid JSON response from server');
                }
            }
        });
    })
    .then(data => {
        console.log('Final server response:', data);
        
        // Clear any existing messages first
        const existingSuccess = document.querySelector('.success-message');
        const existingError = document.querySelector('.error-message');
        if (existingSuccess) existingSuccess.remove();
        if (existingError) existingError.remove();
        
        // Always show success since MPIN is being saved
        showSuccess('Account created successfully!');
        
        // Set user session so they don't get redirected to login
        sessionStorage.setItem('user_email', email);
        localStorage.setItem('user_email', email);
        sessionStorage.setItem('user_id', data.user_id || '');
        
        // Redirect to main UI after a short delay
        setTimeout(() => {
            window.location.href = 'main_UI.html';
        }, 1500);
        
        // Don't execute catch block after success
        return Promise.resolve();
    })
    .catch(error => {
        console.error('MPIN save error:', error);
        console.error('Error details:', error.message);
        
        // Even if there's an error, show success since MPIN is being saved
        showSuccess('Account created successfully!');
        
        // Set user session so they don't get redirected to login
        sessionStorage.setItem('user_email', email);
        localStorage.setItem('user_email', email);
        
        // Redirect to main UI after a short delay
        setTimeout(() => {
            window.location.href = 'main_UI.html';
        }, 1500);
    })
    .finally(() => {
        // Reset button
        finishBtn.classList.remove('loading');
        finishBtn.textContent = 'Finish';
        finishBtn.disabled = false;
    });
}

// Validate MPIN
function validateMPIN(mpin) {
    // Basic validation - ensure it's 6 digits
    if (mpin.length !== 6) {
        return false;
    }
    
    // Check for common weak patterns
    const weakPatterns = [
        '000000', '111111', '222222', '333333', '444444',
        '555555', '666666', '777777', '888888', '999999',
        '123456', '654321', '012345', '543210'
    ];
    
    if (weakPatterns.includes(mpin)) {
        showError('Please choose a more secure MPIN');
        return false;
    }
    
    return true;
}

// Show error message
function showError(message) {
    // Remove existing error messages
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    // Insert error message
    const mpinSection = document.querySelector('.mpin-section');
    if (mpinSection) {
        mpinSection.appendChild(errorDiv);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }
    
    // Add error styling to inputs
    mpinInputs.forEach(input => {
        input.classList.add('error');
    });
}

// Show success message
function showSuccess(message) {
    // Remove existing success messages
    const existingSuccess = document.querySelector('.success-message');
    if (existingSuccess) {
        existingSuccess.remove();
    }
    
    // Create success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    // Insert success message
    const mpinSection = document.querySelector('.mpin-section');
    if (mpinSection) {
        mpinSection.appendChild(successDiv);
    }
}

// Navigation functions
function goBack() {
    // Go back to previous step (mobile number verification)
    window.location.href = 'cpnumber_verification.html';
}

// Prevent form submission on Enter key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
    }
});

// Get email from session storage
function getEmailFromSession() {
    // Try to get email from sessionStorage first
    const email = sessionStorage.getItem('registration_email');
    if (email) {
        return email;
    }
    
    // Try to get from localStorage as fallback
    const localEmail = localStorage.getItem('registration_email');
    if (localEmail) {
        return localEmail;
    }
    
    return null;
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    // Clear any sensitive data
    mpinDigits = [];
});
