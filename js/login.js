// Login Form Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get form elements
    const emailForm = document.getElementById('emailForm');
    const emailInput = document.getElementById('email');
    const loginBtn = document.querySelector('.login-btn');
    const createBtn = document.querySelector('.create-btn');

    // Form validation
    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }


    // Show error message
    function showError(input, message) {
        // Remove existing error
        const existingError = input.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }

        // Add error styling
        input.classList.add('error');
        
        // Create error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        input.parentNode.appendChild(errorDiv);
    }

    // Clear error
    function clearError(input) {
        const errorMessage = input.parentNode.querySelector('.error-message');
        if (errorMessage) {
            errorMessage.remove();
        }
        input.classList.remove('error');
    }

    // Email form submission
    emailForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        
        // Clear previous errors
        clearError(emailInput);
        
        // Validate email
        if (!email) {
            showError(emailInput, 'Email address is required');
            return;
        }
        
        if (!validateEmail(email)) {
            showError(emailInput, 'Please enter a valid email address');
            return;
        }
        
        // Show loading state
        loginBtn.classList.add('loading');
        loginBtn.textContent = 'Logging in...';
        
        // Send login request to PHP backend
        fetch('php/login.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                login_type: 'email',
                credentials: email
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store email in sessionStorage for MPIN login
                sessionStorage.setItem('loginEmail', email);
                // Redirect to MPIN login page
                window.location.href = 'mpin_login.html';
            } else {
                showError(emailInput, data.message || 'Login failed');
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            showError(emailInput, 'Network error. Please try again.');
        })
        .finally(() => {
            // Reset button
            loginBtn.classList.remove('loading');
            loginBtn.textContent = 'Login';
        });
    });


    // Create account button
    createBtn.addEventListener('click', function() {
        window.location.href = 'create_account1.html';
    });

    // Real-time validation
    emailInput.addEventListener('input', function() {
        clearError(emailInput);
    });


    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeForm = document.querySelector('.login-form.active');
            if (activeForm) {
                activeForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // Focus management
    emailInput.addEventListener('focus', function() {
        this.parentNode.style.transform = 'scale(1.02)';
    });

    emailInput.addEventListener('blur', function() {
        this.parentNode.style.transform = 'scale(1)';
    });

});

// Add smooth transitions for input groups
const style = document.createElement('style');
style.textContent = `
    .input-group {
        transition: transform 0.2s ease;
    }
    
    .error-message {
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
