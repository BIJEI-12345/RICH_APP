// Registration Form Functionality
document.addEventListener('DOMContentLoaded', function() {
    // Get form elements
    const personalInfoForm = document.getElementById('personalInfoForm');
    const firstNameInput = document.getElementById('firstName');
    const middleNameInput = document.getElementById('middleName');
    const lastNameInput = document.getElementById('lastName');
    const emailInput = document.getElementById('email');
    const contactNumberInput = document.getElementById('contactNumber');
    const suffixSelect = document.getElementById('suffix');
    const noMiddleNameCheckbox = document.getElementById('noMiddleName');
    const ageInput = document.getElementById('age');
    const sexSelect = document.getElementById('sex');
    const birthdayInput = document.getElementById('birthday');
    const statusSelect = document.getElementById('status');
    const barangayInput = document.getElementById('barangay');
    const municipalityInput = document.getElementById('municipality');
    const provinceInput = document.getElementById('province');
    const sitioSelect = document.getElementById('sitio');
    const streetInput = document.getElementById('street');
    const houseNumberInput = document.getElementById('houseNumber');
    const validIdSelect = document.getElementById('validId');
    let idImageInput = document.getElementById('idImage');
    
    // Page elements
    const pageTitle = document.getElementById('pageTitle');
    const step1 = document.getElementById('step1');
    const step3 = document.getElementById('step3');
    const step4 = document.getElementById('step4');
    
    // Debug: Check if validIdSelect is found
    console.log('validIdSelect element:', validIdSelect);
    if (!validIdSelect) {
        console.error('validIdSelect element not found!');
    } else {
        console.log('validIdSelect found, options count:', validIdSelect.options.length);
        console.log('Current value:', validIdSelect.value);
        console.log('Selected index:', validIdSelect.selectedIndex);
    }
    const previewImg = document.getElementById('previewImg');
    const imagePreview = document.getElementById('imagePreview');
    const uploadArea = document.getElementById('uploadArea');
    const createBtn = document.querySelector('.create-btn');
    
    // Form validation functions
    function validateName(name) {
        return /^[a-zA-Z\s'-]+$/.test(name) && name.trim().length >= 2;
    }

    function validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function validateRequired(value) {
        return value.trim().length > 0;
    }

    // New validation functions
    function validateAge(age) {
        const ageNum = parseInt(age);
        return ageNum >= 18 && ageNum <= 100;
    }

    function validateBirthday(birthday) {
        if (!birthday) return false;
        const birthDate = new Date(birthday);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            return age - 1 >= 18;
        }
        return age >= 18;
    }

    function validateAddress(street, houseNumber, sitio) {
        return street.trim().length > 0 && houseNumber.trim().length > 0 && sitio.trim().length > 0;
    }

    function validateContactNumber(contactNumber) {
        const phoneRegex = /^[0-9]{11}$/;
        return phoneRegex.test(contactNumber.replace(/\s+/g, ''));
    }

    function validateIDImage(file) {
        if (!file) return false;
        
        // Check file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            return false;
        }
        
        // Check file size (5MB max)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
            return false;
        }
        
        return true;
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

    // Handle "no middle name" checkbox
    noMiddleNameCheckbox.addEventListener('change', function() {
        if (this.checked) {
            middleNameInput.value = '';
            middleNameInput.disabled = true;
            middleNameInput.style.backgroundColor = '#f9fafb';
            middleNameInput.style.color = '#9ca3af';
        } else {
            middleNameInput.disabled = false;
            middleNameInput.style.backgroundColor = '#ffffff';
            middleNameInput.style.color = '#333333';
        }
    });

    // Handle suffix select color change
    suffixSelect.addEventListener('change', function() {
        if (this.value === '') {
            // If no option is selected (placeholder), use light gray color
            this.classList.remove('has-selection');
        } else {
            // If an option is selected, use black color
            this.classList.add('has-selection');
        }
    });

    // Handle sex select color change
    sexSelect.addEventListener('change', function() {
        if (this.value === '') {
            // If no option is selected (placeholder), use light gray color
            this.classList.remove('has-selection');
        } else {
            // If an option is selected, use black color
            this.classList.add('has-selection');
        }
    });

    // Handle status select color change
    statusSelect.addEventListener('change', function() {
        if (this.value === '') {
            // If no option is selected (placeholder), use light gray color
            this.classList.remove('has-selection');
        } else {
            // If an option is selected, use black color
            this.classList.add('has-selection');
        }
    });

    // Calculate age from birth date
    function calculateAge(birthDate) {
        if (!birthDate) {
            ageInput.value = '';
            return;
        }
        
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        
        ageInput.value = age >= 0 ? age : '';
    }

    // Handle birthday input color change and calculate age
    function updateBirthdayColor() {
        if (birthdayInput && birthdayInput.value) {
            birthdayInput.classList.add('has-selection');
            calculateAge(birthdayInput.value);
        } else if (birthdayInput) {
            birthdayInput.classList.remove('has-selection');
            ageInput.value = '';
        }
    }
    birthdayInput.addEventListener('change', updateBirthdayColor);
    birthdayInput.addEventListener('input', updateBirthdayColor);
    // Initialize on load
    updateBirthdayColor();

    // Handle valid ID select color change
    validIdSelect.addEventListener('change', function() {
        if (this.value === '') {
            // If no option is selected (placeholder), use light gray color
            this.classList.remove('has-selection');
        } else {
            // If an option is selected, use black color
            this.classList.add('has-selection');
        }
    });

    // Handle sitio select color change
    sitioSelect.addEventListener('change', function() {
        if (this.value === '') {
            // If no option is selected (placeholder), use light gray color
            this.classList.remove('has-selection');
        } else {
            // If an option is selected, use black color
            this.classList.add('has-selection');
        }
    });


    // Restrict name fields to characters only (letters, spaces, hyphens, apostrophes)
    function restrictToCharactersOnly(input) {
        // Remove numbers and special characters except spaces, hyphens, and apostrophes
        input.addEventListener('input', function() {
            this.value = this.value.replace(/[^a-zA-Z\s'-]/g, '');
            clearError(this);
            if (this.value.trim() && !validateName(this.value)) {
                showError(this, 'Please enter a valid name');
            }
        });

        // Prevent typing numbers and unwanted special characters
        input.addEventListener('keypress', function(e) {
            // Allow: backspace, delete, tab, escape, enter
            if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
                // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                (e.keyCode === 65 && e.ctrlKey === true) ||
                (e.keyCode === 67 && e.ctrlKey === true) ||
                (e.keyCode === 86 && e.ctrlKey === true) ||
                (e.keyCode === 88 && e.ctrlKey === true) ||
                // Allow: home, end, left, right
                (e.keyCode >= 35 && e.keyCode <= 39)) {
                return;
            }
            // Allow letters (A-Z, a-z), space (32), hyphen (45), apostrophe (39)
            const char = String.fromCharCode(e.keyCode);
            if (!/[a-zA-Z\s'-]/.test(char)) {
                e.preventDefault();
            }
        });

        // Handle paste event - remove numbers and unwanted characters
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text');
            const textOnly = paste.replace(/[^a-zA-Z\s'-]/g, '');
            this.value = textOnly;
        });
    }

    // Apply character restriction to name fields
    restrictToCharactersOnly(firstNameInput);
    restrictToCharactersOnly(middleNameInput);
    restrictToCharactersOnly(lastNameInput);

    // Real-time validation
    firstNameInput.addEventListener('input', function() {
        clearError(this);
        if (this.value.trim() && !validateName(this.value)) {
            showError(this, 'Please enter a valid first name');
        }
    });

    middleNameInput.addEventListener('input', function() {
        clearError(this);
        if (this.value.trim() && !validateName(this.value)) {
            showError(this, 'Please enter a valid middle name');
        }
    });

    lastNameInput.addEventListener('input', function() {
        clearError(this);
        if (this.value.trim() && !validateName(this.value)) {
            showError(this, 'Please enter a valid last name');
        }
    });

    emailInput.addEventListener('input', function() {
        clearError(this);
        if (this.value.trim() && !validateEmail(this.value)) {
            showError(this, 'Please enter a valid email address');
        }
    });

    // Restrict contact number to numbers only
    contactNumberInput.addEventListener('input', function() {
        // Remove any non-numeric characters
        this.value = this.value.replace(/[^0-9]/g, '');
        clearError(this);
        if (this.value.trim() && !validateContactNumber(this.value)) {
            showError(this, 'Please enter a valid 11-digit contact number');
        }
    });

    // Prevent non-numeric input on contact number
    contactNumberInput.addEventListener('keypress', function(e) {
        // Allow: backspace, delete, tab, escape, enter
        if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            (e.keyCode === 65 && e.ctrlKey === true) ||
            (e.keyCode === 67 && e.ctrlKey === true) ||
            (e.keyCode === 86 && e.ctrlKey === true) ||
            (e.keyCode === 88 && e.ctrlKey === true) ||
            // Allow: home, end, left, right
            (e.keyCode >= 35 && e.keyCode <= 39)) {
            return;
        }
        // Ensure that it is a number and stop the keypress
        if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
            e.preventDefault();
        }
    });

    // Handle paste event for contact number
    contactNumberInput.addEventListener('paste', function(e) {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const numbersOnly = paste.replace(/[^0-9]/g, '');
        this.value = numbersOnly;
    });

    // Restrict house number to numbers only
    houseNumberInput.addEventListener('input', function() {
        // Remove any non-numeric characters
        this.value = this.value.replace(/[^0-9]/g, '');
    });

    // Prevent non-numeric input on house number
    houseNumberInput.addEventListener('keypress', function(e) {
        // Allow: backspace, delete, tab, escape, enter
        if ([8, 9, 27, 13, 46].indexOf(e.keyCode) !== -1 ||
            // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
            (e.keyCode === 65 && e.ctrlKey === true) ||
            (e.keyCode === 67 && e.ctrlKey === true) ||
            (e.keyCode === 86 && e.ctrlKey === true) ||
            (e.keyCode === 88 && e.ctrlKey === true) ||
            // Allow: home, end, left, right
            (e.keyCode >= 35 && e.keyCode <= 39)) {
            return;
        }
        // Ensure that it is a number and stop the keypress
        if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
            e.preventDefault();
        }
    });

    // Handle paste event for house number
    houseNumberInput.addEventListener('paste', function(e) {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        const numbersOnly = paste.replace(/[^0-9]/g, '');
        this.value = numbersOnly;
    });

    // ID Upload functionality
    function initializeIDUpload() {
        // Upload area click handler
        uploadArea.addEventListener('click', function() {
            idImageInput.click();
        });

        // File input change handler
        idImageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                handleImageUpload(file);
            }
        });

        // Drag and drop functionality
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) {
                handleImageUpload(file);
            }
        });
    }

    let idOcrValidation = { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' }, fullText: '' };

    async function handleImageUpload(file) {
        if (!validateIDImage(file)) {
            showError(idImageInput, 'Please upload a valid image file (JPG, PNG) under 5MB');
            return;
        }

        // Clear any existing errors
        clearError(idImageInput);

        // Show loading state
        const uploadAreaElement = document.getElementById('uploadArea');
        uploadAreaElement.innerHTML = '<div class="loading-spinner"><p>Validating ID...</p></div>';

        // Convert image to base64
        const reader = new FileReader();
        reader.onload = async function(e) {
            // Create preview immediately
            previewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            uploadArea.style.display = 'none';

            try {
                // Validate ID via Gemini API (server-side proxy)
                const result = await validateIDAddressWithGemini(file);
                
                if (!result.ok) {
                    console.log('Vision API not available, skipping validation');
                    idOcrValidation = { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' } };
                } else if (!result.hasBigte) {
                    // Store validation result - will check on form submit
                    console.warn('ID validation: "Bigte" not found in address.');
                    idOcrValidation = { ok: true, hasBigte: false, name: result.name, fullText: result.fullText || '' };
                } else {
                    console.log('✓ ID validated - Bigte found in address');
                    idOcrValidation = { ok: true, hasBigte: true, name: result.name, fullText: result.fullText || '' };
                }
            } catch (error) {
                console.error('ID validation error:', error);
                // Store validation result - will check on form submit
                idOcrValidation = { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' }, fullText: '' };
            }
        };
        reader.readAsDataURL(file);
    }

    // Validate address on the ID image using Gemini backend
    async function validateIDAddressWithGemini(file) {
        // Convert file to base64
        const base64Image = await fileToBase64(file);

        try {
            const response = await fetch('php/gemini_verify.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image_base64: base64Image })
            });

            // Response is always 200 with success flag

            // Try parse JSON safely; backend should always return JSON but guard anyway
            let data;
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                console.error('Vision API error: Non-JSON response:', text.slice(0, 200));
                return { ok: false, hasBigte: false };
            }
            if (!data.success || !data.ok) {
                console.log('Vision proxy error:', data.message || 'Unknown');
                // Fallback to local OCR
                const fallback = await ocrWithTesseract(base64Image);
                return fallback;
            }

            console.log('Extracted text from ID:', data.fullText || data.addressText);
            return { ok: true, hasBigte: !!data.hasMatch, name: { first: data.firstName || '', middle: data.middleName || '', last: data.lastName || '' }, fullText: data.fullText || '' };
        } catch (error) {
            console.error('Vision API error:', error);
            // Fallback to local OCR
            const fallback = await ocrWithTesseract(base64Image);
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

    async function ocrWithTesseract(base64Image) {
        try {
            await ensureTesseractLoaded();
            const { data } = await window.Tesseract.recognize(base64Image, 'eng');
            const text = (data && data.text) ? data.text : '';
            const hay = text.toLowerCase();
            const hasBigte = hay.includes('bigte');
            // Name extraction simple heuristic (best-effort)
            const name = { first: '', middle: '', last: '' };
            // Try to capture tokens following common labels
            const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
            for (const ln of lines) {
                const low = ln.toLowerCase();
                if (low.includes('name') || low.includes('bearer') || low.includes('cardholder')) {
                    const parts = ln.replace(/name[:\-\s]*/i,'').trim().split(/\s+/);
                    if (parts.length >= 2) {
                        name.first = parts[0];
                        name.last = parts[parts.length-1];
                        if (parts.length >= 3) name.middle = parts.slice(1, parts.length-1).join(' ');
                        break;
                    }
                }
            }
            return { ok: true, hasBigte, name, fullText: text };
        } catch (e) {
            console.warn('Fallback OCR failed:', e);
            return { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' }, fullText: '' };
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    }

    function removeImage() {
        idImageInput.value = '';
        imagePreview.style.display = 'none';
        uploadArea.style.display = 'block';
        clearError(idImageInput);
    }

    // Camera and Gallery functions
    window.openCamera = function() {
        console.log('Opening camera...');
        
        // Clear any previous file selection
        idImageInput.value = '';
        
        // Remove all existing event listeners by removing and re-adding the input
        const parent = idImageInput.parentNode;
        if (parent) {
            const newInput = document.createElement('input');
            newInput.type = 'file';
            newInput.id = 'idImage';
            newInput.accept = 'image/*';
            newInput.style.display = 'none';
            
            // Replace the old input with new one
            parent.replaceChild(newInput, idImageInput);
            idImageInput = newInput;
        } else {
            console.error('Cannot find parent node for idImageInput');
            return;
        }
        
        // Detect mobile device
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log('Mobile device detected:', isMobile);
        
        if (isMobile) {
            // For mobile devices, use environment camera
            console.log('Using mobile camera approach');
            
            // Set attributes for camera capture
            idImageInput.setAttribute('capture', 'environment');
            idImageInput.setAttribute('accept', 'image/*');
            
            console.log('Mobile camera attributes set:', {
                capture: idImageInput.getAttribute('capture'),
                accept: idImageInput.getAttribute('accept')
            });
            
            // Add event listener
            idImageInput.addEventListener('change', function(e) {
                console.log('Mobile camera capture triggered');
                const file = e.target.files[0];
                if (file) {
                    console.log('File captured from mobile camera:', file.name, file.type, file.size);
                    handleImageUpload(file);
                }
            }, { once: true });
            
            // Trigger camera
            setTimeout(() => {
                console.log('Triggering mobile camera...');
                idImageInput.click();
            }, 100);
            
        } else {
            // For desktop, use standard approach
            console.log('Using desktop camera approach');
            idImageInput.setAttribute('capture', 'environment');
            idImageInput.setAttribute('accept', 'image/*');
            
            idImageInput.addEventListener('change', function(e) {
                console.log('Desktop camera capture triggered');
                const file = e.target.files[0];
                if (file) {
                    console.log('File captured from desktop camera:', file.name, file.type, file.size);
                    handleImageUpload(file);
                }
            }, { once: true });
            
            idImageInput.click();
        }
    };

    window.openGallery = function() {
        console.log('Opening file browser...');
        
        // Clear any previous file selection
        idImageInput.value = '';
        
        // Remove capture attribute to open file browser
        idImageInput.removeAttribute('capture');
        idImageInput.setAttribute('accept', 'image/*');
        
        console.log('File browser attributes set:', {
            capture: idImageInput.getAttribute('capture'),
            accept: idImageInput.getAttribute('accept')
        });
        
        // Trigger the file input which should open file browser
        idImageInput.click();
        
        // Add event listener to handle file selection
        idImageInput.addEventListener('change', function(e) {
            console.log('File selection triggered');
            const file = e.target.files[0];
            if (file) {
                console.log('File selected from browser:', file.name, file.type, file.size);
                handleImageUpload(file);
            }
        }, { once: true });
    };

    window.removeImage = removeImage;

    // Initialize ID upload
    initializeIDUpload();

    // Test validId select functionality
    if (validIdSelect) {
        validIdSelect.addEventListener('change', function() {
            console.log('ValidId changed to:', this.value, 'Index:', this.selectedIndex);
        });
        
        validIdSelect.addEventListener('click', function() {
            console.log('ValidId clicked, current value:', this.value);
        });
    }


    // Validate personal info form
    function validatePersonalInfoForm() {
        // Clear all previous errors
        clearError(firstNameInput);
        clearError(middleNameInput);
        clearError(lastNameInput);
        clearError(emailInput);
        clearError(contactNumberInput);
        clearError(ageInput);
        clearError(sexSelect);
        clearError(birthdayInput);
        clearError(statusSelect);
        clearError(sitioSelect);
        clearError(streetInput);
        clearError(houseNumberInput);
        clearError(validIdSelect);
        clearError(idImageInput);
        
        let isValid = true;
        
        // Validate first name
        if (!validateRequired(firstNameInput.value)) {
            showError(firstNameInput, 'First name is required');
            isValid = false;
        } else if (!validateName(firstNameInput.value)) {
            showError(firstNameInput, 'Please enter a valid first name');
            isValid = false;
        }
        
        // Validate middle name (only if not disabled)
        if (!middleNameInput.disabled && middleNameInput.value.trim()) {
            if (!validateName(middleNameInput.value)) {
                showError(middleNameInput, 'Please enter a valid middle name');
                isValid = false;
            }
        }
        
        // Validate last name
        if (!validateRequired(lastNameInput.value)) {
            showError(lastNameInput, 'Last name is required');
            isValid = false;
        } else if (!validateName(lastNameInput.value)) {
            showError(lastNameInput, 'Please enter a valid last name');
            isValid = false;
        }
        
        // Validate email
        if (!validateRequired(emailInput.value)) {
            showError(emailInput, 'Email address is required');
            isValid = false;
        } else if (!validateEmail(emailInput.value)) {
            showError(emailInput, 'Please enter a valid email address');
            isValid = false;
        }

        // Validate contact number
        if (!validateRequired(contactNumberInput.value)) {
            showError(contactNumberInput, 'Contact number is required');
            isValid = false;
        } else if (!validateContactNumber(contactNumberInput.value)) {
            showError(contactNumberInput, 'Please enter a valid 11-digit contact number');
            isValid = false;
        }

        // Validate new fields
        // Age validation (auto-calculated from birth date)
        if (!validateRequired(ageInput.value)) {
            showError(ageInput, 'Please enter your birth date to calculate age');
            isValid = false;
        } else if (!validateAge(ageInput.value)) {
            showError(ageInput, 'You must be at least 18 years old');
            isValid = false;
        }

        // Sex validation
        if (!validateRequired(sexSelect.value)) {
            showError(sexSelect, 'Please select your sex');
            isValid = false;
        }

        // Birthday validation
        if (!validateRequired(birthdayInput.value)) {
            showError(birthdayInput, 'Birthday is required');
            isValid = false;
        } else if (!validateBirthday(birthdayInput.value)) {
            showError(birthdayInput, 'Please enter a valid birthday (must be 18+ years old)');
            isValid = false;
        }

        // Status validation
        if (!validateRequired(statusSelect.value)) {
            showError(statusSelect, 'Please select your civil status');
            isValid = false;
        }

        // Address validation
        if (!validateRequired(sitioSelect.value)) {
            showError(sitioSelect, 'Please select a sitio');
            isValid = false;
        }
        
        if (!validateRequired(streetInput.value)) {
            showError(streetInput, 'Street is required');
            isValid = false;
        }
        
        if (!validateRequired(houseNumberInput.value)) {
            showError(houseNumberInput, 'House number is required');
            isValid = false;
        }
        
        if (!validateAddress(streetInput.value, houseNumberInput.value, sitioSelect.value)) {
            if (!sitioSelect.classList.contains('error') && !streetInput.classList.contains('error') && !houseNumberInput.classList.contains('error')) {
                showError(sitioSelect, 'Please complete all address fields');
            }
            isValid = false;
        }

        // Valid ID validation
        if (!validateRequired(validIdSelect.value)) {
            showError(validIdSelect, 'Please select a type of valid ID');
            isValid = false;
        }

        // ID Image validation
        if (!validateIDImage(idImageInput.files[0])) {
            showError(idImageInput, 'Please upload a valid ID image (JPG, PNG under 5MB)');
            isValid = false;
        }
        
        // Gate by ID OCR results: require "Bigte" in address only
        if (!idOcrValidation.hasBigte && idOcrValidation.ok) {
            // Show SweetAlert only if validation succeeded but Bigte not found
            Swal.fire({
                icon: 'error',
                title: 'ID Validation Failed',
                text: 'Please ensure that you are a resident of Barangay Bigte and that your ID clearly shows the information.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                allowOutsideClick: false,
                allowEscapeKey: false
            });
            
            isValid = false;
        }

        return isValid;
    }

    // Form submission
    personalInfoForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Validate personal info form
        if (!validatePersonalInfoForm()) {
            return;
        }
        
        // Show loading state
        const createBtn = document.querySelector('.create-btn');
        createBtn.classList.add('loading');
        createBtn.textContent = 'Creating account...';
        
        // Prepare form data with image
        const formData = new FormData();
        formData.append('firstName', firstNameInput.value.trim());
        formData.append('middleName', noMiddleNameCheckbox.checked ? '' : middleNameInput.value.trim());
        formData.append('lastName', lastNameInput.value.trim());
        formData.append('suffix', suffixSelect.value);
        formData.append('email', emailInput.value.trim());
        formData.append('contactNumber', contactNumberInput.value.trim());
        formData.append('hasNoMiddleName', noMiddleNameCheckbox.checked);
        formData.append('age', ageInput.value);
        formData.append('sex', sexSelect.value);
        formData.append('birthday', birthdayInput.value);
        formData.append('status', statusSelect.value);
        
        // Combine address fields into a single address string
        const fullAddress = `${houseNumberInput.value.trim()}, ${streetInput.value.trim()}, ${sitioSelect.value}, ${barangayInput.value}, ${municipalityInput.value}, ${provinceInput.value}`;
        formData.append('address', fullAddress);
        formData.append('barangay', barangayInput.value);
        formData.append('municipality', municipalityInput.value);
        formData.append('province', provinceInput.value);
        formData.append('sitio', sitioSelect.value);
        formData.append('street', streetInput.value.trim());
        formData.append('houseNumber', houseNumberInput.value.trim());
        
        // Debug: Check validId before appending
        console.log('About to append validId:', validIdSelect.value, 'Type:', typeof validIdSelect.value);
        formData.append('validId', validIdSelect.value);
        
        // Add image file if selected
        if (idImageInput.files[0]) {
            formData.append('idImage', idImageInput.files[0]);
        }
        
        // Debug: Log form data being sent
        console.log('Sending form data:', formData);
        console.log('ValidId value:', validIdSelect.value);
        console.log('ValidId selected:', validIdSelect.selectedIndex, validIdSelect.options[validIdSelect.selectedIndex]);
        
        // Debug: Log all FormData entries
        console.log('FormData entries:');
        for (let [key, value] of formData.entries()) {
            console.log(key + ':', value);
        }
        
        // Send registration request to PHP backend
        fetch('php/create_account1.php', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(async data => {
            if (data.success) {
                // Store user data for next step
                localStorage.setItem('registrationEmail', data.email);
                
                // If OTP code is provided (for testing), show it
                if (data.otp_code) {
                    console.log('OTP Code for testing:', data.otp_code);
                    // Optionally show OTP in console or alert for development
                    // Uncomment the line below for development/testing:
                    // console.log('🔐 OTP Code:', data.otp_code);
                }
                
                // Redirect to email verification page
                window.location.href = 'email_verification.html';
            } else {
                // Show detailed error message
                let errorMessage = data.message || 'Registration failed. Please try again.';
                
                // If OTP code is available even on failure (for testing), include it
                if (data.otp_code) {
                    console.error('Registration failed but OTP generated:', data.otp_code);
                    errorMessage += '\n\nNote: OTP code was generated but email delivery failed. Check server logs for the code.';
                }
                
                await Swal.fire({
                    icon: 'error',
                    title: 'Registration Failed',
                    html: errorMessage.replace(/\n/g, '<br>'),
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545',
                    width: '500px'
                });
            }
        })
        .catch(async error => {
            console.error('Registration error:', error);
            await Swal.fire({
                icon: 'error',
                title: 'Network Error',
                text: 'Network error. Please try again.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545'
            });
        })
        .finally(() => {
            // Reset button
            createBtn.classList.remove('loading');
            createBtn.textContent = 'Create new account';
        });
    });

    // Navigation functions
    window.goBack = function() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'index.html';
        }
    };

    window.goToLogin = function() {
        window.location.href = 'index.html';
    };

    // Terms and Conditions links
    document.querySelectorAll('.terms-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const linkText = this.textContent;
            alert(`${linkText} - This would open the ${linkText} page.`);
        });
    });

    // Focus management and animations
    const inputs = [firstNameInput, middleNameInput, lastNameInput, emailInput];
    
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('focus', function() {
                this.parentNode.style.transform = 'scale(1.02)';
            });

            input.addEventListener('blur', function() {
                this.parentNode.style.transform = 'scale(1)';
            });
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const activeElement = document.activeElement;
            if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT') {
                e.preventDefault();
                // Submit the form
                if (personalInfoForm.classList.contains('active')) {
                    personalInfoForm.dispatchEvent(new Event('submit'));
                }
            }
        }
    });

    // Auto-format names (capitalize first letter of each word)
    [firstNameInput, middleNameInput, lastNameInput].forEach(input => {
        input.addEventListener('blur', function() {
            if (this.value.trim()) {
                this.value = this.value.trim().replace(/\b\w/g, l => l.toUpperCase());
            }
        });
    });

    // Email lowercase
    emailInput.addEventListener('blur', function() {
        if (this.value.trim()) {
            this.value = this.value.trim().toLowerCase();
        }
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
