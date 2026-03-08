// MPIN Login Functionality

// Go back to login - defined globally for immediate access (before DOMContentLoaded)
window.goBack = function() {
    // Clear all session storage related to login
    sessionStorage.removeItem('loginEmail');
    sessionStorage.removeItem('loginMobile');
    sessionStorage.removeItem('user_email');
    sessionStorage.removeItem('user');
    // Redirect to login page (index.php)
    window.location.href = 'index.php';
};

// Initialize function that works whether DOM is loaded or not
function initializeMPINLogin() {
    // Get elements
    const mpinInputs = document.querySelectorAll('.mpin-digit');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const userEmail = document.getElementById('userEmail');
    
    // Get login credentials from sessionStorage
    const loginEmail = sessionStorage.getItem('loginEmail');
    const loginMobile = sessionStorage.getItem('loginMobile');
    
    // Check if user came from login page
    if (!loginEmail && !loginMobile) {
        // Redirect back to login if no credentials found
        window.location.href = 'index.php';
        return;
    }
    
    // Function to mask email
    function maskEmail(email) {
        if (!email) return '';
        
        const parts = email.split('@');
        if (parts.length !== 2) return email;
        
        const localPart = parts[0];
        const domainPart = parts[1];
        
        // Mask local part: first 2 chars + asterisks + last 3 chars
        let maskedLocal = '';
        if (localPart.length <= 2) {
            maskedLocal = localPart.padEnd(2, '*');
        } else if (localPart.length <= 5) {
            maskedLocal = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
        } else {
            maskedLocal = localPart.substring(0, 2) + '*'.repeat(localPart.length - 5) + localPart.substring(localPart.length - 3);
        }
        
        // Keep common domains unmasked (gmail.com, yahoo.com, outlook.com, hotmail.com, etc.)
        const commonDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com'];
        const domainLower = domainPart.toLowerCase();
        
        let maskedDomain = domainPart;
        if (!commonDomains.includes(domainLower)) {
            // Only mask uncommon domains
            if (domainPart.length <= 3) {
                maskedDomain = domainPart.charAt(0) + '*'.repeat(domainPart.length - 1);
            } else {
                maskedDomain = domainPart.charAt(0) + '*'.repeat(domainPart.length - 3) + domainPart.substring(domainPart.length - 2);
            }
        }
        
        return `${maskedLocal}@${maskedDomain}`;
    }
    
    // Display user email/mobile
    if (loginEmail) {
        userEmail.textContent = maskEmail(loginEmail);
    } else if (loginMobile) {
        // Mask mobile number similarly
        const mobileDigits = loginMobile.replace(/\D/g, '');
        let maskedMobile = '';
        if (mobileDigits.length <= 4) {
            maskedMobile = '*'.repeat(mobileDigits.length);
        } else {
            maskedMobile = mobileDigits.substring(0, 2) + '*'.repeat(mobileDigits.length - 5) + mobileDigits.substring(mobileDigits.length - 3);
        }
        userEmail.textContent = `+63 ${maskedMobile}`;
    }
    
    // MPIN input handling
    mpinInputs.forEach((input, index) => {
        // Ensure input type is password for masking IMMEDIATELY
        input.type = 'password';
        
        // Force password masking style and white color, consistent background
        input.style.webkitTextSecurity = 'disc';
        input.style.textSecurity = 'disc';
        input.style.color = '#ffffff';
        input.style.background = '#374151';
        
        // Use beforeinput to mask immediately - prevents number from showing
        input.addEventListener('beforeinput', function(e) {
            // Ensure type is password before input happens
            if (e.target.type !== 'password') {
                e.target.type = 'password';
            }
            
            // Ensure masking is applied before input
            e.target.style.webkitTextSecurity = 'disc';
            e.target.style.textSecurity = 'disc';
            
            // Only allow numeric input
            if (e.data && !/^\d$/.test(e.data)) {
                e.preventDefault();
            }
        });
        
        input.addEventListener('input', function(e) {
            // Ensure type is password FIRST to prevent number from showing
            e.target.type = 'password';
            
            let value = e.target.value;
            
            // Only allow numeric characters
            value = value.replace(/\D/g, '');
            
            // Only allow single character - take only the last character if multiple
            if (value.length > 1) {
                value = value.slice(-1);
            }
            
            // Clear and reset value to force immediate masking (prevents number flash)
            const tempValue = value;
            e.target.value = '';
            
            // Use setTimeout to ensure password type is set before value
            setTimeout(() => {
                e.target.type = 'password';
                e.target.value = tempValue;
                
                // Ensure password masking is applied and white color, consistent background
                e.target.style.webkitTextSecurity = 'disc';
                e.target.style.textSecurity = 'disc';
                e.target.style.color = '#ffffff';
                e.target.style.background = '#374151';
                
                // Continue with visual feedback
                if (tempValue) {
                    e.target.classList.add('filled');
                    e.target.classList.remove('error');
                    e.target.style.background = '#374151';
                    
                    // Move to next input immediately for continuous typing
                    if (index < mpinInputs.length - 1) {
                        setTimeout(() => {
                            mpinInputs[index + 1].focus();
                            mpinInputs[index + 1].select();
                        }, 0);
                    }
                } else {
                    e.target.classList.remove('filled');
                    e.target.style.background = '#374151';
                }
                
                // Update button state
                updateLoginButton();
                setTimeout(() => {
                    updateLoginButton();
                }, 10);
            }, 0);
        });
        
        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace') {
                if (e.target.value) {
                    // If there's a value, clear it
                    e.target.value = '';
                    e.target.classList.remove('filled');
                    updateLoginButton();
                } else if (index > 0) {
                    // If empty, move to previous and clear it
                    e.preventDefault();
                    mpinInputs[index - 1].focus();
                    mpinInputs[index - 1].value = '';
                    mpinInputs[index - 1].classList.remove('filled');
                    updateLoginButton();
                }
            }
            
            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                mpinInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < mpinInputs.length - 1) {
                e.preventDefault();
                mpinInputs[index + 1].focus();
            }
            
            // Allow numeric keys and navigation keys
            if (!/^[0-9]$/.test(e.key) && 
                !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key) &&
                !e.ctrlKey && !e.metaKey) {
                // Prevent non-numeric characters
                e.preventDefault();
            }
        });
        
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text');
            // Only get numeric characters and limit to 6
            const numericData = pastedData.replace(/\D/g, '').slice(0, 6);
            const chars = numericData.split('');
            
            // Fill inputs with pasted characters
            chars.forEach((char, i) => {
                if (i < mpinInputs.length) {
                    mpinInputs[i].value = char;
                    mpinInputs[i].classList.add('filled');
                    mpinInputs[i].classList.remove('error');
                }
            });
            
            // Clear remaining inputs
            for (let i = chars.length; i < mpinInputs.length; i++) {
                mpinInputs[i].value = '';
                mpinInputs[i].classList.remove('filled', 'error');
            }
            
            // Focus last filled input or next empty input
            const lastFilledIndex = Math.min(chars.length - 1, mpinInputs.length - 1);
            const nextEmptyIndex = Math.min(chars.length, mpinInputs.length - 1);
            mpinInputs[nextEmptyIndex].focus();
            
            // Trigger input event to ensure button state updates
            setTimeout(() => {
                updateLoginButton();
                // Don't auto-login - user must click the button
            }, 10);
        });
    });
    
    // Update login button state
    function updateLoginButton() {
        if (!loginBtn) return;
        
        const mpinValue = getMPINValue();
        const isComplete = mpinValue.length === 6 && /^\d{6}$/.test(mpinValue);
        
        // Update the button state
        if (isComplete) {
            loginBtn.disabled = false;
            loginBtn.classList.add('ready');
        } else {
            loginBtn.disabled = true;
            loginBtn.classList.remove('ready');
        }
    }
    
    // Get current MPIN value
    function getMPINValue() {
        let value = '';
        mpinInputs.forEach(input => {
            const val = input.value.trim();
            if (val && /^\d$/.test(val)) {
                value += val;
            }
        });
        return value;
    }
    
    // Clear MPIN inputs
    window.clearMPIN = function() {
        // Clear all inputs at once
        mpinInputs.forEach((input, index) => {
            input.value = '';
            input.classList.remove('error', 'filled');
        });
        
        // Focus first input
        setTimeout(() => {
            mpinInputs[0].focus();
            updateLoginButton();
            hideError();
        }, 0);
    };
    
    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        
        // Add error styling to inputs
        mpinInputs.forEach(input => {
            input.classList.add('error');
        });
        
        // Clear error styling after animation
        setTimeout(() => {
            mpinInputs.forEach(input => {
                input.classList.remove('error');
            });
        }, 500);
    }
    
    // Hide error message
    function hideError() {
        errorMessage.style.display = 'none';
    }
    
    // Show message box
    function showMessageBox(title, message, type = 'info') {
        // Create message box if it doesn't exist
        let messageBox = document.querySelector('.message-box');
        if (!messageBox) {
            messageBox = createMessageBox();
            document.body.appendChild(messageBox);
        }
        
        // Update message box content
        const titleElement = messageBox.querySelector('.message-title');
        const messageElement = messageBox.querySelector('.message-text');
        
        titleElement.textContent = title;
        messageElement.textContent = message;
        
        // Set type (success, error, info)
        messageBox.className = `message-box message-${type}`;
        
        // Show message box
        messageBox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Add animation
        setTimeout(() => {
            messageBox.classList.add('show');
        }, 10);
    }
    
    // Create message box element
    function createMessageBox() {
        const messageBox = document.createElement('div');
        messageBox.className = 'message-box';
        messageBox.innerHTML = `
            <div class="message-overlay"></div>
            <div class="message-content">
                <div class="message-header">
                    <h3 class="message-title"></h3>
                    <button class="message-close">&times;</button>
                </div>
                <div class="message-body">
                    <p class="message-text"></p>
                </div>
                <div class="message-footer">
                    <button class="message-btn primary">OK</button>
                </div>
            </div>
        `;
        
        // Add event listeners
        const closeBtn = messageBox.querySelector('.message-close');
        const okBtn = messageBox.querySelector('.message-btn');
        const overlay = messageBox.querySelector('.message-overlay');
        
        const closeMessage = () => {
            messageBox.classList.remove('show');
            setTimeout(() => {
                messageBox.style.display = 'none';
                document.body.style.overflow = '';
            }, 300);
        };
        
        closeBtn.addEventListener('click', closeMessage);
        okBtn.addEventListener('click', closeMessage);
        overlay.addEventListener('click', closeMessage);
        
        return messageBox;
    }
    
    // Auto verify MPIN when complete
    function autoVerifyMPIN() {
        // Prevent multiple verification calls
        if (loginBtn.disabled && loginBtn.textContent === 'Verifying...') {
            return;
        }
        
        const mpin = getMPINValue();
        if (mpin.length === 6) {
            verifyMPIN();
        }
    }
    
    // Verify MPIN
    window.verifyMPIN = function() {
        const mpin = getMPINValue();
        
        if (mpin.length !== 6) {
            showError('Please enter a complete 6-digit MPIN');
            return;
        }
        
        // Show loading state
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
        loginBtn.textContent = 'Verifying...';
        
        // Prepare request data
        const requestData = {
            mpin: mpin
        };
        
        if (loginEmail) {
            requestData.email = loginEmail;
        } else if (loginMobile) {
            requestData.mobile = loginMobile;
        }
        
        // Send verification request
        fetch('php/mpin_login.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store user email for main UI
                if (loginEmail) {
                    sessionStorage.setItem('user_email', loginEmail);
                } else if (loginMobile) {
                    sessionStorage.setItem('user_email', loginMobile);
                }
                
                // Clear session storage
                sessionStorage.removeItem('loginEmail');
                sessionStorage.removeItem('loginMobile');
                
                // Store user session
                if (data.user) {
                    sessionStorage.setItem('user', JSON.stringify(data.user));
                }
                
                // Redirect directly to main UI without notification
                window.location.href = 'main_UI.html';
            } else {
                // Show message box for error
                showMessageBox('Invalid MPIN', 'The MPIN you entered is incorrect. Please try again.', 'error');
                clearMPIN();
            }
        })
        .catch(error => {
            console.error('MPIN verification error:', error);
            showMessageBox('Network Error', 'Unable to connect to the server. Please check your internet connection and try again.', 'error');
            clearMPIN();
        })
        .finally(() => {
            // Reset button
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        });
    };
    
    // Forgot MPIN
    window.forgotMPIN = function() {
        // Navigate to forgot MPIN OTP page
        // Email is already stored in sessionStorage as loginEmail
        window.location.href = 'forgot_mpin_otp.html';
    };
    
    // Mobile keyboard handling - adjust modal position when keyboard appears
    let initialViewportHeight = window.innerHeight;
    let isKeyboardVisible = false;
    let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    function handleKeyboardVisibility() {
        if (!isMobile) return; // Only handle on mobile devices
        
        const currentViewportHeight = window.innerHeight;
        const heightDifference = initialViewportHeight - currentViewportHeight;
        
        // Keyboard is considered visible if viewport height decreased by more than 150px
        const keyboardThreshold = 150;
        const wasKeyboardVisible = isKeyboardVisible;
        isKeyboardVisible = heightDifference > keyboardThreshold;
        
        const container = document.querySelector('.container');
        
        if (isKeyboardVisible && !wasKeyboardVisible) {
            // Keyboard just appeared
            container.classList.add('keyboard-visible');
            document.body.classList.add('keyboard-open');
            
            // Scroll active input into view
            const activeInput = document.activeElement;
            if (activeInput && activeInput.classList.contains('mpin-digit')) {
                setTimeout(() => {
                    // Use scrollIntoView with better options for mobile
                    activeInput.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center',
                        inline: 'nearest'
                    });
                    
                    // Also scroll the container if needed
                    const mpinSection = document.querySelector('.mpin-section');
                    if (mpinSection) {
                        mpinSection.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest'
                        });
                    }
                }, 150);
            }
        } else if (!isKeyboardVisible && wasKeyboardVisible) {
            // Keyboard just disappeared
            container.classList.remove('keyboard-visible');
            document.body.classList.remove('keyboard-open');
            
            // Reset scroll position smoothly
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 100);
        }
    }
    
    // Listen for viewport resize (happens when keyboard appears/disappears on mobile)
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(handleKeyboardVisibility, 100);
    });
    
    // Also listen for focus events on inputs to ensure they're visible
    mpinInputs.forEach(input => {
        input.addEventListener('focus', function() {
            if (!isMobile) return;
            
            // Small delay to allow keyboard to appear first
            setTimeout(() => {
                // Scroll input into view
                input.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                });
                
                // Also ensure the MPIN section is visible
                const mpinSection = document.querySelector('.mpin-section');
                if (mpinSection) {
                    mpinSection.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'nearest'
                    });
                }
                
                // Check if keyboard is visible after focus
                handleKeyboardVisibility();
            }, 300);
        });
        
        input.addEventListener('blur', function() {
            if (!isMobile) return;
            
            // Small delay to check if keyboard closed
            setTimeout(() => {
                handleKeyboardVisibility();
            }, 200);
        });
    });
    
    // Update initial viewport height on orientation change
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            initialViewportHeight = window.innerHeight;
            handleKeyboardVisibility();
        }, 500);
    });
    
    // Auto-focus first input
    mpinInputs[0].focus();
    
    // Add smooth transitions
    const style = document.createElement('style');
    style.textContent = `
        .mpin-digit {
            transition: all 0.2s ease;
        }
        
        .login-btn.ready {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }
        
        .login-btn.ready:hover {
            box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
        }
        
        /* Message Box Styles */
        .message-box {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 3000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .message-box.show {
            opacity: 1;
        }

        .message-content {
            background: white;
            border-radius: 15px;
            max-width: 400px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            transform: scale(0.9);
            transition: transform 0.3s ease;
        }

        .message-box.show .message-content {
            transform: scale(1);
        }

        .message-header {
            padding: 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .message-title {
            font-size: 18px;
            font-weight: 600;
            color: #333;
        }

        .message-close {
            background: none;
            border: none;
            font-size: 24px;
            color: #666;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .message-body {
            padding: 20px;
        }

        .message-text {
            color: #666;
            line-height: 1.6;
        }

        .message-footer {
            padding: 20px;
            border-top: 1px solid #eee;
            text-align: right;
        }

        .message-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
        }

        .message-btn:hover {
            background: #0056b3;
        }

        /* Message box variants */
        .message-success .message-title {
            color: #059669;
        }

        .message-success .message-btn {
            background: #059669;
        }

        .message-error .message-title {
            color: #dc2626;
        }

        .message-error .message-btn {
            background: #dc2626;
        }

        .message-error .message-btn:hover {
            background: #b91c1c;
        }

        .message-success .message-btn:hover {
            background: #047857;
        }
    `;
    document.head.appendChild(style);
}

// Call initialize function - works whether DOM is loaded or not
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMPINLogin);
} else {
    // DOM is already loaded
    initializeMPINLogin();
}
