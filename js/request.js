// ID Validation Objects for each form type
let idOcrValidation = {
    barangayId: { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' },
    certification: { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' },
    coe: { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' },
    indigency: { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' },
    clearance: { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' }
};

// ID Validation Helper Functions
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Validate address on the ID image using Gemini backend
async function validateIDAddressWithGemini(file) {
    const base64Image = await fileToBase64(file);

    try {
        const response = await fetch('php/gemini_verify.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image_base64: base64Image })
        });

        let data;
        const text = await response.text();
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Vision API error: Non-JSON response:', text.slice(0, 200));
            // Fallback to Tesseract with File object instead of base64
            const fallback = await ocrWithTesseract(file);
            return fallback;
        }
        
        if (!data.success || !data.ok) {
            console.log('Vision proxy error:', data.message || 'Unknown');
            // Fallback to Tesseract with File object instead of base64
            const fallback = await ocrWithTesseract(file);
            return fallback;
        }

        console.log('Extracted text from ID:', data.fullText || data.addressText);
        return { 
            ok: true, 
            hasBigte: !!data.hasMatch, 
            name: { 
                first: data.firstName || '', 
                middle: data.middleName || '', 
                last: data.lastName || '' 
            }, 
            fullText: data.fullText || '' 
        };
    } catch (error) {
        console.error('Vision API error:', error);
        // Fallback to Tesseract with File object instead of base64
        const fallback = await ocrWithTesseract(file);
        return fallback;
    }
}

// Lightweight fallback OCR using Tesseract.js from CDN
function ensureTesseractLoaded() {
    return new Promise((resolve, reject) => {
        if (window.Tesseract && window.Tesseract.recognize) return resolve();
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/tesseract.js@4.0.2/dist/tesseract.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Tesseract.js'));
        document.head.appendChild(script);
    });
}

async function ocrWithTesseract(fileOrBase64) {
    try {
        await ensureTesseractLoaded();
        
        // Tesseract works better with File objects or image elements
        // If it's a File object, use it directly; otherwise, convert base64 to image element
        let imageSource;
        
        if (fileOrBase64 instanceof File) {
            // Use File object directly (most reliable)
            imageSource = fileOrBase64;
        } else if (typeof fileOrBase64 === 'string') {
            // If it's a base64 string, create an image element from it
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = fileOrBase64;
            });
            imageSource = img;
        } else {
            imageSource = fileOrBase64;
        }
        
        const { data } = await window.Tesseract.recognize(imageSource, 'eng');
        const text = (data && data.text) ? data.text : '';
        const hay = text.toLowerCase();
        const hasBigte = hay.includes('bigte');
        const name = { first: '', middle: '', last: '' };
        const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
        for (const ln of lines) {
            const low = ln.toLowerCase();
            if (low.includes('name') || low.includes('bearer') || low.includes('cardholder')) {
                const parts = ln.replace(/name[:\-\s]*/i, '').trim().split(/\s+/);
                if (parts.length >= 2) {
                    name.first = parts[0];
                    name.last = parts[parts.length - 1];
                    if (parts.length >= 3) name.middle = parts.slice(1, parts.length - 1).join(' ');
                    break;
                }
            }
        }
        return { ok: true, hasBigte, name, fullText: text };
    } catch (e) {
        console.warn('Fallback OCR failed:', e);
        return { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
    }
}

// Handle ID image upload and validation for a specific form type
async function handleIDImageUpload(file, formType) {
    if (!file) return;

    try {
        const result = await validateIDAddressWithGemini(file);
        
        if (!result.ok) {
            console.log('ID validation not available, skipping validation');
            idOcrValidation[formType] = { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
        } else if (!result.hasBigte) {
            console.warn('ID validation: "Bigte" not found in address.');
            idOcrValidation[formType] = { ok: true, hasBigte: false, name: result.name, fullText: result.fullText || '' };
        } else {
            console.log('✓ ID validated - Bigte found in address');
            idOcrValidation[formType] = { ok: true, hasBigte: true, name: result.name, fullText: result.fullText || '' };
        }
    } catch (error) {
        console.error('ID validation error:', error);
        idOcrValidation[formType] = { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
    }
}

// Request Page JavaScript
document.addEventListener('DOMContentLoaded', async function() {
    // Show full-screen loading when page loads
    showFullScreenLoading('Loading...');
    
    setupSidebarNavigation();
    setupSidebarToggle();
    setupBarangayIdForm();
    setupCertificationForm();
    setupCoeForm();
    setupIndigencyForm();
    setupClearanceForm();
    
    // Setup real-time validation for all forms
    setupRealTimeValidation();
    
    // Clear forms when page loads first
    clearAllFormInputs();
    
    // Auto-populate user data on page load
    loadUserData();
    
    // Initialize required indicator toggle
    initializeRequiredIndicatorToggle();
    
    // After other init and population, apply restrictions
    try {
        await applyActiveRequestRestrictions();
        await applyActiveRequestRestrictions(); // Call twice to ensure handlers are attached
    } catch (error) {
        console.error('Error applying restrictions:', error);
    } finally {
        // Hide loading after everything is loaded
        hideFullScreenLoading();
    }
});

// Document types and their configurations
const documentTypes = {
    'business-permit': {
        title: 'Business Permit Request',
        description: 'New business permit or renewal application',
        icon: 'fas fa-file-invoice',
        price: 200,
        requirements: [
            'Valid government-issued ID',
            'Business registration documents',
            'Proof of business location',
            'Tax identification number',
            'Barangay clearance'
        ]
    },
    'barangay-id': {
        title: 'Barangay ID Request',
        description: 'Official barangay identification card for residents',
        icon: 'fas fa-id-card',
        price: 50,
        requirements: [
            'Valid government-issued ID',
            'Proof of residency (utility bill, lease agreement)',
            '2x2 ID picture (white background)',
            'Birth certificate or baptismal certificate'
        ]
    },
    'certification-form': {
        title: 'Certification Form Request',
        description: 'Various certification documents from the barangay',
        icon: 'fas fa-certificate',
        price: 100,
        requirements: [
            'Valid government-issued ID',
            'Proof of residency',
            'Specific purpose for certification',
            'Supporting documents (if applicable)'
        ]
    },
    'certification-employment': {
        title: 'Certification of Employment Request',
        description: 'Employment certification for job applications',
        icon: 'fas fa-briefcase',
        price: 150,
        requirements: [
            'Valid government-issued ID',
            'Proof of residency',
            'Employment details',
            'Company letterhead (if self-employed)'
        ]
    },
    'indigency-form': {
        title: 'Indigency Form Request',
        description: 'Certificate of indigency for social services',
        icon: 'fas fa-hand-holding-heart',
        price: 75,
        requirements: [
            'Valid government-issued ID',
            'Proof of residency',
            'Income statement or affidavit',
            'Family composition'
        ]
    },
    'clearance-form': {
        title: 'Clearance Form Request',
        description: 'Barangay clearance certificate',
        icon: 'fas fa-shield-alt',
        price: 100,
        requirements: [
            'Valid government-issued ID',
            'Proof of residency',
            'Purpose of clearance',
            'No pending cases affidavit'
        ]
    }
};

// Initialize the request page
function initializeRequestPage() {
    // Get document type from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const documentType = urlParams.get('type');
    
    if (documentType && documentTypes[documentType]) {
        setupDocumentType(documentType);
    } else {
        // Default to barangay ID if no type specified
        setupDocumentType('barangay-id');
    }
}

// Setup document type specific content
function setupDocumentType(type) {
    const docConfig = documentTypes[type];
    
    // Update page title
    document.title = `RICH - ${docConfig.title}`;
    
    // Update header content
    const documentIcon = document.getElementById('document-icon');
    const documentTitle = document.getElementById('document-title');
    const documentDescription = document.getElementById('document-description');
    const priceAmount = document.getElementById('priceAmount');
    const requirementsList = document.getElementById('requirementsList');
    
    if (documentIcon) {
        documentIcon.className = docConfig.icon;
    }
    
    if (documentTitle) {
        documentTitle.textContent = docConfig.title;
    }
    
    if (documentDescription) {
        documentDescription.textContent = docConfig.description;
    }
    
    if (priceAmount) {
        priceAmount.textContent = `₱${docConfig.price}.00`;
    }
    
    if (requirementsList) {
        requirementsList.innerHTML = '';
        docConfig.requirements.forEach(requirement => {
            const requirementItem = document.createElement('div');
            requirementItem.className = 'requirement-item';
            requirementItem.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>${requirement}</span>
            `;
            requirementsList.appendChild(requirementItem);
        });
    }
    
    // Store document type for form submission
    document.getElementById('requestForm').setAttribute('data-document-type', type);
}

// Load user data
function loadUserData() {
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || 'test@example.com';
    if (userEmail) {
        fetch('php/main_UI.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: userEmail
            })
        })
        .then(response => {
            console.log('User data response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text().then(text => {
                try {
                    return JSON.parse(text);
                } catch (e) {
                    console.error('JSON parse error:', e);
                    console.error('Response text:', text);
                    throw new Error('Invalid JSON response');
                }
            });
        })
        .then(data => {
            console.log('User data received:', data);
            if (data.success && data.user) {
                console.log('User details:', data.user);
                // Store in sessionStorage for quick access
                sessionStorage.setItem('resident_data', JSON.stringify(data.user));
                // Populate request forms with resident_information fields
                populateUserToAllForms(data.user);
            } else {
                console.log('No user data available');
            }
        })
        .catch(error => {
            console.error('Error loading user data:', error);
        });
    }
}

// Helper: set radio by name and expected value (case-insensitive)
function setRadioByName(name, value) {
    if (!value) return;
    const normalized = String(value).toLowerCase();
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(r => {
        if (String(r.value).toLowerCase() === normalized) {
            r.checked = true;
        }
    });
}

// Populate all related forms with user info
function populateUserToAllForms(user) {
    if (!user) {
        // Try to get from sessionStorage
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            user = JSON.parse(stored);
            console.log('Using cached user data');
        } else {
            console.log('No user data available to populate');
            return;
        }
    }
    
    console.log('Populating forms with user data:', user);
    
    const firstName = user.first_name || '';
    const middleName = user.middle_name || '';
    const lastName = user.last_name || '';
    const age = user.age || '';
    const sex = user.sex || user.gender || '';
    const birthDate = user.birthday || user.birth_date || '';
    const civilStatus = user.civil_status || '';

    console.log('Values to populate:', { firstName, middleName, lastName, age, sex, birthDate, civilStatus });

    // Barangay ID form
    const idFirst = document.getElementById('firstName');
    const idMiddle = document.getElementById('middleName');
    const idLast = document.getElementById('lastName');
    const idBirth = document.getElementById('birthDate');
    
    console.log('Barangay ID fields found:', { idFirst, idMiddle, idLast, idBirth });
    
    if (idFirst) {
        idFirst.value = firstName;
        console.log('Set firstName to:', firstName);
    }
    if (idMiddle) {
        idMiddle.value = middleName;
        console.log('Set middleName to:', middleName);
    }
    if (idLast) {
        idLast.value = lastName;
        console.log('Set lastName to:', lastName);
    }
    if (idBirth && birthDate) {
        idBirth.value = birthDate;
        console.log('Set birthDate to:', birthDate);
    }
    
    setRadioByName('gender', sex);
    setRadioByName('civilStatus', civilStatus);

    // Certification form
    const certFirst = document.getElementById('certFirstName');
    const certMiddle = document.getElementById('certMiddleName');
    const certLast = document.getElementById('certLastName');
    const certBirth = document.getElementById('certBirthDate');
    if (certFirst) certFirst.value = firstName;
    if (certMiddle) certMiddle.value = middleName;
    if (certLast) certLast.value = lastName;
    if (certBirth && birthDate) certBirth.value = birthDate;
    setRadioByName('certGender', sex);
    setRadioByName('certCivilStatus', civilStatus);

    // COE form
    const coeFirst = document.getElementById('coeFirstName');
    const coeMiddle = document.getElementById('coeMiddleName');
    const coeLast = document.getElementById('coeLastName');
    const coeAge = document.getElementById('coeAge');
    if (coeFirst) coeFirst.value = firstName;
    if (coeMiddle) coeMiddle.value = middleName;
    if (coeLast) coeLast.value = lastName;
    if (coeAge && age) coeAge.value = age;
    setRadioByName('coeGender', sex);
    setRadioByName('coeCivilStatus', civilStatus);

    // Indigency form
    const indFirst = document.getElementById('indFirstName');
    const indMiddle = document.getElementById('indMiddleName');
    const indLast = document.getElementById('indLastName');
    const indAge = document.getElementById('indAge');
    const indBirth = document.getElementById('indBirthDate');
    if (indFirst) indFirst.value = firstName;
    if (indMiddle) indMiddle.value = middleName;
    if (indLast) indLast.value = lastName;
    if (indAge && age) indAge.value = age;
    if (indBirth && birthDate) indBirth.value = birthDate;
    setRadioByName('indGender', sex);
    setRadioByName('indCivilStatus', civilStatus);

    // Clearance form
    const clearFirst = document.getElementById('clearFirstName');
    const clearMiddle = document.getElementById('clearMiddleName');
    const clearLast = document.getElementById('clearLastName');
    const clearAge = document.getElementById('clearAge');
    const clearBirth = document.getElementById('clearBirthDate');
    if (clearFirst) clearFirst.value = firstName;
    if (clearMiddle) clearMiddle.value = middleName;
    if (clearLast) clearLast.value = lastName;
    if (clearAge && age) clearAge.value = age;
    if (clearBirth && birthDate) clearBirth.value = birthDate;
    setRadioByName('clearGender', sex);
    setRadioByName('clearCivilStatus', civilStatus);
}

// Setup form handlers
function setupFormHandlers() {
    const form = document.getElementById('requestForm');
    
    if (form) {
        form.addEventListener('submit', handleFormSubmission);
    }
    
    // Add real-time validation
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
        field.addEventListener('blur', validateField);
        field.addEventListener('input', function(e) {
            // Clear error when user starts typing
            clearFieldErrorFromEvent(e);
        });
    });
}

// Setup real-time validation for all forms
function setupRealTimeValidation() {
    // Get all forms
    const forms = [
        'barangayIdFormElement',
        'certificationFormElement', 
        'coeFormElement',
        'indigencyFormElement',
        'clearanceFormElement'
    ];
    
    forms.forEach(formId => {
        const form = document.getElementById(formId);
        if (form) {
            const requiredFields = form.querySelectorAll('[required]');
            requiredFields.forEach(field => {
                field.addEventListener('blur', validateField);
                field.addEventListener('input', function(e) {
                    // Clear error when user starts typing
                    clearFieldErrorFromEvent(e);
                });
                
                // Special handling for radio buttons
                if (field.type === 'radio') {
                    field.addEventListener('change', function(e) {
                        // When a radio button is selected, clear error for the entire group
                        const radioGroup = form.querySelectorAll(`input[name="${e.target.name}"]`);
                        radioGroup.forEach(radio => {
                            clearFieldError(radio);
                        });
                    });
                }
            });
        }
    });
    
    // Special validation for guardianContact field - numbers only and max 11 digits
    const guardianContactField = document.getElementById('guardianContact');
    if (guardianContactField) {
        guardianContactField.addEventListener('input', function(e) {
            // Remove any non-numeric characters
            let value = e.target.value.replace(/[^0-9]/g, '');
            
            // Limit to 11 digits
            if (value.length > 11) {
                value = value.substring(0, 11);
            }
            
            e.target.value = value;
        });
        
        guardianContactField.addEventListener('keypress', function(e) {
            // Prevent non-numeric characters from being typed
            if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }
        });
    }
}

// Handle form submission
function handleFormSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const documentType = form.getAttribute('data-document-type');
    
    // Validate form
    if (!validateForm(form)) {
        showMessage('Please fill in all required fields correctly.', 'error');
        return;
    }
    
    // Show loading state
    setFormLoading(true);
    
    // Prepare submission data
    const submissionData = {
        documentType: documentType,
        personalInfo: {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            middleName: formData.get('middleName'),
            birthDate: formData.get('birthDate'),
            gender: formData.get('gender'),
            civilStatus: formData.get('civilStatus')
        },
        contactInfo: {
            email: formData.get('email'),
            phone: formData.get('phone')
        },
        address: formData.get('address'),
        documentInfo: {
            purpose: formData.get('purpose'),
            urgency: formData.get('urgency')
        },
        additionalNotes: formData.get('additionalNotes'),
        timestamp: new Date().toISOString()
    };
    
    // Submit to server (you'll need to create the PHP endpoint)
    submitRequest(submissionData);
}

// Submit request to server
function submitRequest(data) {
    // For now, simulate successful submission
    // In a real application, you would send this to your PHP backend
    
    setTimeout(() => {
        setFormLoading(false);
        showMessage('Your document request has been submitted successfully! You will receive a confirmation email shortly.', 'success');
        
        // Reset form after successful submission
        setTimeout(() => {
            document.getElementById('requestForm').reset();
            // Optionally redirect back to main page
            // window.location.href = 'main_UI.html';
        }, 3000);
    }, 2000);
    
    // Uncomment this when you have the PHP endpoint ready:
    /*
    fetch('php/submit_request.php', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        setFormLoading(false);
        if (result.success) {
            showMessage('Your document request has been submitted successfully!', 'success');
            form.reset();
        } else {
            showMessage(result.message || 'An error occurred. Please try again.', 'error');
        }
    })
    .catch(error => {
        setFormLoading(false);
        showMessage('Network error. Please check your connection and try again.', 'error');
    });
    */
}

// Validate form
function validateForm(form) {
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!validateField({ target: field })) {
            isValid = false;
        }
    });
    
    return isValid;
}

// Validate individual field
function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    // Remove existing error
    clearFieldError(field);
    
    // Check if required field is empty
    if (field.hasAttribute('required') && !value) {
        showFieldError(field, 'This field is required');
        return false;
    }
    
    // Email validation
    if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            showFieldError(field, 'Please enter a valid email address');
            return false;
        }
    }
    
    // Phone validation
    if (field.type === 'tel' && value) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
            showFieldError(field, 'Please enter a valid phone number');
            return false;
        }
    }
    
    return true;
}

// Validate month and year format (e.g. "January 2020")
function validateMonthYear(value) {
    if (!value || typeof value !== 'string') {
        return false;
    }
    
    const trimmed = value.trim();
    
    // Must contain at least one space to separate month and year
    if (!trimmed.includes(' ')) {
        return false;
    }
    
    const parts = trimmed.split(/\s+/);
    const month = parts[0];
    const year = parts[parts.length - 1];
    
    // Valid month names (full or abbreviated)
    const validMonths = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
        'jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
    ];
    
    // Check if first part is a valid month
    const isMonthValid = validMonths.some(m => 
        month.toLowerCase() === m
    );
    
    // Check if last part is a valid 4-digit year
    const yearRegex = /^\d{4}$/;
    const isYearValid = yearRegex.test(year) && parseInt(year) >= 1900 && parseInt(year) <= 2100;
    
    return isMonthValid && isYearValid;
}

// Show field error
function showFieldError(field, message) {
    field.style.borderColor = '#e74c3c';
    
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
        existingError.remove();
    }
    
    // Add error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.style.color = '#e74c3c';
    errorDiv.style.fontSize = '0.8rem';
    errorDiv.style.marginTop = '0.25rem';
    errorDiv.textContent = message;
    
    field.parentNode.appendChild(errorDiv);
}

// Clear field error
function clearFieldError(e) {
    const field = e.target;
    field.style.borderColor = '#e9ecef';
    
    const errorDiv = field.parentNode.querySelector('.field-error');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Clear field error from event (wrapper function)
function clearFieldErrorFromEvent(e) {
    const field = e.target;
    field.style.borderColor = '#e9ecef';
    
    const errorDiv = field.parentNode.querySelector('.field-error');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Show full-screen loading overlay
function showFullScreenLoading(message = 'Submitting...') {
    // Remove existing overlay if any
    const existing = document.getElementById('fullscreen-loading-overlay');
    if (existing) {
        existing.remove();
    }
    
    const overlay = document.createElement('div');
    overlay.id = 'fullscreen-loading-overlay';
    overlay.className = 'fullscreen-loading';
    overlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <div class="loading-text">${message}</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

// Hide full-screen loading overlay
function hideFullScreenLoading() {
    const overlay = document.getElementById('fullscreen-loading-overlay');
    if (overlay) {
        overlay.remove();
    }
    document.body.style.overflow = ''; // Restore scrolling
}

// Set form loading state
function setFormLoading(loading) {
    const form = document.getElementById('requestForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    if (loading) {
        form.classList.add('loading');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    } else {
        form.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
    }
}

// Show message
function showMessage(message, type, formId = null) {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.popup-message');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new popup message
    const messageDiv = document.createElement('div');
    messageDiv.className = `popup-message ${type === 'success' ? 'success-message' : 'error-message'}`;
    messageDiv.textContent = message;
    
    // Add to body as fixed positioned element
    document.body.appendChild(messageDiv);
    
    // Trigger animation
    setTimeout(() => {
        messageDiv.classList.add('show');
    }, 10);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.classList.remove('show');
            setTimeout(() => {
                messageDiv.remove();
            }, 300); // Wait for animation to complete
        }
    }, 5000);
}

// Check if any form has data
function hasFormData() {
    // Get all form containers
    const formContainers = [
        'barangayIdForm',
        'certificationForm',
        'coeForm',
        'indigencyForm',
        'clearanceForm'
    ];
    
    for (let containerId of formContainers) {
        const container = document.getElementById(containerId);
        if (container && container.style.display !== 'none') {
            // Check all input fields in this container
            const inputs = container.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input[type="number"], textarea, select');
            for (let input of inputs) {
                if (input.value && input.value.trim() !== '') {
                    return true;
                }
            }
            
            // Check radio buttons
            const radioGroups = container.querySelectorAll('input[type="radio"]');
            for (let radio of radioGroups) {
                if (radio.checked) {
                    return true;
                }
            }
            
            // Check file inputs
            const fileInputs = container.querySelectorAll('input[type="file"]');
            for (let fileInput of fileInputs) {
                if (fileInput.files && fileInput.files.length > 0) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Show confirmation dialog for form switching
async function showFormSwitchConfirmation(documentType) {
    const result = await Swal.fire({
        title: 'Discard Current Activity?',
        text: 'You have unsaved changes. Are you sure you want to switch to another document? Your current progress will be lost.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Continue',
        cancelButtonText: 'Cancel',
        reverseButtons: true
    });
    
    return result.isConfirmed;
}

// Hide all report displays
function hideAllReportDisplays() {
    const reportDisplays = [
        'barangayIdReportDisplay',
        'certificationReportDisplay', 
        'coeReportDisplay',
        'indigencyReportDisplay',
        'clearanceReportDisplay'
    ];
    
    reportDisplays.forEach(displayId => {
        const display = document.getElementById(displayId);
        if (display) {
            display.style.display = 'none';
        }
    });
}

// Clear all form inputs
function clearAllFormInputs() {
    // Get all form wrappers
    const formWrappers = document.querySelectorAll('.form-wrapper');
    
    formWrappers.forEach(wrapper => {
        // Clear all input fields
        const inputs = wrapper.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input[type="number"], input[type="file"], textarea, select');
        inputs.forEach(input => {
            input.value = '';
            // Clear any validation errors
            input.style.borderColor = '';
            const errorDiv = input.parentNode.querySelector('.field-error');
            if (errorDiv) {
                errorDiv.remove();
            }
        });
        
        // Clear radio buttons
        const radioButtons = wrapper.querySelectorAll('input[type="radio"]');
        radioButtons.forEach(radio => {
            radio.checked = false;
        });
        
        // Clear checkboxes
        const checkboxes = wrapper.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        
        // Clear image previews
        const imagePreviews = wrapper.querySelectorAll('.image-preview');
        imagePreviews.forEach(preview => {
            preview.style.display = 'none';
            preview.src = '';
        });
        
        // Hide "other" input groups
        const otherGroups = wrapper.querySelectorAll('[id$="Group"]');
        otherGroups.forEach(group => {
            group.style.display = 'none';
        });
    });
    
    // Reset multi-step form for Barangay ID
    resetBarangayIdFormSteps();
    
    // Hide all report displays
    hideAllReportDisplays();
    
    console.log('All form inputs cleared');
}

// Setup sidebar navigation
function setupSidebarNavigation() {
    // Home button navigation
    const homeItem = document.querySelector('.home-item');
    if (homeItem) {
        homeItem.addEventListener('click', async function() {
            // Check if current form has data and show confirmation if needed
            if (hasFormData()) {
                const confirmed = await showFormSwitchConfirmation('home');
                if (!confirmed) {
                    return; // User cancelled, don't navigate
                }
            }
            
            // Clear all forms before navigating
            clearAllFormInputs();
            window.location.href = 'main_UI.html';
        });
    }
    
    // Document buttons navigation
    const documentButtons = document.querySelectorAll('.document-btn:not(.emergency-btn)');
    documentButtons.forEach(button => {
        button.addEventListener('click', async function(e) {
            // If button is disabled due to active request, block navigation and notify
            if (this.classList.contains('disabled-doc')) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'info',
                        title: 'Request in Progress',
                        text: 'Unable to request while your request is still processing. Please wait until it\'s finished.',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#3085d6',
                        customClass: {
                            popup: 'swal2-blocked-request-popup'
                        }
                    });
                } else {
                    const reason = this.getAttribute('data-disabled-reason') || 'Your request is in process. Wait to finish to submit again.';
                    showMessage(reason, 'error');
                }
                return false;
            }
            const documentType = this.getAttribute('data-document');
            
            // Check if current form has data and show confirmation if needed
            if (hasFormData()) {
                const confirmed = await showFormSwitchConfirmation(documentType);
                if (!confirmed) {
                    return; // User cancelled, don't switch forms
                }
            }
            
            // Clear all forms when switching documents
            clearAllFormInputs();
            
            // Hide all report displays when switching documents
            hideAllReportDisplays();
            
            // Hide sidebar when document button is clicked
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
            }
            
            // Update active state
            documentButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Show/hide content based on document type
            if (documentType === 'barangay-id') {
                showBarangayIdForm();
            } else if (documentType === 'certification-form') {
                showCertificationForm();
            } else if (documentType === 'certification-employment') {
                showCoeForm();
            } else if (documentType === 'indigency-form') {
                showIndigencyForm();
            } else if (documentType === 'clearance-form') {
                showClearanceForm();
            } else {
                hideAllForms();
                showEmblemSection();
            }
        });
    });
    
    console.log('Sidebar navigation initialized');
}

// Show Barangay ID Form
function showBarangayIdForm() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    if (emblemSection) emblemSection.style.display = 'none';
    if (certificationForm) certificationForm.style.display = 'none';
    if (coeForm) coeForm.style.display = 'none';
    if (indigencyForm) indigencyForm.style.display = 'none';
    if (clearanceForm) clearanceForm.style.display = 'none';
    
    // Block showing the form if restricted
    if (typeof shouldBlockForm === 'function') {
        const shouldBlock = shouldBlockForm('barangay-id');
        if (shouldBlock) {
            showMessage('Your Barangay ID request is in process. Wait to finish to submit again.', 'error');
            return;
        }
    }
    if (barangayIdForm) {
        barangayIdForm.style.display = 'block';
        
        // Populate with cached data immediately, then refresh in background
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            const user = JSON.parse(stored);
            populateUserToAllForms(user);
        }
        // Also fetch fresh data in the background
        loadUserData();
        
        // Scroll to top of form with a small delay to ensure form is rendered
        setTimeout(() => {
            barangayIdForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

// Show Certification Form
function showCertificationForm() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    if (emblemSection) emblemSection.style.display = 'none';
    if (barangayIdForm) barangayIdForm.style.display = 'none';
    if (coeForm) coeForm.style.display = 'none';
    if (indigencyForm) indigencyForm.style.display = 'none';
    if (clearanceForm) clearanceForm.style.display = 'none';
    
    // Block showing the form if restricted
    if (typeof shouldBlockForm === 'function') {
        const shouldBlock = shouldBlockForm('certification-form');
        if (shouldBlock) {
            showMessage('Your Certification request is in process. Wait to finish to submit again.', 'error');
            return;
        }
    }
    if (certificationForm) {
        certificationForm.style.display = 'block';
        // Reset multi-step form
        resetCertFormSteps();
        
        // Populate with cached data immediately, then refresh in background
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            const user = JSON.parse(stored);
            populateUserToAllForms(user);
        }
        // Also fetch fresh data in the background
        loadUserData();
        
        // Scroll to top of form with a small delay to ensure form is rendered
        setTimeout(() => {
            certificationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

// Show COE Form
function showCoeForm() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    if (emblemSection) emblemSection.style.display = 'none';
    if (barangayIdForm) barangayIdForm.style.display = 'none';
    if (certificationForm) certificationForm.style.display = 'none';
    if (indigencyForm) indigencyForm.style.display = 'none';
    if (clearanceForm) clearanceForm.style.display = 'none';
    
    // Block showing the form if restricted
    if (typeof shouldBlockForm === 'function') {
        const shouldBlock = shouldBlockForm('certification-employment');
        if (shouldBlock) {
            showMessage('Your COE request is in process. Wait to finish to submit again.', 'error');
            return;
        }
    }
    if (coeForm) {
        coeForm.style.display = 'block';
        
        // Populate with cached data immediately, then refresh in background
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            const user = JSON.parse(stored);
            populateUserToAllForms(user);
        }
        // Also fetch fresh data in the background
        loadUserData();
        
        // Scroll to top of form with a small delay to ensure form is rendered
        setTimeout(() => {
            coeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        // Reset multi-step form
        resetCoeFormSteps();
    }
}

// Show Indigency Form
function showIndigencyForm() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    if (emblemSection) emblemSection.style.display = 'none';
    if (barangayIdForm) barangayIdForm.style.display = 'none';
    if (certificationForm) certificationForm.style.display = 'none';
    if (coeForm) coeForm.style.display = 'none';
    if (clearanceForm) clearanceForm.style.display = 'none';
    
    // Block showing the form if restricted
    if (typeof shouldBlockForm === 'function') {
        const shouldBlock = shouldBlockForm('indigency-form');
        console.log('Checking if indigency form should be blocked:', shouldBlock);
        if (shouldBlock) {
            console.log('BLOCKING indigency form - request is in process');
            showMessage('Your Indigency request is in process. Wait to finish to submit again.', 'error');
            return;
        }
    } else {
        console.log('shouldBlockForm function not yet loaded');
    }
    if (indigencyForm) {
        indigencyForm.style.display = 'block';
        
        // Populate with cached data immediately, then refresh in background
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            const user = JSON.parse(stored);
            populateUserToAllForms(user);
        }
        // Also fetch fresh data in the background
        loadUserData();
        
        // Scroll to top of form with a small delay to ensure form is rendered
        setTimeout(() => {
            indigencyForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        // Reset multi-step form
        resetIndFormSteps();
    }
}

// Show Clearance Form
function showClearanceForm() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    if (emblemSection) emblemSection.style.display = 'none';
    if (barangayIdForm) barangayIdForm.style.display = 'none';
    if (certificationForm) certificationForm.style.display = 'none';
    if (coeForm) coeForm.style.display = 'none';
    if (indigencyForm) indigencyForm.style.display = 'none';
    
    // Block showing the form if restricted
    if (typeof shouldBlockForm === 'function') {
        const shouldBlock = shouldBlockForm('clearance-form');
        if (shouldBlock) {
            showMessage('Your Clearance request is in process. Wait to finish to submit again.', 'error');
            return;
        }
    }
    if (clearanceForm) {
        clearanceForm.style.display = 'block';
        
        // Populate with cached data immediately, then refresh in background
        const stored = sessionStorage.getItem('resident_data');
        if (stored) {
            const user = JSON.parse(stored);
            populateUserToAllForms(user);
        }
        // Also fetch fresh data in the background
        loadUserData();
        
        // Scroll to top of form with a small delay to ensure form is rendered
        setTimeout(() => {
            clearanceForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        // Reset multi-step form
        resetClearFormSteps();
    }
}

// Hide all forms and show emblem section
function hideAllForms() {
    const emblemSection = document.getElementById('emblemSection');
    const barangayIdForm = document.getElementById('barangayIdForm');
    const certificationForm = document.getElementById('certificationForm');
    const coeForm = document.getElementById('coeForm');
    const indigencyForm = document.getElementById('indigencyForm');
    const clearanceForm = document.getElementById('clearanceForm');
    const sidebar = document.querySelector('.sidebar');
    
    // Hide all report displays
    hideAllReportDisplays();
    
    // Show sidebar again (remove collapsed class)
    if (sidebar) {
        sidebar.classList.remove('collapsed');
    }
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn');
    documentButtons.forEach(btn => btn.classList.remove('active'));
    
    if (emblemSection) {
        emblemSection.style.display = 'block';
    }
    
    if (barangayIdForm) {
        barangayIdForm.style.display = 'none';
    }
    
    if (certificationForm) {
        certificationForm.style.display = 'none';
    }
    
    if (coeForm) {
        coeForm.style.display = 'none';
    }
    
    if (indigencyForm) {
        indigencyForm.style.display = 'none';
    }
    
    if (clearanceForm) {
        clearanceForm.style.display = 'none';
    }
    
    // Scroll to top to show the document selection
    setTimeout(() => {
        if (emblemSection) {
            emblemSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}

// Show emblem section
function showEmblemSection() {
    const emblemSection = document.getElementById('emblemSection');
    if (emblemSection) {
        emblemSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Setup Barangay ID Form
function setupBarangayIdForm() {
    const form = document.getElementById('barangayIdFormElement');
    if (form) {
        form.addEventListener('submit', handleBarangayIdSubmission);
        // Initialize multi-step form
        setupBarangayIdFormSteps();
        
        // Set default values for province, municipality, and barangay
        const provinceField = document.getElementById('province');
        const municipalityField = document.getElementById('municipality');
        const barangayField = document.getElementById('barangay');
        
        if (provinceField) provinceField.value = 'Bulacan';
        if (municipalityField) municipalityField.value = 'Norzagaray';
        if (barangayField) barangayField.value = 'Bigte';
        
        // Setup ID upload validation
        const idUpload = document.getElementById('idUpload');
        if (idUpload) {
            idUpload.addEventListener('change', async function(e) {
                const file = e.target.files[0];
                if (file) {
                    await handleIDImageUpload(file, 'barangayId');
                }
            });
        }
        
        // Setup 1x1 picture upload validation
        const idPictureUpload = document.getElementById('idPictureUpload');
        if (idPictureUpload) {
            idPictureUpload.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    validate1x1Photo(file, idPictureUpload);
                }
            });
        }
    }
}

// Setup Certification Form
function setupCertificationForm() {
    const form = document.getElementById('certificationFormElement');
    if (form) {
        form.addEventListener('submit', handleCertificationSubmission);
        // Initialize multi-step form
        resetCertFormSteps();
    }
    
    // Setup comma formatting for Monthly Income
    const monthlyIncomeInput = document.getElementById('certMonthlyIncome');
    if (monthlyIncomeInput) {
        monthlyIncomeInput.addEventListener('input', function(e) {
            let value = e.target.value;
            // Remove all non-digit characters
            const numericValue = value.replace(/[^\d]/g, '');
            
            if (numericValue) {
                // Format with commas
                const formattedValue = parseFloat(numericValue).toLocaleString('en-US');
                e.target.value = formattedValue;
            }
        });
        
        // Handle blur to ensure valid number
        monthlyIncomeInput.addEventListener('blur', function(e) {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value && parseFloat(value) > 0) {
                e.target.value = parseFloat(value).toLocaleString('en-US');
            }
        });
    }
    
    // Setup validation for Month and Year of Passing
    const monthYearPassingInput = document.getElementById('certMonthYearPassing');
    if (monthYearPassingInput) {
        monthYearPassingInput.addEventListener('blur', function(e) {
            const value = e.target.value.trim();
            if (value && !validateMonthYear(value)) {
                showFieldError(e.target, 'Please enter both month and year (e.g. January 2020)');
            } else if (value) {
                clearFieldError(e.target);
            }
        });
        
        monthYearPassingInput.addEventListener('input', function(e) {
            clearFieldErrorFromEvent(e);
        });
    }
    
    // Setup ID upload validation
    const certIdUpload = document.getElementById('certIdUpload');
    if (certIdUpload) {
        certIdUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                await handleIDImageUpload(file, 'certification');
            }
        });
    }
}

// Setup COE Form
function setupCoeForm() {
    const form = document.getElementById('coeFormElement');
    if (form) {
        form.addEventListener('submit', handleCoeSubmission);
        // Initialize multi-step form
        resetCoeFormSteps();
    }
    
    // Setup comma formatting for Monthly Salary
    const monthlySalaryInput = document.getElementById('coeMonthlySalary');
    if (monthlySalaryInput) {
        monthlySalaryInput.addEventListener('input', function(e) {
            let value = e.target.value;
            // Remove all non-digit characters
            const numericValue = value.replace(/[^\d]/g, '');
            
            if (numericValue) {
                // Format with commas
                const formattedValue = parseFloat(numericValue).toLocaleString('en-US');
                e.target.value = formattedValue;
            }
        });
        
        // Handle blur to ensure valid number
        monthlySalaryInput.addEventListener('blur', function(e) {
            let value = e.target.value.replace(/[^\d]/g, '');
            if (value && parseFloat(value) > 0) {
                e.target.value = parseFloat(value).toLocaleString('en-US');
            }
        });
    }
    
    // Setup ID upload validation
    const coeIdUpload = document.getElementById('coeIdUpload');
    if (coeIdUpload) {
        coeIdUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                await handleIDImageUpload(file, 'coe');
            }
        });
    }
}

// Setup Indigency Form
function setupIndigencyForm() {
    const form = document.getElementById('indigencyFormElement');
    if (form) {
        form.addEventListener('submit', handleIndigencySubmission);
        // Initialize multi-step form
        resetIndFormSteps();
    }
    
    // Setup ID upload validation
    const indIdUpload = document.getElementById('indIdUpload');
    if (indIdUpload) {
        indIdUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                await handleIDImageUpload(file, 'indigency');
            }
        });
    }
}

// Setup Clearance Form
function setupClearanceForm() {
    const form = document.getElementById('clearanceFormElement');
    if (form) {
        form.addEventListener('submit', handleClearanceSubmission);
        // Initialize multi-step form
        resetClearFormSteps();
    }
    
    // Setup ID upload validation
    const clearIdUpload = document.getElementById('clearIdUpload');
    if (clearIdUpload) {
        clearIdUpload.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (file) {
                await handleIDImageUpload(file, 'clearance');
            }
        });
    }
}

// Handle Barangay ID Form Submission
async function handleBarangayIdSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Validate required fields only in visible/active steps
    const activeSteps = form.querySelectorAll('.form-step.active');
    let isValid = true;
    
    activeSteps.forEach(step => {
        const requiredFields = step.querySelectorAll('[required]');
        requiredFields.forEach(field => {
            if (field.type === 'radio') {
                const radioGroup = step.querySelector(`input[name="${field.name}"]:checked`);
                if (!radioGroup) {
                    isValid = false;
                    showFieldError(field, 'This field is required');
                } else {
                    clearFieldError(field);
                }
            } else {
                if (!field.value.trim()) {
                    isValid = false;
                    showFieldError(field, 'This field is required');
                } else {
                    clearFieldError(field);
                }
            }
        });
    });
    
    // Validate required file uploads
    const idPictureUpload = document.getElementById('idPictureUpload');
    const idUpload = document.getElementById('idUpload');
    
    if (!idPictureUpload.files || !idPictureUpload.files[0]) {
        isValid = false;
        showFieldError(idPictureUpload, 'Please upload a 1x1 ID picture.');
    }
    
    if (!idUpload.files || !idUpload.files[0]) {
        isValid = false;
        showFieldError(idUpload, 'Please upload an ID image.');
    }
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
        return;
    }
    
    // Show full-screen loading
    showFullScreenLoading('Submitting your request...');
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // Validate ID address contains "Bigte"
    if (idUpload.files && idUpload.files[0]) {
        // If validation hasn't been done yet, do it now
        if (!idOcrValidation.barangayId.ok || idOcrValidation.barangayId.hasBigte === undefined) {
            await handleIDImageUpload(idUpload.files[0], 'barangayId');
        }
        
        // Show SweetAlert if Bigte not found
        if (idOcrValidation.barangayId.ok && !idOcrValidation.barangayId.hasBigte) {
            await Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            hideFullScreenLoading();
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
    }
    
    try {
        // Handle ID image upload (required)
        let idImageData = null;
        const idImageInput = document.getElementById('idUpload');
        if (idImageInput.files && idImageInput.files[0]) {
            const file = idImageInput.files[0];
            const reader = new FileReader();
            idImageData = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result.split(',')[1]); // Remove data:image/...;base64, prefix
                reader.readAsDataURL(file);
            });
        }
        
        // Handle 1x1 picture upload (required)
        let pictureData = null;
        const pictureInput = document.getElementById('idPictureUpload');
        if (pictureInput.files && pictureInput.files[0]) {
            const file = pictureInput.files[0];
            const reader = new FileReader();
            pictureData = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result.split(',')[1]); // Remove data:image/...;base64, prefix
                reader.readAsDataURL(file);
            });
        }
        
        // Prepare data for submission
        // Combine Province, Municipality, Barangay, and Street Address into one address field
        const province = formData.get('province') || 'Bulacan';
        const municipality = formData.get('municipality') || 'Norzagaray';
        const barangay = formData.get('barangay') || 'Bigte';
        const streetAddress = formData.get('streetAddress');
        
        const fullAddress = `${streetAddress}, ${barangay}, ${municipality}, ${province}`;
        
        // Get user email
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        
        const submissionData = {
            form_type: 'barangay_id',
            email: userEmail,
            last_name: formData.get('lastName'),
            given_name: formData.get('firstName'),
            middle_name: formData.get('middleName'),
            birth_date: formData.get('birthDate'),
            address: fullAddress,
            height: formData.get('height'),
            weight: formData.get('weight'),
            civil_status: formData.get('civilStatus'),
            gender: formData.get('gender'),
            nationality: formData.get('nationality'),
            other_nationality: formData.get('otherNationality'),
            emergency_contact_name: formData.get('guardianName'),
            emergency_contact_number: formData.get('guardianContact'),
            residency_duration: formData.get('residencyDuration'),
            valid_id: formData.get('idType'),
            other_valid_id: formData.get('otherIdType'),
            id_image: idImageData,
            res_picture: pictureData
        };
        
        // Debug: Log submission data
        console.log('Submitting Barangay ID form:', submissionData);
        console.log('Form data keys:', Array.from(formData.keys()));
        console.log('Form data values:', Array.from(formData.values()));
        
        // Submit to PHP backend
        const response = await fetch('php/request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);
        
        // Hide full-screen loading
        hideFullScreenLoading();
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            // Display the submitted barangay ID form
            displayBarangayIdForm(formData);
            
            // Hide form and show report display
            document.getElementById('barangayIdForm').style.display = 'none';
            document.getElementById('barangayIdReportDisplay').style.display = 'block';
            
            // Hide emblem section
            const emblemSection = document.getElementById('emblemSection');
            if (emblemSection) {
                emblemSection.style.display = 'none';
            }
            
            // Hide sidebar (collapse it) like when showing forms
            const sidebar = document.querySelector('.sidebar');
            if (sidebar && !sidebar.classList.contains('collapsed')) {
                sidebar.classList.add('collapsed');
            }
            
            // Scroll to report display
            document.getElementById('barangayIdReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            // Re-apply active request restrictions immediately
            setTimeout(async () => {
                try { 
                    await applyActiveRequestRestrictions();
                    await applyActiveRequestRestrictions(); // Call twice to ensure it's applied
                    console.log('Restrictions applied after Barangay ID submission');
                } catch (error) {
                    console.error('Error applying restrictions after submission:', error);
                }
            }, 300);
        } else {
            showMessage('Error: ' + result.message, 'error', 'barangayIdFormElement');
        }
        
    } catch (error) {
        console.error('Error submitting Barangay ID form:', error);
        
        // Hide full-screen loading
        hideFullScreenLoading();
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        showMessage('Network error. Please try again.', 'error', 'barangayIdFormElement');
    }
}

// Helper function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            // Remove the data:image/...;base64, prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
    });
}

// Handle Certification Form Submission
async function handleCertificationSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Validate required fields
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            showFieldError(field, 'This field is required');
        } else {
            clearFieldError(field);
        }
    });
    
    // Validate "other" purpose field
    const certPurpose = formData.get('certPurpose');
    const otherCertPurpose = document.getElementById('otherCertPurpose');
    
    if (certPurpose === 'other') {
        if (!otherCertPurpose || !otherCertPurpose.value.trim()) {
            isValid = false;
            if (otherCertPurpose) {
                showFieldError(otherCertPurpose, 'Please specify purpose');
            }
        } else {
            clearFieldError(otherCertPurpose);
        }
    }
    
    // Validate conditional fields based on purpose
    const certCitizenship = document.getElementById('certCitizenship');
    const certResidencyCitizenship = document.getElementById('certResidencyCitizenship');
    const certJob = document.getElementById('certJob');
    const certDateHire = document.getElementById('certDateHire');
    const certMonthlyIncome = document.getElementById('certMonthlyIncome');
    const certYearResiding = document.getElementById('certYearResiding');
    const certMonthYearPassing = document.getElementById('certMonthYearPassing');
    
    if (certPurpose === 'pag-ibig-loan') {
        if (!certCitizenship || !certCitizenship.value.trim()) {
            isValid = false;
            if (certCitizenship) {
                showFieldError(certCitizenship, 'Citizenship is required');
            }
        }
        if (!certJob || !certJob.value.trim()) {
            isValid = false;
            if (certJob) {
                showFieldError(certJob, 'Job is required');
            }
        }
        if (!certDateHire || !certDateHire.value.trim()) {
            isValid = false;
            if (certDateHire) {
                showFieldError(certDateHire, 'Date of Hire is required');
            }
        }
        if (!certMonthlyIncome || !certMonthlyIncome.value.trim()) {
            isValid = false;
            if (certMonthlyIncome) {
                showFieldError(certMonthlyIncome, 'Monthly Income is required');
            }
        }
    } else if (certPurpose === 'proof-of-residency') {
        if (!certResidencyCitizenship || !certResidencyCitizenship.value.trim()) {
            isValid = false;
            if (certResidencyCitizenship) {
                showFieldError(certResidencyCitizenship, 'Citizenship is required');
            }
        }
        if (!certYearResiding || !certYearResiding.value.trim()) {
            isValid = false;
            if (certYearResiding) {
                showFieldError(certYearResiding, 'Year Start Residing is required');
            }
        }
    } else if (certPurpose === 'certification-for-dead') {
        if (!certCitizenship || !certCitizenship.value.trim()) {
            isValid = false;
            if (certCitizenship) {
                showFieldError(certCitizenship, 'Citizenship is required');
            }
        }
        if (!certMonthYearPassing || !certMonthYearPassing.value.trim()) {
            isValid = false;
            if (certMonthYearPassing) {
                showFieldError(certMonthYearPassing, 'Month and Year of Passing is required');
            }
        } else if (certMonthYearPassing && !validateMonthYear(certMonthYearPassing.value)) {
            isValid = false;
            showFieldError(certMonthYearPassing, 'Please enter both month and year (e.g. January 2020)');
        }
    }
    
    // Validate required file upload
    const certIdUpload = document.getElementById('certIdUpload');
    
    if (!certIdUpload.files || !certIdUpload.files[0]) {
        isValid = false;
        showFieldError(certIdUpload, 'Please upload an ID image.');
    }
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
        return;
    }
    
    // Show full-screen loading
    showFullScreenLoading('Submitting your request...');
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // Validate ID address contains "Bigte"
    if (certIdUpload.files && certIdUpload.files[0]) {
        // If validation hasn't been done yet, do it now
        if (!idOcrValidation.certification.ok || idOcrValidation.certification.hasBigte === undefined) {
            await handleIDImageUpload(certIdUpload.files[0], 'certification');
        }
        
        // Show SweetAlert if Bigte not found
        if (idOcrValidation.certification.ok && !idOcrValidation.certification.hasBigte) {
            await Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            hideFullScreenLoading();
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
    }
    
    // Get user email
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    
    // Prepare data for API submission
    const purpose = formData.get('certPurpose');
    const submissionData = {
        form_type: 'certification',
        email: userEmail,
        first_name: formData.get('certFirstName'),
        middle_name: formData.get('certMiddleName'),
        last_name: formData.get('certLastName'),
        address: formData.get('certAddress'),
        birth_date: formData.get('certBirthDate'),
        birth_place: formData.get('certBirthPlace'),
        civil_status: formData.get('certCivilStatus'),
        gender: formData.get('certGender'),
        purpose: purpose === 'other' ? formData.get('otherCertPurpose') : purpose,
        citizenship: formData.get('certCitizenship') || formData.get('certResidencyCitizenship') || null,
        job: formData.get('certJob') || null,
        date_hire: formData.get('certDateHire') || null,
        monthly_income: formData.get('certMonthlyIncome') ? formData.get('certMonthlyIncome').replace(/,/g, '') : null,
        year_residing: formData.get('certYearResiding') || null,
        month_year_passing: formData.get('certMonthYearPassing') || null,
        valid_id: formData.get('certIdType'),
        id_image: formData.get('certIdUpload') ? await fileToBase64(formData.get('certIdUpload')) : null
    };
    
    // Submit to API
    try {
        const response = await fetch('php/request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Display the submitted certification form
            displayCertificationForm(formData);
            
            // Hide form and show report display
            document.getElementById('certificationForm').style.display = 'none';
            document.getElementById('certificationReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('certificationReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('Certification application submitted successfully!', 'success', 'certificationFormElement');
            
            // Re-apply active request restrictions immediately
            try { await applyActiveRequestRestrictions(); } catch (_) {}
        } else {
            showMessage(result.message || 'Failed to submit certification form', 'error', 'certificationFormElement');
        }
    } catch (error) {
        console.error('Error submitting certification form:', error);
        showMessage('Network error. Please try again.', 'error', 'certificationFormElement');
    } finally {
        hideFullScreenLoading();
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Handle COE Form Submission
async function handleCoeSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Show all steps temporarily to validate all fields
    const allSteps = form.querySelectorAll('.form-step');
    allSteps.forEach(step => {
        step.classList.add('active');
    });
    
    // Validate required fields - only check visible fields
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        // Skip radio buttons (handled separately)
        if (field.type === 'radio') {
            return;
        }
        
        // For date fields, check if value exists
        if (field.type === 'date') {
            if (!field.value) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        } else if (!field.value || !field.value.trim()) {
            isValid = false;
            showFieldError(field, 'This field is required');
        } else {
            clearFieldError(field);
        }
    });
    
    // Restore step visibility - show last step (where submit button is)
    allSteps.forEach(step => {
        step.classList.remove('active');
    });
    const lastStep = form.querySelector('.form-step:last-of-type');
    if (lastStep) {
        lastStep.classList.add('active');
    }
    
    // Validate radio button groups
    const genderSelected = form.querySelector('input[name="coeGender"]:checked');
    const civilStatusSelected = form.querySelector('input[name="coeCivilStatus"]:checked');
    const employmentTypeSelected = form.querySelector('input[name="coeEmploymentType"]:checked');
    
    if (!genderSelected) {
        isValid = false;
        const firstGender = form.querySelector('input[name="coeGender"]');
        showFieldError(firstGender, 'Please select gender.');
    }
    
    if (!civilStatusSelected) {
        isValid = false;
        const firstCivilStatus = form.querySelector('input[name="coeCivilStatus"]');
        showFieldError(firstCivilStatus, 'Please select civil status.');
    }
    
    if (!employmentTypeSelected) {
        isValid = false;
        const firstEmploymentType = form.querySelector('input[name="coeEmploymentType"]');
        showFieldError(firstEmploymentType, 'Please select employment type.');
    }
    
    // Validate position field
    const coePosition = document.getElementById('coePosition');
    if (!coePosition || !coePosition.value.trim()) {
        isValid = false;
        if (coePosition) {
            showFieldError(coePosition, 'Position is required');
        }
    }
    
    // Validate date started field
    const coeDateStarted = document.getElementById('coeDateStarted');
    if (!coeDateStarted || !coeDateStarted.value.trim()) {
        isValid = false;
        if (coeDateStarted) {
            showFieldError(coeDateStarted, 'Date Started is required');
        }
    }
    
    // Validate monthly salary field
    const coeMonthlySalary = document.getElementById('coeMonthlySalary');
    if (!coeMonthlySalary || !coeMonthlySalary.value.trim()) {
        isValid = false;
        if (coeMonthlySalary) {
            showFieldError(coeMonthlySalary, 'Monthly Salary is required');
        }
    }
    
    // Validate required file upload
    const coeIdUpload = document.getElementById('coeIdUpload');
    
    if (!coeIdUpload.files || !coeIdUpload.files[0]) {
        isValid = false;
        showFieldError(coeIdUpload, 'Please upload an ID image.');
    }
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
        return;
    }
    
    // Show full-screen loading
    showFullScreenLoading('Submitting your request...');
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // Validate ID address contains "Bigte"
    if (coeIdUpload.files && coeIdUpload.files[0]) {
        // If validation hasn't been done yet, do it now
        if (!idOcrValidation.coe.ok || idOcrValidation.coe.hasBigte === undefined) {
            await handleIDImageUpload(coeIdUpload.files[0], 'coe');
        }
        
        // Show SweetAlert if Bigte not found
        if (idOcrValidation.coe.ok && !idOcrValidation.coe.hasBigte) {
            await Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
    }
    
    // Get user email
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    
    // Prepare data for API submission
    const submissionData = {
        form_type: 'coe',
        email: userEmail,
        first_name: formData.get('coeFirstName'),
        middle_name: formData.get('coeMiddleName'),
        last_name: formData.get('coeLastName'),
        address: formData.get('coeAddress'),
        age: formData.get('coeAge'),
        gender: formData.get('coeGender'),
        civil_status: formData.get('coeCivilStatus'),
        employment_type: formData.get('coeEmploymentType'),
        position: formData.get('coePosition'),
        date_started: formData.get('coeDateStarted'),
        monthly_salary: formData.get('coeMonthlySalary') ? formData.get('coeMonthlySalary').replace(/,/g, '') : null,
        valid_id: formData.get('coeIdType'),
        id_image: formData.get('coeIdUpload') ? await fileToBase64(formData.get('coeIdUpload')) : null
    };
    
    // Submit to API
    try {
        const response = await fetch('php/request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Display the submitted COE form
            displayCoeForm(formData);
            
            // Hide form and show report display
            document.getElementById('coeForm').style.display = 'none';
            document.getElementById('coeReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('coeReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('COE application submitted successfully!', 'success', 'coeFormElement');
            
            // Re-apply active request restrictions immediately
            try { await applyActiveRequestRestrictions(); } catch (_) {}
        } else {
            showMessage(result.message || 'Failed to submit COE form', 'error', 'coeFormElement');
        }
    } catch (error) {
        console.error('Error submitting COE form:', error);
        showMessage('Network error. Please try again.', 'error', 'coeFormElement');
    } finally {
        hideFullScreenLoading();
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Handle Indigency Form Submission
async function handleIndigencySubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Validate required fields
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            showFieldError(field, 'This field is required');
        } else {
            clearFieldError(field);
        }
    });
    
    // Validate birth date (date input automatically validates format)
    const birthDateField = form.querySelector('#indBirthDate');
    if (birthDateField && birthDateField.value.trim()) {
        // Check if date is not in the future
        const selectedDate = new Date(birthDateField.value);
        const today = new Date();
        if (selectedDate > today) {
            isValid = false;
            showFieldError(birthDateField, 'Birth date cannot be in the future.');
        }
    }
    
    // Validate required file upload
    const indIdUpload = document.getElementById('indIdUpload');
    
    if (!indIdUpload.files || !indIdUpload.files[0]) {
        isValid = false;
        showFieldError(indIdUpload, 'Please upload an ID image.');
    }
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
        return;
    }
    
    // Show full-screen loading
    showFullScreenLoading('Submitting your request...');
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // Validate ID address contains "Bigte"
    if (indIdUpload.files && indIdUpload.files[0]) {
        // If validation hasn't been done yet, do it now
        if (!idOcrValidation.indigency.ok || idOcrValidation.indigency.hasBigte === undefined) {
            await handleIDImageUpload(indIdUpload.files[0], 'indigency');
        }
        
        // Show SweetAlert if Bigte not found
        if (idOcrValidation.indigency.ok && !idOcrValidation.indigency.hasBigte) {
            await Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
    }
    
    try {
        // Handle image upload (optional)
        let imageData = null;
        const imageInput = document.getElementById('indIdUpload');
        if (imageInput.files && imageInput.files[0]) {
            const file = imageInput.files[0];
            const reader = new FileReader();
            imageData = await new Promise((resolve) => {
                reader.onload = (e) => resolve(e.target.result.split(',')[1]); // Remove data:image/...;base64, prefix
                reader.readAsDataURL(file);
            });
        }
        
        // Get user email
        const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        
        // Prepare data for submission
        const submissionData = {
            form_type: 'indigency',
            email: userEmail,
            first_name: formData.get('indFirstName'),
            middle_name: formData.get('indMiddleName'),
            last_name: formData.get('indLastName'),
            address: formData.get('indAddress'),
            birth_date: formData.get('indBirthDate'),
            birth_place: formData.get('indBirthPlace'),
            civil_status: formData.get('indCivilStatus'),
            age: formData.get('indAge'),
            gender: formData.get('indGender'),
            purpose: formData.get('indPurpose'),
            other_purpose: formData.get('otherIndPurpose'),
            valid_id: formData.get('indIdType'),
            other_valid_id: formData.get('otherIndIdType'),
            id_image: imageData
        };
        
        // Debug: Log submission data
        console.log('Submitting indigency form:', submissionData);
        
        // Submit to PHP backend
        const response = await fetch('php/request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        console.log('Response status:', response.status);
        const result = await response.json();
        console.log('Response result:', result);
        
        // Hide full-screen loading
        hideFullScreenLoading();
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            // Display the submitted indigency form
            displayIndigencyForm(formData);
            
            // Hide indigency form specifically and show report display
            document.getElementById('indigencyForm').style.display = 'none';
            document.getElementById('indigencyReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('indigencyReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('Indigency application submitted successfully!', 'success', 'indigencyFormElement');

            // Re-apply active request restrictions so indigency gets restricted immediately
            try { await applyActiveRequestRestrictions(); } catch (_) {}
        } else {
            showMessage('Error: ' + result.message, 'error', 'indigencyFormElement');
        }
        
    } catch (error) {
        console.error('Error submitting indigency form:', error);
        
        // Hide full-screen loading
        hideFullScreenLoading();
        
        // Reset button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        
        showMessage('Network error. Please try again.', 'error', 'indigencyFormElement');
    }
}

// Handle Clearance Form Submission
async function handleClearanceSubmission(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Validate required fields
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            showFieldError(field, 'This field is required');
        } else {
            clearFieldError(field);
        }
    });
    
    // Validate age field specifically
    const ageField = form.querySelector('#clearAge');
    if (!ageField.value.trim() || ageField.value < 1 || ageField.value > 120) {
        isValid = false;
        showFieldError(ageField, 'Please enter a valid age between 1 and 120.');
    } else {
        clearFieldError(ageField);
    }
    
    // Validate radio button groups
    const genderSelected = form.querySelector('input[name="clearGender"]:checked');
    const civilStatusSelected = form.querySelector('input[name="clearCivilStatus"]:checked');
    
    if (!genderSelected) {
        isValid = false;
        const firstGender = form.querySelector('input[name="clearGender"]');
        showFieldError(firstGender, 'Please select gender.');
    }
    
    if (!civilStatusSelected) {
        isValid = false;
        const firstCivilStatus = form.querySelector('input[name="clearCivilStatus"]');
        showFieldError(firstCivilStatus, 'Please select civil status.');
    }
    
    // Validate birth date (date input automatically validates format)
    const birthDateField = form.querySelector('#clearBirthDate');
    if (birthDateField && birthDateField.value.trim()) {
        // Check if date is not in the future
        const selectedDate = new Date(birthDateField.value);
        const today = new Date();
        if (selectedDate > today) {
            isValid = false;
            showFieldError(birthDateField, 'Birth date cannot be in the future.');
        }
    }
    
    // Validate required file upload
    const clearIdUpload = document.getElementById('clearIdUpload');
    
    if (!clearIdUpload.files || !clearIdUpload.files[0]) {
        isValid = false;
        showFieldError(clearIdUpload, 'Please upload an ID image.');
    }
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
        return;
    }
    
    // Show full-screen loading
    showFullScreenLoading('Submitting your request...');
    
    // Show loading state
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    // Validate ID address contains "Bigte"
    if (clearIdUpload.files && clearIdUpload.files[0]) {
        // If validation hasn't been done yet, do it now
        if (!idOcrValidation.clearance.ok || idOcrValidation.clearance.hasBigte === undefined) {
            await handleIDImageUpload(clearIdUpload.files[0], 'clearance');
        }
        
        // Show SweetAlert if Bigte not found
        if (idOcrValidation.clearance.ok && !idOcrValidation.clearance.hasBigte) {
            await Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }
    }
    
    // Get user email
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
    
    // Prepare data for API submission
    const purpose = formData.get('clearPurpose');
    const submissionData = {
        form_type: 'clearance',
        email: userEmail,
        first_name: formData.get('clearFirstName'),
        middle_name: formData.get('clearMiddleName'),
        last_name: formData.get('clearLastName'),
        address: formData.get('clearAddress'),
        birth_date: formData.get('clearBirthDate'),
        birth_place: formData.get('clearBirthPlace'),
        civil_status: formData.get('clearCivilStatus'),
        age: formData.get('clearAge'),
        gender: formData.get('clearGender'),
        purpose: purpose,
        // Conditional fields based on purpose
        citizenship: formData.get('clearCitizenship') || null,
        business_name: formData.get('clearBusinessName') || null,
        business_location: formData.get('clearBusinessLocation') || null,
        year_start_residing: formData.get('clearYearResiding') || null,
        valid_id: formData.get('clearIdType'),
        id_image: formData.get('clearIdUpload') ? await fileToBase64(formData.get('clearIdUpload')) : null
    };
    
    // Submit to API
    try {
        const response = await fetch('php/request.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Display the submitted clearance form
            displayClearanceForm(formData);
            
            // Hide form and show report display
            document.getElementById('clearanceForm').style.display = 'none';
            document.getElementById('clearanceReportDisplay').style.display = 'block';
            
            // Scroll to report display
            document.getElementById('clearanceReportDisplay').scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
            
            showMessage('Clearance application submitted successfully!', 'success', 'clearanceFormElement');
            
            // Re-apply active request restrictions immediately
            try { await applyActiveRequestRestrictions(); } catch (_) {}
        } else {
            showMessage(result.message || 'Failed to submit clearance form', 'error', 'clearanceFormElement');
        }
    } catch (error) {
        console.error('Error submitting clearance form:', error);
        showMessage('Network error. Please try again.', 'error', 'clearanceFormElement');
    } finally {
        hideFullScreenLoading();
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Go back to main page
function goBack() {
    window.location.href = 'main_UI.html';
}

// Display indigency form summary
function displayIndigencyForm(formData) {
    // Handle purpose - use custom value if "other" is selected
    let purpose = formData.get('indPurpose');
    if (purpose === 'other' && formData.get('otherIndPurpose')) {
        purpose = formData.get('otherIndPurpose');
    }
    
    // Handle valid_id - use custom value if "other" is selected
    let validId = formData.get('indIdType');
    if (validId === 'other' && formData.get('otherIndIdType')) {
        validId = formData.get('otherIndIdType');
    }
    
    // Format date and time
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
    document.getElementById('displayIndigencyName').textContent = 
        `${formData.get('indFirstName')} ${formData.get('indMiddleName') || ''} ${formData.get('indLastName')}`.trim();
    document.getElementById('displayIndigencyAddress').textContent = formData.get('indAddress');
    document.getElementById('displayIndigencyBirthDate').textContent = formData.get('indBirthDate');
    document.getElementById('displayIndigencyBirthPlace').textContent = formData.get('indBirthPlace');
    document.getElementById('displayIndigencyAge').textContent = formData.get('indAge');
    document.getElementById('displayIndigencyGender').textContent = formData.get('indGender').charAt(0).toUpperCase() + formData.get('indGender').slice(1);
    document.getElementById('displayIndigencyCivilStatus').textContent = formData.get('indCivilStatus').charAt(0).toUpperCase() + formData.get('indCivilStatus').slice(1);
    document.getElementById('displayIndigencyPurpose').textContent = purpose.charAt(0).toUpperCase() + purpose.slice(1).replace('-', ' ');
    document.getElementById('displayIndigencyValidId').textContent = validId.charAt(0).toUpperCase() + validId.slice(1).replace('-', ' ');
    document.getElementById('displayIndigencyDateTime').textContent = formattedDateTime;
}

// Go back to indigency form
function goBackToIndigencyForm() {
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn:not(.emergency-btn)');
    documentButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all forms and report displays
    hideAllForms();
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Show emblem section
    showEmblemSection();
}

// Go to main page
// Show confirmation dialog and navigate to emblem section
async function showEmblemConfirmation() {
    const result = await Swal.fire({
        title: 'Discard Current Activity?',
        text: 'You have unsaved changes. Are you sure you want to switch to another document? Your current progress will be lost.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Continue',
        cancelButtonText: 'Cancel',
        reverseButtons: true
    });
    
    if (result.isConfirmed) {
        // Hide all forms
        hideAllForms();
        
        // Show emblem section
        showEmblemSection();
        
        // Scroll to top of page to show emblem section in header
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function goToMainPage() {
    window.location.href = 'main_UI.html';
}

function goToEmblemSection() {
    // Hide all form containers and report displays
    const formContainers = document.querySelectorAll('.form-container');
    const reportDisplays = document.querySelectorAll('.report-display');
    
    formContainers.forEach(container => container.style.display = 'none');
    reportDisplays.forEach(display => display.style.display = 'none');
    
    // Show emblem section
    const emblemSection = document.getElementById('emblemSection');
    if (emblemSection) {
        emblemSection.style.display = 'block';
        emblemSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Display Barangay ID form summary
function displayBarangayIdForm(formData) {
    // Handle nationality - use custom value if "other" is selected
    let nationality = formData.get('nationality');
    if (nationality === 'other' && formData.get('otherNationality')) {
        nationality = formData.get('otherNationality');
    }
    
    // Handle valid_id - use custom value if "other" is selected
    let validId = formData.get('idType');
    if (validId === 'other' && formData.get('otherIdType')) {
        validId = formData.get('otherIdType');
    }
    
    // Format date and time
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
    
    // Get values from readonly input fields since they have placeholders
    const provinceInput = document.getElementById('province');
    const municipalityInput = document.getElementById('municipality');
    const barangayInput = document.getElementById('barangay');
    
    // Update display elements
    document.getElementById('displayBarangayIdLastName').textContent = formData.get('lastName');
    document.getElementById('displayBarangayIdFirstName').textContent = formData.get('firstName');
    document.getElementById('displayBarangayIdMiddleName').textContent = formData.get('middleName') || '-';
    document.getElementById('displayBarangayIdBirthDate').textContent = formData.get('birthDate');
    document.getElementById('displayBarangayIdProvince').textContent = provinceInput ? provinceInput.placeholder : '-';
    document.getElementById('displayBarangayIdMunicipality').textContent = municipalityInput ? municipalityInput.placeholder : '-';
    document.getElementById('displayBarangayIdBarangay').textContent = barangayInput ? barangayInput.placeholder : '-';
    document.getElementById('displayBarangayIdStreetAddress').textContent = formData.get('streetAddress');
    document.getElementById('displayBarangayIdHeight').textContent = formData.get('height') + ' cm';
    document.getElementById('displayBarangayIdWeight').textContent = formData.get('weight') + ' kg';
    document.getElementById('displayBarangayIdCivilStatus').textContent = formData.get('civilStatus').charAt(0).toUpperCase() + formData.get('civilStatus').slice(1);
    document.getElementById('displayBarangayIdGender').textContent = formData.get('gender').charAt(0).toUpperCase() + formData.get('gender').slice(1);
    document.getElementById('displayBarangayIdNationality').textContent = nationality.charAt(0).toUpperCase() + nationality.slice(1);
    document.getElementById('displayBarangayIdValidId').textContent = validId.charAt(0).toUpperCase() + validId.slice(1).replace('-', ' ');
    document.getElementById('displayBarangayIdDateTime').textContent = formattedDateTime;
}

// Display Certification form summary
function displayCertificationForm(formData) {
    // Handle purpose - use custom value if "other" is selected
    let purpose = formData.get('certPurpose');
    if (purpose === 'other' && formData.get('otherCertPurpose')) {
        purpose = formData.get('otherCertPurpose');
    }
    
    // Handle valid_id - use custom value if "other" is selected
    let validId = formData.get('certIdType');
    if (validId === 'other' && formData.get('otherCertIdType')) {
        validId = formData.get('otherCertIdType');
    }
    
    // Format date and time
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
    
    // Handle citizenship - check both fields (residency and regular)
    let citizenship = formData.get('certResidencyCitizenship') || formData.get('certCitizenship') || '';
    if (citizenship) {
        citizenship = citizenship.charAt(0).toUpperCase() + citizenship.slice(1);
    }
    
    // Handle year residing
    let yearResiding = formData.get('certYearResiding') || '';
    
    // Handle month year passing
    let monthYearPassing = formData.get('certMonthYearPassing') || '';
    
    // Get purpose to determine which fields to show
    const actualPurpose = formData.get('certPurpose');
    
    // Conditionally show/hide fields based on purpose
    if (actualPurpose === 'pag-ibig-loan') {
        // Hide Year Start Residing and Month Year Passing, show Job, Date of Hire, Monthly Income
        document.getElementById('certYearResidingItem').style.display = 'none';
        document.getElementById('certMonthYearPassingContainer').style.display = 'none';
        document.getElementById('certJobContainer').style.display = 'flex';
        document.getElementById('certDateHireContainer').style.display = 'flex';
        document.getElementById('certMonthlyIncomeContainer').style.display = 'flex';
    } else if (actualPurpose === 'certification-for-dead') {
        // For Certification for Dead: hide Year Residing, show Month Year Passing, hide other fields
        document.getElementById('certYearResidingItem').style.display = 'none';
        document.getElementById('certMonthYearPassingContainer').style.display = 'flex';
        document.getElementById('certJobContainer').style.display = 'none';
        document.getElementById('certDateHireContainer').style.display = 'none';
        document.getElementById('certMonthlyIncomeContainer').style.display = 'none';
    } else {
        // For other purposes (like proof-of-residency): show Year Start Residing, hide other fields
        document.getElementById('certYearResidingItem').style.display = 'flex';
        document.getElementById('certMonthYearPassingContainer').style.display = 'none';
        document.getElementById('certJobContainer').style.display = 'none';
        document.getElementById('certDateHireContainer').style.display = 'none';
        document.getElementById('certMonthlyIncomeContainer').style.display = 'none';
    }
    
    // Update display elements
    document.getElementById('displayCertificationName').textContent = 
        `${formData.get('certFirstName')} ${formData.get('certMiddleName') || ''} ${formData.get('certLastName')}`.trim();
    document.getElementById('displayCertificationAddress').textContent = formData.get('certAddress');
    document.getElementById('displayCertificationBirthDate').textContent = formData.get('certBirthDate');
    document.getElementById('displayCertificationBirthPlace').textContent = formData.get('certBirthPlace');
    document.getElementById('displayCertificationGender').textContent = formData.get('certGender').charAt(0).toUpperCase() + formData.get('certGender').slice(1);
    document.getElementById('displayCertificationCivilStatus').textContent = formData.get('certCivilStatus').charAt(0).toUpperCase() + formData.get('certCivilStatus').slice(1);
    document.getElementById('displayCertificationCitizenship').textContent = citizenship || '-';
    document.getElementById('displayCertificationYearResiding').textContent = yearResiding || '-';
    document.getElementById('displayCertificationMonthYearPassing').textContent = monthYearPassing || '-';
    
    // Update pag-ibig loan fields
    document.getElementById('displayCertificationJob').textContent = formData.get('certJob') || '-';
    document.getElementById('displayCertificationDateHire').textContent = formData.get('certDateHire') || '-';
    const monthlyIncome = formData.get('certMonthlyIncome');
    document.getElementById('displayCertificationMonthlyIncome').textContent = monthlyIncome ? '₱' + parseFloat(monthlyIncome.replace(/,/g, '')).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-';
    
    document.getElementById('displayCertificationPurpose').textContent = purpose.charAt(0).toUpperCase() + purpose.slice(1).replace('-', ' ');
    document.getElementById('displayCertificationValidId').textContent = validId.charAt(0).toUpperCase() + validId.slice(1).replace('-', ' ');
    document.getElementById('displayCertificationDateTime').textContent = formattedDateTime;
}

// Display COE form summary
function displayCoeForm(formData) {
    // Handle valid_id - use custom value if "other" is selected
    let validId = formData.get('coeIdType');
    if (validId === 'other' && formData.get('otherCoeIdType')) {
        validId = formData.get('otherCoeIdType');
    }
    
    // Format date and time
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
    
    // Handle employment type - format value properly
    const employmentType = formData.get('coeEmploymentType');
    let formattedEmploymentType = '-';
    if (employmentType) {
        formattedEmploymentType = employmentType
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    
    // Update display elements
    document.getElementById('displayCoeName').textContent = 
        `${formData.get('coeFirstName')} ${formData.get('coeMiddleName') || ''} ${formData.get('coeLastName')}`.trim();
    document.getElementById('displayCoeAddress').textContent = formData.get('coeAddress');
    document.getElementById('displayCoeAge').textContent = formData.get('coeAge');
    document.getElementById('displayCoeGender').textContent = formData.get('coeGender').charAt(0).toUpperCase() + formData.get('coeGender').slice(1);
    document.getElementById('displayCoeCivilStatus').textContent = formData.get('coeCivilStatus').charAt(0).toUpperCase() + formData.get('coeCivilStatus').slice(1);
    document.getElementById('displayCoeEmploymentType').textContent = formattedEmploymentType;
    document.getElementById('displayCoePosition').textContent = formData.get('coePosition');
    document.getElementById('displayCoeDateStarted').textContent = formData.get('coeDateStarted');
    const monthlySalary = formData.get('coeMonthlySalary');
    document.getElementById('displayCoeMonthlySalary').textContent = '₱' + parseFloat(monthlySalary.replace(/,/g, '')).toLocaleString('en-PH');
    document.getElementById('displayCoeValidId').textContent = validId.charAt(0).toUpperCase() + validId.slice(1).replace('-', ' ');
    document.getElementById('displayCoeDateTime').textContent = formattedDateTime;
}

// Display Clearance form summary
function displayClearanceForm(formData) {
    // Get purpose value
    let purpose = formData.get('clearPurpose');
    
    // Handle valid_id - use custom value if "other" is selected
    let validId = formData.get('clearIdType');
    if (validId === 'other' && formData.get('otherClearIdType')) {
        validId = formData.get('otherClearIdType');
    }
    
    // Format date and time
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
    document.getElementById('displayClearanceName').textContent = 
        `${formData.get('clearFirstName')} ${formData.get('clearMiddleName') || ''} ${formData.get('clearLastName')}`.trim();
    document.getElementById('displayClearanceAddress').textContent = formData.get('clearAddress');
    document.getElementById('displayClearanceBirthDate').textContent = formData.get('clearBirthDate');
    document.getElementById('displayClearanceBirthPlace').textContent = formData.get('clearBirthPlace');
    document.getElementById('displayClearanceAge').textContent = formData.get('clearAge');
    document.getElementById('displayClearanceGender').textContent = formData.get('clearGender').charAt(0).toUpperCase() + formData.get('clearGender').slice(1);
    document.getElementById('displayClearanceCivilStatus').textContent = formData.get('clearCivilStatus').charAt(0).toUpperCase() + formData.get('clearCivilStatus').slice(1);
    document.getElementById('displayClearancePurpose').textContent = purpose.charAt(0).toUpperCase() + purpose.slice(1).replace(/-/g, ' ');
    document.getElementById('displayClearanceValidId').textContent = validId.charAt(0).toUpperCase() + validId.slice(1).replace('-', ' ');
    document.getElementById('displayClearanceDateTime').textContent = formattedDateTime;
    
    // Handle Business Name and Business Location
    const businessName = formData.get('clearBusinessName');
    const businessLocation = formData.get('clearBusinessLocation');
    
    if (businessName) {
        document.getElementById('displayClearanceBusinessName').textContent = businessName;
        document.getElementById('displayClearanceBusinessNameItem').style.display = 'flex';
    }
    
    if (businessLocation) {
        document.getElementById('displayClearanceBusinessLocation').textContent = businessLocation;
        document.getElementById('displayClearanceBusinessLocationItem').style.display = 'flex';
    }
    
    // Handle Citizenship
    const citizenship = formData.get('clearCitizenship');
    
    if (citizenship) {
        document.getElementById('displayClearanceCitizenship').textContent = citizenship.charAt(0).toUpperCase() + citizenship.slice(1);
        document.getElementById('displayClearanceCitizenshipItem').style.display = 'flex';
    }
    
    // Handle Year Residing
    const yearResiding = formData.get('clearYearResiding');
    
    if (yearResiding) {
        document.getElementById('displayClearanceYearResiding').textContent = yearResiding;
        document.getElementById('displayClearanceYearResidingItem').style.display = 'flex';
    }
}

// Go back functions for each form
function goBackToBarangayIdForm() {
    // Hide the success report display
    const reportDisplay = document.getElementById('barangayIdReportDisplay');
    if (reportDisplay) {
        reportDisplay.style.display = 'none';
    }
    
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Show emblem section
    const emblemSection = document.getElementById('emblemSection');
    if (emblemSection) {
        emblemSection.style.display = 'block';
    }
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Show the barangay ID form again
    showBarangayIdForm();
}

function goBackToFormChoices() {
    // Hide the success report display
    const reportDisplay = document.getElementById('barangayIdReportDisplay');
    if (reportDisplay) {
        reportDisplay.style.display = 'none';
    }
    
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Show emblem section
    const emblemSection = document.getElementById('emblemSection');
    if (emblemSection) {
        emblemSection.style.display = 'block';
    }
    
    // Hide all forms and report displays
    hideAllForms();
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn');
    documentButtons.forEach(btn => btn.classList.remove('active'));
}

function goBackToCertificationForm() {
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn:not(.emergency-btn)');
    documentButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all forms and report displays
    hideAllForms();
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Show emblem section
    showEmblemSection();
}

function goBackToCoeForm() {
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn:not(.emergency-btn)');
    documentButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all forms and report displays
    hideAllForms();
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Show emblem section
    showEmblemSection();
}

function goBackToClearanceForm() {
    // Show sidebar
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
    }
    
    // Remove active state from all document buttons
    const documentButtons = document.querySelectorAll('.document-btn:not(.emergency-btn)');
    documentButtons.forEach(btn => btn.classList.remove('active'));
    
    // Hide all forms and report displays
    hideAllForms();
    
    // Clear all form inputs
    clearAllFormInputs();
    
    // Show emblem section
    showEmblemSection();
}

// Utility function to format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP'
    }).format(amount);
}

// Validate 1x1 photo aspect ratio
function validate1x1Photo(file, input) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const width = img.width;
            const height = img.height;
            
            // Check if image is 1x1 (square) - allow small tolerance (within 5px difference)
            const tolerance = 5;
            const isSquare = Math.abs(width - height) <= tolerance;
            
            if (!isSquare) {
                // Show warning but don't prevent upload
                const warningMessage = `Warning: The uploaded photo is not 1x1. Current size: ${width}x${height}px. Please upload a square (1x1) photo.`;
                showFieldError(input, warningMessage);
                
                // Show SweetAlert for better visibility
                Swal.fire({
                    icon: 'warning',
                    title: 'Photo Not 1x1',
                    html: `The uploaded photo is not 1x1!<br><br><strong>Current dimensions:</strong> ${width}x${height}px<br><br>Please upload a square (1x1) photo for the Barangay ID.`,
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#2677e1',
                    allowOutsideClick: true,
                    allowEscapeKey: true
                });
            } else {
                // Clear any previous errors if image is valid
                clearFieldError(input);
            }
            
            // Still show preview
            const preview = document.getElementById('idPicturePreview');
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Image preview function
function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    const file = input.files[0];
    
    if (file) {
        // Clear any validation errors when file is selected
        clearFieldError(input);
        
        // Remove error indicator from upload button
        const uploadBtn = input.parentNode.querySelector('.upload-btn');
        if (uploadBtn) {
            uploadBtn.classList.remove('error-indicator');
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        preview.style.display = 'none';
    }
}

// Navigate to emergency form
function goToEmergency() {
    console.log('Emergency button clicked');
    window.location.href = 'emergency.html';
}

// Setup Sidebar Toggle Functionality
function setupSidebarToggle() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
        });
    }
    
    console.log('Sidebar toggle initialized');
}

// Toggle Other Input Function
function toggleOtherInput(selectId, inputId) {
    const selectElement = document.getElementById(selectId);
    const inputGroup = document.getElementById(inputId + 'Group');
    const inputElement = document.getElementById(inputId);
    
    if (selectElement && inputGroup && inputElement) {
        if (selectElement.value === 'other') {
            inputGroup.style.display = 'block';
            inputElement.required = true;
            
            // Initialize required indicator toggle for this field
            const label = document.querySelector(`label[for="${inputId}"]`);
            const requiredIndicator = label ? label.querySelector('.required-indicator') : null;
            
            if (requiredIndicator) {
                // Function to toggle required indicator visibility and clear errors
                function toggleRequiredIndicator() {
                    if (inputElement.value.trim() !== '') {
                        requiredIndicator.style.display = 'none';
                        // Clear any field errors when user types
                        clearFieldError(inputElement);
                    } else {
                        requiredIndicator.style.display = 'inline';
                    }
                }
                
                // Add event listeners
                inputElement.addEventListener('input', toggleRequiredIndicator);
                inputElement.addEventListener('change', toggleRequiredIndicator);
                inputElement.addEventListener('blur', toggleRequiredIndicator);
                inputElement.addEventListener('paste', function() {
                    setTimeout(toggleRequiredIndicator, 10);
                });
                
                // Check initial state
                toggleRequiredIndicator();
            }
        } else {
            inputGroup.style.display = 'none';
            inputElement.required = false;
            inputElement.value = ''; // Clear the input when hiding
            
            // Clear any field errors when hiding the field
            clearFieldError(inputElement);
            
            // Show the required indicator when hiding the field
            const label = document.querySelector(`label[for="${inputId}"]`);
            const requiredIndicator = label ? label.querySelector('.required-indicator') : null;
            if (requiredIndicator) {
                requiredIndicator.style.display = 'inline';
            }
        }
    }
}

// Toggle Certification Form Conditional Fields
function toggleCertificationConditionalFields() {
    const purpose = document.getElementById('certPurpose').value;
    const citizenshipGroup = document.getElementById('certCitizenshipGroup');
    const citizenshipSelect = document.getElementById('certCitizenship');
    const residencyCitizenshipGroup = document.getElementById('certResidencyCitizenshipGroup');
    const residencyCitizenshipSelect = document.getElementById('certResidencyCitizenship');
    const jobGroup = document.getElementById('certJobGroup');
    const jobInput = document.getElementById('certJob');
    const dateHireGroup = document.getElementById('certDateHireGroup');
    const dateHireInput = document.getElementById('certDateHire');
    const monthlyIncomeGroup = document.getElementById('certMonthlyIncomeGroup');
    const monthlyIncomeInput = document.getElementById('certMonthlyIncome');
    const yearResidingGroup = document.getElementById('certYearResidingGroup');
    const yearResidingInput = document.getElementById('certYearResiding');
    const monthYearPassingGroup = document.getElementById('certMonthYearPassingGroup');
    const monthYearPassingInput = document.getElementById('certMonthYearPassing');
    
    // Hide all conditional fields first
    citizenshipGroup.style.display = 'none';
    citizenshipSelect.required = false;
    citizenshipSelect.value = '';
    
    residencyCitizenshipGroup.style.display = 'none';
    residencyCitizenshipSelect.required = false;
    residencyCitizenshipSelect.value = '';
    
    jobGroup.style.display = 'none';
    jobInput.required = false;
    jobInput.value = '';
    
    dateHireGroup.style.display = 'none';
    dateHireInput.required = false;
    dateHireInput.value = '';
    
    monthlyIncomeGroup.style.display = 'none';
    monthlyIncomeInput.required = false;
    monthlyIncomeInput.value = '';
    
    yearResidingGroup.style.display = 'none';
    yearResidingInput.required = false;
    yearResidingInput.value = '';
    
    monthYearPassingGroup.style.display = 'none';
    monthYearPassingInput.required = false;
    monthYearPassingInput.value = '';
    
    // Show fields based on selected purpose
    if (purpose === 'pag-ibig-loan') {
        // For Pag-Ibig Loan: show Citizenship, Job, Date of Hire, and Monthly Income
        citizenshipGroup.style.display = 'block';
        citizenshipSelect.required = true;
        
        jobGroup.style.display = 'block';
        jobInput.required = true;
        
        dateHireGroup.style.display = 'block';
        dateHireInput.required = true;
        
        monthlyIncomeGroup.style.display = 'block';
        monthlyIncomeInput.required = true;
    } else if (purpose === 'proof-of-residency') {
        // For Proof of Residency: show Citizenship and Year Start Residing
        residencyCitizenshipGroup.style.display = 'block';
        residencyCitizenshipSelect.required = true;
        
        yearResidingGroup.style.display = 'block';
        yearResidingInput.required = true;
    } else if (purpose === 'certification-for-dead') {
        // For Certification for Dead: show Citizenship and Month/Year of Passing
        citizenshipGroup.style.display = 'block';
        citizenshipSelect.required = true;
        
        monthYearPassingGroup.style.display = 'block';
        monthYearPassingInput.required = true;
    }
}

// Toggle Clearance Form Conditional Fields
function toggleClearanceConditionalFields() {
    const purpose = document.getElementById('clearPurpose').value;
    const citizenshipGroup = document.getElementById('clearCitizenshipGroup');
    const citizenshipSelect = document.getElementById('clearCitizenship');
    const businessNameGroup = document.getElementById('clearBusinessNameGroup');
    const businessNameInput = document.getElementById('clearBusinessName');
    const businessLocationGroup = document.getElementById('clearBusinessLocationGroup');
    const businessLocationInput = document.getElementById('clearBusinessLocation');
    const yearResidingGroup = document.getElementById('clearYearResidingGroup');
    const yearResidingInput = document.getElementById('clearYearResiding');
    
    // Hide all conditional fields first
    citizenshipGroup.style.display = 'none';
    citizenshipSelect.required = false;
    citizenshipSelect.value = '';
    
    businessNameGroup.style.display = 'none';
    businessNameInput.required = false;
    businessNameInput.value = '';
    
    businessLocationGroup.style.display = 'none';
    businessLocationInput.required = false;
    businessLocationInput.value = '';
    
    yearResidingGroup.style.display = 'none';
    yearResidingInput.required = false;
    yearResidingInput.value = '';
    
    // Show fields based on selected purpose
    if (purpose === 'barangay-clearance') {
        // For Barangay Clearance: show Citizenship
        citizenshipGroup.style.display = 'block';
        citizenshipSelect.required = true;
    } else if (purpose === 'business-clearance') {
        // For Business Clearance: show Business Name and Location
        businessNameGroup.style.display = 'block';
        businessNameInput.required = true;
        
        businessLocationGroup.style.display = 'block';
        businessLocationInput.required = true;
    } else if (purpose === 'proof-of-residency') {
        // For Proof of Residency: show Year Start Residing and Citizenship
        citizenshipGroup.style.display = 'block';
        citizenshipSelect.required = true;
        
        yearResidingGroup.style.display = 'block';
        yearResidingInput.required = true;
    }
}

// Multi-step Form Functions for Barangay ID
let currentStep = 1;
const totalSteps = 3;

function nextStep() {
    if (validateCurrentStep()) {
        if (currentStep < totalSteps) {
            currentStep++;
            showStep(currentStep);
            updatePageIndicator();
            
            // Scroll to form-title so active form-step is visible starting from form-title
            setTimeout(() => {
                const formContainer = document.getElementById('barangayIdForm');
                const formTitle = formContainer?.querySelector('.form-title');
                const activeStep = formContainer?.querySelector('.form-step.active');
                
                if (formContainer && formTitle) {
                    // Get the position of form-title relative to form-container's scrollable content
                    const containerScrollTop = formContainer.scrollTop;
                    const containerRect = formContainer.getBoundingClientRect();
                    const titleRect = formTitle.getBoundingClientRect();
                    
                    // Calculate the offset: form-title's position in the scrollable content
                    const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                    
                    // Scroll to show the form-title at the top, which will also show the active form-step below it
                    formContainer.scrollTo({ 
                        top: titleOffset, 
                        behavior: 'smooth' 
                    });
                } else if (formContainer) {
                    // Fallback: scroll to top of form-container
                    formContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 150); // Increased delay to ensure DOM is fully updated and active step is rendered
        }
    }
}

function prevStep() {
    if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
        updatePageIndicator();
        
        // Scroll to form-title so active form-step is visible starting from form-title
        setTimeout(() => {
            const formContainer = document.getElementById('barangayIdForm');
            const formTitle = formContainer?.querySelector('.form-title');
            const activeStep = formContainer?.querySelector('.form-step.active');
            
            if (formContainer && formTitle) {
                // Get the position of form-title relative to form-container's scrollable content
                const containerScrollTop = formContainer.scrollTop;
                const containerRect = formContainer.getBoundingClientRect();
                const titleRect = formTitle.getBoundingClientRect();
                
                // Calculate the offset: form-title's position in the scrollable content
                const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                
                // Scroll to show the form-title at the top, which will also show the active form-step below it
                formContainer.scrollTo({ 
                    top: titleOffset, 
                    behavior: 'smooth' 
                });
            } else if (formContainer) {
                // Fallback: scroll to top of form-container
                formContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150); // Increased delay to ensure DOM is fully updated and active step is rendered
    }
}

function showStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('.form-step');
    steps.forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`step${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

function updatePageIndicator() {
    const indicators = document.querySelectorAll('.indicator-step');
    indicators.forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');
        
        if (stepNumber === currentStep) {
            indicator.classList.add('active');
        } else if (stepNumber < currentStep) {
            indicator.classList.add('completed');
        }
    });
}

function validateCurrentStep() {
    const currentStepElement = document.getElementById(`step${currentStep}`);
    if (!currentStepElement) return false;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    // Track processed radio groups to avoid duplicate validation
    const processedRadioGroups = new Set();
    
    requiredFields.forEach(field => {
        if (field.type === 'radio') {
            // Only validate each radio group once
            if (!processedRadioGroups.has(field.name)) {
                processedRadioGroups.add(field.name);
                const radioGroup = currentStepElement.querySelector(`input[name="${field.name}"]:checked`);
                if (!radioGroup) {
                    isValid = false;
                    // Show error on the first radio button of the group
                    const firstRadio = currentStepElement.querySelector(`input[name="${field.name}"]`);
                    showFieldError(firstRadio, 'This field is required');
                } else {
                    // Clear error from the first radio button of the group
                    const firstRadio = currentStepElement.querySelector(`input[name="${field.name}"]`);
                    clearFieldError(firstRadio);
                }
            }
        } else if (field.type === 'file') {
            // Special validation for file uploads
            if (!field.files || field.files.length === 0) {
                isValid = false;
                // Find the upload button and add error indicator
                const uploadBtn = field.parentNode.querySelector('.upload-btn');
                if (uploadBtn) {
                    uploadBtn.classList.add('error-indicator');
                }
                showFieldError(field, 'Please upload a required file');
            } else {
                clearFieldError(field);
                // Remove error indicator from upload button
                const uploadBtn = field.parentNode.querySelector('.upload-btn');
                if (uploadBtn) {
                    uploadBtn.classList.remove('error-indicator');
                }
            }
        } else {
            if (!field.value.trim()) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        }
    });
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
    }
    
    return isValid;
}

function showFieldError(field, message) {
    clearFieldError(field);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.color = '#dc3545';
    errorDiv.style.fontSize = '0.875rem';
    errorDiv.style.marginTop = '0.25rem';
    
    // For radio buttons, show error at the form group level
    if (field.type === 'radio') {
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            formGroup.appendChild(errorDiv);
        } else {
            field.parentNode.appendChild(errorDiv);
        }
    } else if (field.type === 'file') {
        // For file uploads, show error near the upload button
        const uploadBtn = field.parentNode.querySelector('.upload-btn');
        if (uploadBtn) {
            uploadBtn.parentNode.appendChild(errorDiv);
        } else {
            field.parentNode.appendChild(errorDiv);
        }
    } else {
        field.parentNode.appendChild(errorDiv);
        field.style.borderColor = '#dc3545';
    }
    
    // Scroll to the field with error after a short delay to ensure error is rendered
    setTimeout(() => {
        field.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
        });
    }, 100);
}

// Function to scroll to the first field with an error
function scrollToFirstError() {
    const errorFields = document.querySelectorAll('.field-error');
    if (errorFields.length > 0) {
        const firstErrorField = errorFields[0].parentNode.querySelector('input, select, textarea');
        if (firstErrorField) {
            setTimeout(() => {
                firstErrorField.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest'
                });
            }, 200);
        }
    }
}

function clearFieldError(field) {
    // Check if field exists and has parentNode
    if (!field || !field.parentNode) {
        return;
    }
    
    // For radio buttons, clear error from the form group
    if (field.type === 'radio') {
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            const existingError = formGroup.querySelector('.field-error');
            if (existingError) {
                existingError.remove();
            }
        } else {
            const existingError = field.parentNode.querySelector('.field-error');
            if (existingError) {
                existingError.remove();
            }
        }
    } else if (field.type === 'file') {
        // For file uploads, clear error from the form group
        const formGroup = field.parentNode;
        if (formGroup) {
            const existingError = formGroup.querySelector('.field-error');
            if (existingError) {
                existingError.remove();
            }
            const uploadBtn = formGroup.querySelector('.upload-btn');
            if (uploadBtn) {
                uploadBtn.style.borderColor = '';
            }
        }
    } else {
        const existingError = field.parentNode.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
        field.style.borderColor = '';
    }
}

function resetBarangayIdFormSteps() {
    currentStep = 1;
    showStep(1);
    updatePageIndicator();
}

// Initialize multi-step form when Barangay ID form is shown
function setupBarangayIdFormSteps() {
    resetBarangayIdFormSteps();
}

// Barangay field is now fixed to "Bigte" - no dropdown needed

// Multi-step Form Functions for Certification Form
let currentCertStep = 1;
const totalCertSteps = 3;

function nextCertStep() {
    if (validateCurrentCertStep()) {
        if (currentCertStep < totalCertSteps) {
            currentCertStep++;
            showCertStep(currentCertStep);
            updateCertPageIndicator();
            
            // Scroll to form-title so page-indicator is visible at the top
            setTimeout(() => {
                const formContainer = document.getElementById('certificationForm');
                const formTitle = formContainer?.querySelector('.form-title');
                
                if (formContainer && formTitle) {
                    // Get the position of form-title relative to form-container's scrollable content
                    const containerScrollTop = formContainer.scrollTop;
                    const containerRect = formContainer.getBoundingClientRect();
                    const titleRect = formTitle.getBoundingClientRect();
                    
                    // Calculate the offset: form-title's position in the scrollable content
                    const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                    
                    // Scroll to show the form-title at the top, which will also show the page-indicator below it
                    formContainer.scrollTo({ 
                        top: titleOffset, 
                        behavior: 'smooth' 
                    });
                } else if (formContainer) {
                    // Fallback: scroll to top of form-container
                    formContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 150); // Delay to ensure DOM is fully updated and active step is rendered
        }
    }
}

function prevCertStep() {
    if (currentCertStep > 1) {
        currentCertStep--;
        showCertStep(currentCertStep);
        updateCertPageIndicator();
        
        // Scroll to form-title so page-indicator is visible at the top
        setTimeout(() => {
            const formContainer = document.getElementById('certificationForm');
            const formTitle = formContainer?.querySelector('.form-title');
            
            if (formContainer && formTitle) {
                // Get the position of form-title relative to form-container's scrollable content
                const containerScrollTop = formContainer.scrollTop;
                const containerRect = formContainer.getBoundingClientRect();
                const titleRect = formTitle.getBoundingClientRect();
                
                // Calculate the offset: form-title's position in the scrollable content
                const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                
                // Scroll to show the form-title at the top, which will also show the page-indicator below it
                formContainer.scrollTo({ 
                    top: titleOffset, 
                    behavior: 'smooth' 
                });
            } else if (formContainer) {
                // Fallback: scroll to top of form-container
                formContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150); // Delay to ensure DOM is fully updated and active step is rendered
    }
}

function showCertStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('#certificationForm .form-step');
    steps.forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`certStep${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

function updateCertPageIndicator() {
    const indicators = document.querySelectorAll('#certificationForm .indicator-step');
    indicators.forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');
        
        if (stepNumber === currentCertStep) {
            indicator.classList.add('active');
        } else if (stepNumber < currentCertStep) {
            indicator.classList.add('completed');
        }
    });
}

function validateCurrentCertStep() {
    const currentStepElement = document.getElementById(`certStep${currentCertStep}`);
    if (!currentStepElement) return false;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (field.type === 'radio') {
            const radioGroup = currentStepElement.querySelector(`input[name="${field.name}"]:checked`);
            if (!radioGroup) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        } else {
            if (!field.value.trim()) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        }
    });
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
    }
    
    return isValid;
}

function resetCertFormSteps() {
    currentCertStep = 1;
    showCertStep(1);
    updateCertPageIndicator();
}

// Multi-step Form Functions for COE Form
let currentCoeStep = 1;
const totalCoeSteps = 3;

function nextCoeStep() {
    if (validateCurrentCoeStep()) {
        if (currentCoeStep < totalCoeSteps) {
            currentCoeStep++;
            showCoeStep(currentCoeStep);
            updateCoePageIndicator();
            
            // Scroll to form-title so page-indicator is visible at the top
            setTimeout(() => {
                const formContainer = document.getElementById('coeForm');
                const formTitle = formContainer?.querySelector('.form-title');
                
                if (formContainer && formTitle) {
                    // Get the position of form-title relative to form-container's scrollable content
                    const containerScrollTop = formContainer.scrollTop;
                    const containerRect = formContainer.getBoundingClientRect();
                    const titleRect = formTitle.getBoundingClientRect();
                    
                    // Calculate the offset: form-title's position in the scrollable content
                    const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                    
                    // Scroll to show the form-title at the top, which will also show the page-indicator below it
                    formContainer.scrollTo({ 
                        top: titleOffset, 
                        behavior: 'smooth' 
                    });
                } else if (formContainer) {
                    // Fallback: scroll to top of form-container
                    formContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 150); // Delay to ensure DOM is fully updated and active step is rendered
        }
    }
}

function prevCoeStep() {
    if (currentCoeStep > 1) {
        currentCoeStep--;
        showCoeStep(currentCoeStep);
        updateCoePageIndicator();
        
        // Scroll to form-title so page-indicator is visible at the top
        setTimeout(() => {
            const formContainer = document.getElementById('coeForm');
            const formTitle = formContainer?.querySelector('.form-title');
            
            if (formContainer && formTitle) {
                // Get the position of form-title relative to form-container's scrollable content
                const containerScrollTop = formContainer.scrollTop;
                const containerRect = formContainer.getBoundingClientRect();
                const titleRect = formTitle.getBoundingClientRect();
                
                // Calculate the offset: form-title's position in the scrollable content
                const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                
                // Scroll to show the form-title at the top, which will also show the page-indicator below it
                formContainer.scrollTo({ 
                    top: titleOffset, 
                    behavior: 'smooth' 
                });
            } else if (formContainer) {
                // Fallback: scroll to top of form-container
                formContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150); // Delay to ensure DOM is fully updated and active step is rendered
    }
}

function showCoeStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('#coeForm .form-step');
    steps.forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`coeStep${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

function updateCoePageIndicator() {
    const indicators = document.querySelectorAll('#coeForm .indicator-step');
    indicators.forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');
        
        if (stepNumber === currentCoeStep) {
            indicator.classList.add('active');
        } else if (stepNumber < currentCoeStep) {
            indicator.classList.add('completed');
        }
    });
}

function validateCurrentCoeStep() {
    const currentStepElement = document.getElementById(`coeStep${currentCoeStep}`);
    if (!currentStepElement) return false;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (field.type === 'radio') {
            const radioGroup = currentStepElement.querySelector(`input[name="${field.name}"]:checked`);
            if (!radioGroup) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        } else {
            if (!field.value.trim()) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        }
    });
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
    }
    
    return isValid;
}

function resetCoeFormSteps() {
    currentCoeStep = 1;
    showCoeStep(1);
    updateCoePageIndicator();
}

// Multi-step Form Functions for Indigency Form
let currentIndStep = 1;
const totalIndSteps = 3;

function nextIndStep() {
    if (validateCurrentIndStep()) {
        if (currentIndStep < totalIndSteps) {
            currentIndStep++;
            showIndStep(currentIndStep);
            updateIndPageIndicator();
            
            // Scroll to form-title so page-indicator is visible at the top
            setTimeout(() => {
                const formContainer = document.getElementById('indigencyForm');
                const formTitle = formContainer?.querySelector('.form-title');
                
                if (formContainer && formTitle) {
                    // Get the position of form-title relative to form-container's scrollable content
                    const containerScrollTop = formContainer.scrollTop;
                    const containerRect = formContainer.getBoundingClientRect();
                    const titleRect = formTitle.getBoundingClientRect();
                    
                    // Calculate the offset: form-title's position in the scrollable content
                    const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                    
                    // Scroll to show the form-title at the top, which will also show the page-indicator below it
                    formContainer.scrollTo({ 
                        top: titleOffset, 
                        behavior: 'smooth' 
                    });
                } else if (formContainer) {
                    // Fallback: scroll to top of form-container
                    formContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 150); // Delay to ensure DOM is fully updated and active step is rendered
        }
    }
}

function prevIndStep() {
    if (currentIndStep > 1) {
        currentIndStep--;
        showIndStep(currentIndStep);
        updateIndPageIndicator();
        
        // Scroll to form-title so page-indicator is visible at the top
        setTimeout(() => {
            const formContainer = document.getElementById('indigencyForm');
            const formTitle = formContainer?.querySelector('.form-title');
            
            if (formContainer && formTitle) {
                // Get the position of form-title relative to form-container's scrollable content
                const containerScrollTop = formContainer.scrollTop;
                const containerRect = formContainer.getBoundingClientRect();
                const titleRect = formTitle.getBoundingClientRect();
                
                // Calculate the offset: form-title's position in the scrollable content
                const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                
                // Scroll to show the form-title at the top, which will also show the page-indicator below it
                formContainer.scrollTo({ 
                    top: titleOffset, 
                    behavior: 'smooth' 
                });
            } else if (formContainer) {
                // Fallback: scroll to top of form-container
                formContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150); // Delay to ensure DOM is fully updated and active step is rendered
    }
}

function showIndStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('#indigencyForm .form-step');
    steps.forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`indStep${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

function updateIndPageIndicator() {
    const indicators = document.querySelectorAll('#indigencyForm .indicator-step');
    indicators.forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');
        
        if (stepNumber === currentIndStep) {
            indicator.classList.add('active');
        } else if (stepNumber < currentIndStep) {
            indicator.classList.add('completed');
        }
    });
}

function validateCurrentIndStep() {
    const currentStepElement = document.getElementById(`indStep${currentIndStep}`);
    if (!currentStepElement) return false;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (field.type === 'radio') {
            const radioGroup = currentStepElement.querySelector(`input[name="${field.name}"]:checked`);
            if (!radioGroup) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        } else {
            if (!field.value.trim()) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        }
    });
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
    }
    
    return isValid;
}

function resetIndFormSteps() {
    currentIndStep = 1;
    showIndStep(1);
    updateIndPageIndicator();
}

// Multi-step Form Functions for Clearance Form
let currentClearStep = 1;
const totalClearSteps = 3;

function nextClearStep() {
    if (validateCurrentClearStep()) {
        if (currentClearStep < totalClearSteps) {
            currentClearStep++;
            showClearStep(currentClearStep);
            updateClearPageIndicator();
            
            // Scroll to form-title so page-indicator is visible at the top
            setTimeout(() => {
                const formContainer = document.getElementById('clearanceForm');
                const formTitle = formContainer?.querySelector('.form-title');
                
                if (formContainer && formTitle) {
                    // Get the position of form-title relative to form-container's scrollable content
                    const containerScrollTop = formContainer.scrollTop;
                    const containerRect = formContainer.getBoundingClientRect();
                    const titleRect = formTitle.getBoundingClientRect();
                    
                    // Calculate the offset: form-title's position in the scrollable content
                    const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                    
                    // Scroll to show the form-title at the top, which will also show the page-indicator below it
                    formContainer.scrollTo({ 
                        top: titleOffset, 
                        behavior: 'smooth' 
                    });
                } else if (formContainer) {
                    // Fallback: scroll to top of form-container
                    formContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 150); // Delay to ensure DOM is fully updated and active step is rendered
        }
    }
}

function prevClearStep() {
    if (currentClearStep > 1) {
        currentClearStep--;
        showClearStep(currentClearStep);
        updateClearPageIndicator();
        
        // Scroll to form-title so page-indicator is visible at the top
        setTimeout(() => {
            const formContainer = document.getElementById('clearanceForm');
            const formTitle = formContainer?.querySelector('.form-title');
            
            if (formContainer && formTitle) {
                // Get the position of form-title relative to form-container's scrollable content
                const containerScrollTop = formContainer.scrollTop;
                const containerRect = formContainer.getBoundingClientRect();
                const titleRect = formTitle.getBoundingClientRect();
                
                // Calculate the offset: form-title's position in the scrollable content
                const titleOffset = titleRect.top - containerRect.top + containerScrollTop;
                
                // Scroll to show the form-title at the top, which will also show the page-indicator below it
                formContainer.scrollTo({ 
                    top: titleOffset, 
                    behavior: 'smooth' 
                });
            } else if (formContainer) {
                // Fallback: scroll to top of form-container
                formContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 150); // Delay to ensure DOM is fully updated and active step is rendered
    }
}

function showClearStep(stepNumber) {
    // Hide all steps
    const steps = document.querySelectorAll('#clearanceForm .form-step');
    steps.forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const currentStepElement = document.getElementById(`clearStep${stepNumber}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

function updateClearPageIndicator() {
    const indicators = document.querySelectorAll('#clearanceForm .indicator-step');
    indicators.forEach((indicator, index) => {
        const stepNumber = index + 1;
        indicator.classList.remove('active', 'completed');
        
        if (stepNumber === currentClearStep) {
            indicator.classList.add('active');
        } else if (stepNumber < currentClearStep) {
            indicator.classList.add('completed');
        }
    });
}

function validateCurrentClearStep() {
    const currentStepElement = document.getElementById(`clearStep${currentClearStep}`);
    if (!currentStepElement) return false;
    
    const requiredFields = currentStepElement.querySelectorAll('input[required], select[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (field.type === 'radio') {
            const radioGroup = currentStepElement.querySelector(`input[name="${field.name}"]:checked`);
            if (!radioGroup) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        } else {
            if (!field.value.trim()) {
                isValid = false;
                showFieldError(field, 'This field is required');
            } else {
                clearFieldError(field);
            }
        }
    });
    
    // If validation failed, scroll to the first error field
    if (!isValid) {
        scrollToFirstError();
    }
    
    return isValid;
}

function resetClearFormSteps() {
    currentClearStep = 1;
    showClearStep(1);
    updateClearPageIndicator();
}

// Initialize required indicator toggle functionality
function initializeRequiredIndicatorToggle() {
    // Get all input fields, select fields, and textarea fields
    const allInputs = document.querySelectorAll('input, select, textarea');
    
    allInputs.forEach(input => {
        // Skip hidden inputs only
        if (input.type === 'hidden') {
            return;
        }
        
        // Find the associated label
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (!label) return;
        
        // Find the required indicator within the label
        const requiredIndicator = label.querySelector('.required-indicator');
        if (!requiredIndicator) return;
        
        // Function to toggle required indicator visibility
        function toggleRequiredIndicator() {
            let hasValue = false;
            
            if (input.type === 'file') {
                hasValue = input.files && input.files.length > 0;
            } else {
                hasValue = input.value.trim() !== '';
            }
            
            if (hasValue) {
                requiredIndicator.style.display = 'none';
                // Clear any field errors when user types
                clearFieldError(input);
            } else {
                requiredIndicator.style.display = 'inline';
            }
        }
        
        // Add event listeners for different input types
        if (input.type === 'radio' || input.type === 'checkbox') {
            // For radio buttons, check all radio buttons with the same name
            input.addEventListener('change', function() {
                const radioGroup = document.querySelectorAll(`input[name="${input.name}"]`);
                const hasSelection = Array.from(radioGroup).some(radio => radio.checked);
                
                if (hasSelection) {
                    requiredIndicator.style.display = 'none';
                    // Clear any field errors when user selects an option
                    clearFieldError(input);
                } else {
                    requiredIndicator.style.display = 'inline';
                }
            });
        } else if (input.type === 'file') {
            // For file inputs, check if a file is selected
            input.addEventListener('change', function() {
                if (input.files && input.files.length > 0) {
                    requiredIndicator.style.display = 'none';
                    // Clear any field errors when user selects a file
                    clearFieldError(input);
                } else {
                    requiredIndicator.style.display = 'inline';
                }
            });
        } else {
            // For text inputs, selects, and textareas
            input.addEventListener('input', toggleRequiredIndicator);
            input.addEventListener('change', toggleRequiredIndicator);
            input.addEventListener('blur', toggleRequiredIndicator);
            input.addEventListener('paste', function() {
                // Handle paste events with a small delay
                setTimeout(toggleRequiredIndicator, 10);
            });
        }
        
        // Check initial state
        toggleRequiredIndicator();
    });
    
    // Initialize birth date year restriction
    initializeBirthDateYearRestriction();
    
    console.log('Required indicator toggle functionality initialized');
}

// Initialize birth date year restriction to 4 digits
function initializeBirthDateYearRestriction() {
    // Get all birth date input fields
    const birthDateFields = [
        'birthDate',           // Barangay ID form
        'certBirthDate',       // Certification form
        'indBirthDate',        // Indigency form
        'clearBirthDate'       // Clearance form
    ];
    
    birthDateFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            // Add input event listener to restrict year to 4 digits
            field.addEventListener('input', function(e) {
                const value = e.target.value;
                
                // Check if the value contains a year with more than 4 digits
                if (value.includes('-')) {
                    const parts = value.split('-');
                    if (parts.length === 3) {
                        const year = parts[0];
                        if (year.length > 4) {
                            // Truncate year to 4 digits
                            parts[0] = year.substring(0, 4);
                            e.target.value = parts.join('-');
                        }
                    }
                }
            });
            
            // Add paste event listener to handle pasted dates
            field.addEventListener('paste', function(e) {
                setTimeout(() => {
                    const value = e.target.value;
                    
                    if (value.includes('-')) {
                        const parts = value.split('-');
                        if (parts.length === 3) {
                            const year = parts[0];
                            if (year.length > 4) {
                                // Truncate year to 4 digits
                                parts[0] = year.substring(0, 4);
                                e.target.value = parts.join('-');
                            }
                        }
                    }
                }, 10);
            });
        }
    });
    
    console.log('Birth date year restriction initialized');
}

// Active request restrictions
async function applyActiveRequestRestrictions() {
    try {
        const email = sessionStorage.getItem('user_email') || localStorage.getItem('user_email');
        if (!email) return;
        const res = await fetch('php/check_active_requests.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!data.success) return;
        const active = data.active || {};
        console.log('Fetched active restrictions:', active);
        
        // Store active restrictions globally
        window.activeRestrictions = active;
        console.log('Stored window.activeRestrictions:', window.activeRestrictions);
        
        // Map UI buttons to request keys
        const map = {
            'barangay-id': 'barangay_id',
            'certification-form': 'certification',
            'certification-employment': 'coe',
            'indigency-form': 'indigency',
            'clearance-form': 'clearance'
        };
        const buttons = document.querySelectorAll('.document-btn');
        buttons.forEach(btn => {
            const type = btn.getAttribute('data-document');
            const key = map[type];
            if (!key) return;
            const isActive = !!(active[key] && active[key].active);
            if (isActive) {
                btn.classList.add('disabled-doc');
                btn.setAttribute('data-disabled-reason', 'Your request is in process. Wait to finish to submit again.');
                // Don't set pointerEvents to 'none' - we want clicks to work to show SweetAlert
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
                btn.style.border = '2px solid #e74c3c';
                btn.style.background = '#ffd6d1';
                btn.style.color = '#c0392b';
            } else {
                btn.classList.remove('disabled-doc');
                btn.removeAttribute('data-disabled-reason');
                btn.style.pointerEvents = ''; // Re-enable clicks
                btn.style.opacity = '';
                btn.style.cursor = '';
                btn.style.border = '';
                btn.style.background = '';
                btn.style.color = '';
            }
        });
        // Attach one-time click handler
        attachDisabledDocHandlers();
    } catch (e) {
        console.error('Failed to apply active request restrictions', e);
    }
}

// Check if form should be blocked
function shouldBlockForm(formType) {
    const active = window.activeRestrictions || {};
    console.log('shouldBlockForm called for:', formType, 'activeRestrictions:', active);
    const map = {
        'barangay-id': 'barangay_id',
        'certification-form': 'certification',
        'certification-employment': 'coe',
        'indigency-form': 'indigency',
        'clearance-form': 'clearance'
    };
    const key = map[formType];
    const isBlocked = !!(active[key] && active[key].active);
    console.log('Checking key:', key, 'isBlocked:', isBlocked);
    return isBlocked;
}

function attachDisabledDocHandlers() {
    // Remove all existing handlers first to avoid duplicates
    document.querySelectorAll('.document-btn').forEach(btn => {
        btn.removeAttribute('data-handler-attached');
    });
    
    const buttons = document.querySelectorAll('.document-btn.disabled-doc');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-handler-attached') === 'true') return;
        btn.setAttribute('data-handler-attached', 'true');
        
        // Add click handler to show SweetAlert when disabled button is clicked
        const clickHandler = function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'info',
                    title: 'Request in Progress',
                    text: 'Unable to request while your request is still processing. Please wait until it\'s finished.',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#3085d6',
                    customClass: {
                        popup: 'swal2-blocked-request-popup'
                    }
                });
            } else {
                const reason = btn.getAttribute('data-disabled-reason') || 'Your request is in process. Please wait to finish before submitting again.';
                showMessage(reason, 'error');
            }
            return false;
        };
        
        // Remove any existing handler first, then add new one with capture phase to catch early
        btn.removeEventListener('click', clickHandler, true);
        btn.addEventListener('click', clickHandler, true);
    });
}

// Also re-apply after switching documents
function onAfterShowAnyForm() {
    applyActiveRequestRestrictions();
}

// Hook after showing forms
const _showBarangayIdForm = showBarangayIdForm;
showBarangayIdForm = function() { _showBarangayIdForm(); onAfterShowAnyForm(); };
const _showCertificationForm = showCertificationForm;
showCertificationForm = function() { _showCertificationForm(); onAfterShowAnyForm(); };
const _showCoeForm = showCoeForm;
showCoeForm = function() { _showCoeForm(); onAfterShowAnyForm(); };
const _showIndigencyForm = showIndigencyForm;
showIndigencyForm = function() { _showIndigencyForm(); onAfterShowAnyForm(); };
const _showClearanceForm = showClearanceForm;
showClearanceForm = function() { _showClearanceForm(); onAfterShowAnyForm(); };