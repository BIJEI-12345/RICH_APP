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
    let uploadAreaDefaultHtml = '';
    const createBtn = document.querySelector('.create-btn');
    const regStepPersonal = document.getElementById('regStepPersonal');
    const regStepId = document.getElementById('regStepId');
    const regStepAccount = document.getElementById('regStepAccount');
    const btnRegStepContinue = document.getElementById('btnRegStepContinue');
    const idValidationOverlay = document.getElementById('idValidationOverlay');
    const idValidationOverlayText = document.getElementById('idValidationOverlayText');

    /** First letter of each word → uppercase while typing (create account step 1: names, street). */
    (function attachAutoCapitalizeNameFields() {
        function capitalizeLeadingLetters(value) {
            return value.replace(/(^|[\s\-'])(\p{Ll})/gu, (_, sep, ll) => sep + ll.toUpperCase());
        }
        function onInput(e) {
            const t = e.target;
            const before = t.value;
            const after = capitalizeLeadingLetters(before);
            if (after === before) return;
            const start = t.selectionStart;
            const end = t.selectionEnd;
            t.value = after;
            const lenDiff = after.length - before.length;
            if (start != null && end != null) {
                try {
                    t.setSelectionRange(start + lenDiff, end + lenDiff);
                } catch (_) {}
            }
        }
        [firstNameInput, middleNameInput, lastNameInput, streetInput].forEach((el) => {
            if (el) el.addEventListener('input', onInput);
        });
    })();

    function showIdValidationLoading(message) {
        if (idValidationOverlayText && typeof message === 'string' && message.trim()) {
            idValidationOverlayText.textContent = message.trim();
        } else if (idValidationOverlayText) {
            idValidationOverlayText.textContent = 'Validating ID...';
        }
        if (idValidationOverlay) {
            idValidationOverlay.classList.add('id-validation-overlay--visible');
            idValidationOverlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    }

    function hideIdValidationLoading() {
        if (idValidationOverlay) {
            idValidationOverlay.classList.remove('id-validation-overlay--visible');
            idValidationOverlay.setAttribute('aria-hidden', 'true');
        }
        document.body.style.overflow = '';
    }

    /** Same strings as HTML option value / php/gemini_verify.php expected_id_type */
    const ALLOWED_VALID_ID_TYPES = new Set([
        'National ID', "Driver's License", 'Passport', 'SSS ID', 'Umid ID', 'GSIS ID', 'TIN ID',
        'Barangay ID', 'PhilHealth ID', 'Postal ID', 'Senior Citizen ID'
    ]);

    function mapValidIdLabelToExpectedType(label) {
        if (!label || !String(label).trim()) return null;
        return ALLOWED_VALID_ID_TYPES.has(label) ? label : null;
    }

    function accountFileIdentifier(file) {
        if (!file) return null;
        return file.name + '_' + file.size + '_' + file.lastModified;
    }

    let idTypeValidationAccount = {
        ok: false,
        idTypeMatch: false,
        validatedFile: null,
        expectedIdType: null,
        detectedIdType: null,
        errorMessage: null,
        skippedNoApiMapping: false
    };

    function getIDTypeMismatchError() {
        return 'The uploaded image is invalid. Please upload a valid ID and select correct ID type.';
    }

    /** Match server-side bigte_ocr_helpers.php — Tesseract often misreads B as 8 */
    function hasBigteInOcrText(text) {
        if (!text || typeof text !== 'string') return false;
        const hay = text.toLowerCase();
        if (hay.includes('bigte')) return true;
        const oneLine = text.replace(/\s+/g, ' ');
        if (/\b[8b]igte\b/i.test(oneLine)) return true;
        if (/\bupper\s*,?\s*[b8]igte/i.test(oneLine)) return true;
        if (/\btirahan.*[b8]igte/i.test(oneLine)) return true;
        return false;
    }

    /** Client fallback when gemini_verify.php fails — same rules as js/request.js performIDTypeMatching */
    function performIdTypeMatchFromText(fullText, expectedIdType) {
        const lowerText = fullText.toLowerCase();
        let detectedIdType = 'unknown';
        let idTypeMatch = false;

        const idTypeMap = {
            'National ID': {
                keywords: ['philsys', 'philid', 'national id', 'pambansang', 'pagkakakilanlan', 'philippine identification', 'identification card', 'psn']
            },
            "Driver's License": {
                keywords: ['driver', 'license', 'drivers license', 'driving license', 'lto', 'land transportation office', 'non-professional', 'professional']
            },
            'Passport': {
                keywords: ['passport', 'department of foreign affairs', 'dfa', 'passport no']
            },
            'SSS ID': {
                keywords: ['sss', 'social security', 'social security system', 'sss id', 'sss number']
            },
            'Umid ID': {
                keywords: ['umid', 'unified multipurpose', 'unified multi-purpose', 'umid card']
            },
            'GSIS ID': {
                keywords: ['gsis', 'government service insurance']
            },
            'TIN ID': {
                keywords: ['tin', 'bureau of internal revenue', 'bir', 'tax identification']
            },
            'Barangay ID': {
                keywords: ['barangay', 'brgy', 'barangay clearance', 'barangay certificate']
            },
            'PhilHealth ID': {
                keywords: ['philhealth', 'phil health', 'national health insurance', 'nhip']
            },
            'Postal ID': {
                keywords: ['postal', 'philpost', 'philippine postal', 'postal identification']
            },
            'Senior Citizen ID': {
                keywords: ['senior citizen', 'oscad', 'senior citizen id']
            }
        };

        if (/\bpassport\b/i.test(fullText) || /\bdfa\b/i.test(fullText) || /department of foreign affairs/i.test(fullText)) {
            detectedIdType = 'Passport';
        } else if ((/\bdriver\b/i.test(fullText) || /\blto\b/i.test(fullText)) && /\blicense\b/i.test(fullText)) {
            detectedIdType = "Driver's License";
        } else if (
            /\bphilsys\b/i.test(fullText) ||
            /\bphil\s*id\b/i.test(fullText) ||
            /pambansang\s+pagkakakilanlan/i.test(fullText) ||
            /philippine\s+identification/i.test(fullText) ||
            (/\bnational\s+id\b/i.test(fullText) && /philippine|phil/i.test(fullText))
        ) {
            detectedIdType = 'National ID';
        } else if (/\bumid\b/i.test(fullText) || /unified\s+multipurpose/i.test(fullText)) {
            detectedIdType = 'Umid ID';
        } else if (/\bgsis\b/i.test(fullText) || /government\s+service\s+insurance/i.test(fullText)) {
            detectedIdType = 'GSIS ID';
        } else if (/\btin\b/i.test(fullText) && (/\bbir\b/i.test(fullText) || /bureau\s+of\s+internal\s+revenue/i.test(fullText) || /tax\s+identification/i.test(fullText))) {
            detectedIdType = 'TIN ID';
        } else if (/\bphilhealth\b/i.test(fullText) || /\bphil health\b/i.test(fullText) || /\bnational health insurance\b/i.test(fullText)) {
            detectedIdType = 'PhilHealth ID';
        } else if (/\bpostal\b/i.test(fullText) || /\bphilpost\b/i.test(fullText)) {
            detectedIdType = 'Postal ID';
        } else if (/\bsenior citizen\b/i.test(fullText) || /\boscad\b/i.test(fullText)) {
            detectedIdType = 'Senior Citizen ID';
        } else if (/\bbarangay\b/i.test(fullText) || /\bbrgy\.?\b/i.test(fullText)) {
            detectedIdType = 'Barangay ID';
        } else if (/\bsss\b/i.test(fullText) || /\bsocial security\b/i.test(fullText)) {
            detectedIdType = 'SSS ID';
        }

        if (expectedIdType === 'other' || !expectedIdType) {
            return { idTypeMatch: true, detectedIdType };
        }

        if (detectedIdType === expectedIdType) {
            idTypeMatch = true;
        } else if (idTypeMap[expectedIdType]) {
            const keywords = idTypeMap[expectedIdType].keywords;
            for (const keyword of keywords) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    idTypeMatch = true;
                    break;
                }
            }
        }

        return { idTypeMatch, detectedIdType };
    }

    async function applyIdTypeValidationFromGeminiResult(result, file) {
        const fid = accountFileIdentifier(file);
        const expectedKey = mapValidIdLabelToExpectedType(validIdSelect.value);

        if (!expectedKey) {
            idTypeValidationAccount = {
                ok: true,
                idTypeMatch: true,
                validatedFile: fid,
                expectedIdType: null,
                detectedIdType: null,
                errorMessage: null,
                skippedNoApiMapping: true
            };
            clearError(idImageInput);
            previewImg.style.border = '';
            return;
        }

        if (result.idTypeMatch === undefined) {
            idTypeValidationAccount = {
                ok: false,
                idTypeMatch: true,
                validatedFile: fid,
                expectedIdType: expectedKey,
                detectedIdType: null,
                errorMessage: null,
                skippedNoApiMapping: true
            };
            return;
        }

        const errMsg = result.idTypeMatch ? null : getIDTypeMismatchError();
        idTypeValidationAccount = {
            ok: true,
            idTypeMatch: result.idTypeMatch,
            validatedFile: fid,
            expectedIdType: expectedKey,
            detectedIdType: result.detectedIdType || null,
            errorMessage: errMsg,
            skippedNoApiMapping: false
        };

        if (!result.idTypeMatch) {
            showError(idImageInput, errMsg);
            previewImg.style.border = '3px solid #dc3545';
            await Swal.fire({
                icon: 'error',
                title: 'ID Type Mismatch',
                text: errMsg,
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                width: '500px'
            });
        } else {
            clearError(idImageInput);
            previewImg.style.border = '';
        }
    }

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

    async function checkEmailAvailability(email) {
        const response = await fetch('php/check_email_availability.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        let data = null;
        try {
            data = await response.json();
        } catch (_) {
            throw new Error('Unable to validate email right now. Please try again.');
        }

        if (!response.ok || !data || !data.success) {
            throw new Error((data && data.message) ? data.message : 'Unable to validate email right now. Please try again.');
        }

        return !!data.available;
    }

    // New validation functions
    function validateAge(age) {
        const ageNum = parseInt(age);
        return ageNum >= 15 && ageNum <= 100;
    }

    function validateBirthday(birthday) {
        if (!birthday) return false;
        const birthDate = new Date(birthday);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            return age - 1 >= 15;
        }
        return age >= 15;
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
        
        // Check file size (10MB max)
        const maxSize = 10 * 1024 * 1024; // 10MB in bytes
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
            const ageNum = parseInt(ageInput.value || '0', 10);
            if (!Number.isNaN(ageNum) && ageNum > 0 && ageNum < 15) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Age Restriction',
                    text: 'You must be at least 15 years old to create an account.',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545'
                });
                birthdayInput.value = '';
                ageInput.value = '';
                birthdayInput.classList.remove('has-selection');
            }
        } else if (birthdayInput) {
            birthdayInput.classList.remove('has-selection');
            ageInput.value = '';
        }
    }
    // Set max birthday date to ensure minimum age of 15
    const today = new Date();
    const maxBirthdayDate = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());
    birthdayInput.max = maxBirthdayDate.toISOString().split('T')[0];

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
        uploadAreaDefaultHtml = uploadArea.innerHTML;
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
            showError(idImageInput, 'Please upload a valid image file (JPG, PNG) under 10MB');
            return;
        }

        // Clear any existing errors
        clearError(idImageInput);

        const uploadAreaElement = document.getElementById('uploadArea');

        // Convert image to base64
        const reader = new FileReader();
        reader.onload = async function(e) {
            let imageDataUrl = e.target.result;
            
            try {
                // Use full image (no auto-crop). Vision CROP_HINTS often tight-crops IDs and cuts off
                // address/text needed for Bigte + ID-type OCR (e.g. PhilID bottom fields).
                // Full-screen overlay for validation is shown inside validateIDAddressWithGemini

                // Step 1: Show preview with original image
                previewImg.src = imageDataUrl;
                imagePreview.style.display = 'block';
                uploadArea.style.display = 'none';
                
                // Step 2: Update the file input from the same image data
                try {
                    const response = await fetch(imageDataUrl);
                    const blob = await response.blob();
                    const processedFile = new File([blob], file.name, { type: file.type || 'image/jpeg' });
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(processedFile);
                    idImageInput.files = dataTransfer.files;
                } catch (fileUpdateError) {
                    console.warn('Failed to update file input, but continuing:', fileUpdateError);
                }
                
                // Step 3: gemini_verify.php — one OCR; client applies ID type first, then Bigte state
                const fileToValidate = idImageInput.files[0] || file;
                const expectedKey = mapValidIdLabelToExpectedType(validIdSelect.value);
                const result = await validateIDAddressWithGemini(fileToValidate, {
                    expectedIdType: expectedKey,
                    imageBase64: imageDataUrl
                });

                await applyIdTypeValidationFromGeminiResult(result, fileToValidate);

                if (!result.ok) {
                    console.log('Vision API not available, skipping validation');
                    idOcrValidation = { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' } };
                } else if (!result.hasBigte) {
                    console.warn('ID validation: "Bigte" not found in address.');
                    idOcrValidation = { ok: true, hasBigte: false, name: result.name, fullText: result.fullText || '' };
                } else {
                    console.log('✓ ID validated - Bigte found in address');
                    idOcrValidation = { ok: true, hasBigte: true, name: result.name, fullText: result.fullText || '' };
                }

                if (uploadAreaDefaultHtml) {
                    uploadAreaElement.innerHTML = uploadAreaDefaultHtml;
                }

                tryShowRegistrationAccountStep();
            } catch (error) {
                console.error('Image processing error:', error);
                // Show original image if processing fails
                previewImg.src = e.target.result;
                imagePreview.style.display = 'block';
                uploadArea.style.display = 'none';
                idOcrValidation = { ok: false, hasBigte: false, name: { first:'', middle:'', last:'' }, fullText: '' };
                if (uploadAreaDefaultHtml) {
                    uploadAreaElement.innerHTML = uploadAreaDefaultHtml;
                }
                hideRegistrationAccountStep();
            }
        };
        reader.readAsDataURL(file);
    }

    /**
     * php/gemini_verify.php — one Vision OCR; server evaluates ID type then Bigte. Client should apply ID type UI before Bigte.
     * @param {object} options — optional imageBase64 (data URL) to skip re-reading the file (faster).
     */
    async function validateIDAddressWithGemini(file, options = {}) {
        const expectedIdType = options.expectedIdType || null;
        const loadingMsg = options.loadingMessage;

        let base64Image;
        if (options.imageBase64 && typeof options.imageBase64 === 'string') {
            base64Image = options.imageBase64;
        } else {
            try {
                base64Image = await fileToBase64(file);
            } catch (e) {
                throw e;
            }
        }

        // Let preview paint, then show overlay only for the Vision request (shorter perceived wait)
        await new Promise(function(resolve) {
            requestAnimationFrame(function() {
                requestAnimationFrame(resolve);
            });
        });
        showIdValidationLoading(loadingMsg);

        function enrichWithIdTypeFallback(base) {
            if (!expectedIdType) {
                return { ...base, skippedNoApiMapping: true };
            }
            const m = performIdTypeMatchFromText(base.fullText || '', expectedIdType);
            return {
                ...base,
                idTypeMatch: m.idTypeMatch,
                detectedIdType: m.detectedIdType,
                idTypeFromClientFallback: true
            };
        }

        try {
            const body = { image_base64: base64Image };
            if (expectedIdType) {
                body.expected_id_type = expectedIdType;
            }
            const response = await fetch('php/gemini_verify.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            let data;
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch (e) {
                const fallback = await ocrWithTesseract(base64Image);
                return enrichWithIdTypeFallback(fallback);
            }
            if (!data.success || !data.ok) {
                const fallback = await ocrWithTesseract(base64Image);
                return enrichWithIdTypeFallback(fallback);
            }

            const out = {
                ok: true,
                hasBigte: !!data.hasMatch,
                name: {
                    first: data.firstName || '',
                    middle: data.middleName || '',
                    last: data.lastName || ''
                },
                fullText: data.fullText || ''
            };

            if (expectedIdType) {
                out.idTypeMatch = !!data.idTypeMatch;
                out.detectedIdType = data.detectedIdType;
                out.idTypeFromApi = true;
            } else {
                out.skippedNoApiMapping = true;
            }

            return out;
        } catch (error) {
            const fallback = await ocrWithTesseract(base64Image);
            return enrichWithIdTypeFallback(fallback);
        } finally {
            hideIdValidationLoading();
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
            const hasBigte = hasBigteInOcrText(text);
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
        if (uploadAreaDefaultHtml) {
            uploadArea.innerHTML = uploadAreaDefaultHtml;
        }
        previewImg.src = '';
        previewImg.style.border = '';
        previewImg.style.opacity = '1';
        clearError(idImageInput);
        idTypeValidationAccount = {
            ok: false,
            idTypeMatch: false,
            validatedFile: null,
            expectedIdType: null,
            detectedIdType: null,
            errorMessage: null,
            skippedNoApiMapping: false
        };
        idOcrValidation = { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
        hideRegistrationAccountStep();
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

    if (validIdSelect) {
        validIdSelect.addEventListener('change', async function() {
            if (imagePreview.style.display !== 'none' && previewImg.src && idImageInput.files && idImageInput.files[0]) {
                const f = idImageInput.files[0];
                const key = mapValidIdLabelToExpectedType(validIdSelect.value);
                const res = await validateIDAddressWithGemini(f, {
                    expectedIdType: key,
                    imageBase64: previewImg.src && previewImg.src.indexOf('data:') === 0 ? previewImg.src : undefined
                });
                await applyIdTypeValidationFromGeminiResult(res, f);
                if (!res.ok) {
                    idOcrValidation = { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
                } else {
                    idOcrValidation = {
                        ok: true,
                        hasBigte: res.hasBigte,
                        name: res.name,
                        fullText: res.fullText || ''
                    };
                }
                tryShowRegistrationAccountStep();
            }
        });
    }

    if (btnRegStepContinue && regStepPersonal && regStepId) {
        btnRegStepContinue.addEventListener('click', async function () {
            if (!validatePersonalInfoFieldsOnly()) {
                return;
            }

            const normalizedEmail = emailInput.value.trim().toLowerCase();
            clearError(emailInput);
            btnRegStepContinue.disabled = true;

            try {
                const isEmailAvailable = await checkEmailAvailability(normalizedEmail);
                if (!isEmailAvailable) {
                    showError(emailInput, 'Email address is already registered');
                    await Swal.fire({
                        icon: 'error',
                        title: 'Email already used',
                        text: 'This email is already registered. Please use a different email address.',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#dc3545'
                    });
                    return;
                }
            } catch (error) {
                await Swal.fire({
                    icon: 'error',
                    title: 'Email check failed',
                    text: (error && error.message) ? error.message : 'Unable to validate email right now. Please try again.',
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545'
                });
                return;
            } finally {
                btnRegStepContinue.disabled = false;
            }

            regStepPersonal.hidden = true;
            regStepId.hidden = false;
            setRegistrationProgress('id');
            if (pageTitle) pageTitle.textContent = 'Verify your ID';
            regStepId.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function setRegistrationProgress(phase) {
        if (!step1) return;
        [step1, step3, step4].forEach(function (el) {
            if (el) el.classList.remove('active');
        });
        if (phase === 'personal') {
            step1.classList.add('active');
        } else if (phase === 'id') {
            step1.classList.add('active');
            if (step3) step3.classList.add('active');
        } else if (phase === 'account') {
            step1.classList.add('active');
            if (step3) step3.classList.add('active');
            if (step4) step4.classList.add('active');
        }
    }

    /** Personal + address only (step 1) — used by Continue and full form validation */
    function validatePersonalInfoFieldsOnly() {
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

        let isValid = true;

        if (!validateRequired(firstNameInput.value)) {
            showError(firstNameInput, 'First name is required');
            isValid = false;
        } else if (!validateName(firstNameInput.value)) {
            showError(firstNameInput, 'Please enter a valid first name');
            isValid = false;
        }

        if (!middleNameInput.disabled && middleNameInput.value.trim()) {
            if (!validateName(middleNameInput.value)) {
                showError(middleNameInput, 'Please enter a valid middle name');
                isValid = false;
            }
        }

        if (!validateRequired(lastNameInput.value)) {
            showError(lastNameInput, 'Last name is required');
            isValid = false;
        } else if (!validateName(lastNameInput.value)) {
            showError(lastNameInput, 'Please enter a valid last name');
            isValid = false;
        }

        if (!validateRequired(emailInput.value)) {
            showError(emailInput, 'Email address is required');
            isValid = false;
        } else if (!validateEmail(emailInput.value)) {
            showError(emailInput, 'Please enter a valid email address');
            isValid = false;
        }

        if (!validateRequired(contactNumberInput.value)) {
            showError(contactNumberInput, 'Contact number is required');
            isValid = false;
        } else if (!validateContactNumber(contactNumberInput.value)) {
            showError(contactNumberInput, 'Please enter a valid 11-digit contact number');
            isValid = false;
        }

        if (!validateRequired(ageInput.value)) {
            showError(ageInput, 'Please enter your birth date to calculate age');
            isValid = false;
        } else if (!validateAge(ageInput.value)) {
            showError(ageInput, 'You must be at least 15 years old');
            isValid = false;
        }

        if (!validateRequired(sexSelect.value)) {
            showError(sexSelect, 'Please select your sex');
            isValid = false;
        }

        if (!validateRequired(birthdayInput.value)) {
            showError(birthdayInput, 'Birthday is required');
            isValid = false;
        } else if (!validateBirthday(birthdayInput.value)) {
            showError(birthdayInput, 'Please enter a valid birthday (must be 15+ years old)');
            isValid = false;
        }

        if (!validateRequired(statusSelect.value)) {
            showError(statusSelect, 'Please select your civil status');
            isValid = false;
        }

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

        return isValid;
    }

    function isUploadedIdFullyValid() {
        if (!validateRequired(validIdSelect.value)) return false;
        if (!validateIDImage(idImageInput.files[0])) return false;
        if (!idOcrValidation.ok) return false;
        if (!idOcrValidation.hasBigte) return false;
        const expectedKeyForm = mapValidIdLabelToExpectedType(validIdSelect.value);
        if (expectedKeyForm && idImageInput.files && idImageInput.files[0]) {
            const fid = accountFileIdentifier(idImageInput.files[0]);
            if (
                idTypeValidationAccount.validatedFile === fid &&
                !idTypeValidationAccount.skippedNoApiMapping &&
                !idTypeValidationAccount.idTypeMatch
            ) {
                return false;
            }
        }
        return true;
    }

    function tryShowRegistrationAccountStep() {
        if (!regStepAccount || !regStepId) return;
        if (regStepId.hasAttribute('hidden')) return;
        if (isUploadedIdFullyValid()) {
            regStepAccount.hidden = false;
            regStepAccount.setAttribute('aria-hidden', 'false');
            setRegistrationProgress('account');
            if (pageTitle) pageTitle.textContent = 'Create your account';
            regStepAccount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            regStepAccount.hidden = true;
            regStepAccount.setAttribute('aria-hidden', 'true');
            if (pageTitle) pageTitle.textContent = 'Verify your ID';
            setRegistrationProgress('id');
        }
    }

    function hideRegistrationAccountStep() {
        if (regStepAccount) {
            regStepAccount.hidden = true;
            regStepAccount.setAttribute('aria-hidden', 'true');
        }
        if (pageTitle) {
            if (regStepId && !regStepId.hasAttribute('hidden')) {
                pageTitle.textContent = 'Verify your ID';
            } else {
                pageTitle.textContent = "Let's Get Started!";
            }
        }
        if (regStepId && !regStepId.hasAttribute('hidden')) {
            setRegistrationProgress('id');
        } else {
            setRegistrationProgress('personal');
        }
    }

    // Validate personal info form
    function validatePersonalInfoForm() {
        if (!validatePersonalInfoFieldsOnly()) {
            return false;
        }

        clearError(validIdSelect);
        clearError(idImageInput);

        let isValid = true;

        // Valid ID validation
        if (!validateRequired(validIdSelect.value)) {
            showError(validIdSelect, 'Please select a type of valid ID');
            isValid = false;
        }

        // ID Image validation
        if (!validateIDImage(idImageInput.files[0])) {
            showError(idImageInput, 'Please upload a valid ID image (JPG, PNG under 10MB)');
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

        const expectedKeyForm = mapValidIdLabelToExpectedType(validIdSelect.value);
        if (expectedKeyForm && idImageInput.files && idImageInput.files[0]) {
            const fid = accountFileIdentifier(idImageInput.files[0]);
            if (
                idTypeValidationAccount.validatedFile === fid &&
                !idTypeValidationAccount.skippedNoApiMapping &&
                !idTypeValidationAccount.idTypeMatch
            ) {
                isValid = false;
                showError(
                    idImageInput,
                    idTypeValidationAccount.errorMessage || getIDTypeMismatchError()
                );
            }
        }

        return isValid;
    }

    // Form submission
    personalInfoForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (regStepAccount && regStepAccount.hasAttribute('hidden')) {
            if (regStepPersonal && !regStepPersonal.hasAttribute('hidden')) {
                Swal.fire({
                    icon: 'info',
                    title: 'Continue',
                    text: 'Please tap Continue to go to ID verification.',
                    confirmButtonColor: '#2563eb'
                });
            } else {
                Swal.fire({
                    icon: 'info',
                    title: 'Verify your ID',
                    text: 'Upload a valid ID that shows Barangay Bigte. The Create account section appears when your ID is verified.',
                    confirmButtonColor: '#2563eb'
                });
            }
            return;
        }

        // Validate personal info form
        if (!validatePersonalInfoForm()) {
            return;
        }

        const expectedKeySubmit = mapValidIdLabelToExpectedType(validIdSelect.value);
        if (expectedKeySubmit && idImageInput.files && idImageInput.files[0] && previewImg && previewImg.src) {
            const currentFile = idImageInput.files[0];
            const fid = accountFileIdentifier(currentFile);
            if (idTypeValidationAccount.validatedFile !== fid) {
                const res = await validateIDAddressWithGemini(currentFile, {
                    expectedIdType: expectedKeySubmit,
                    imageBase64: previewImg.src && previewImg.src.indexOf('data:') === 0 ? previewImg.src : undefined
                });
                await applyIdTypeValidationFromGeminiResult(res, currentFile);
                if (!res.ok) {
                    idOcrValidation = { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
                } else {
                    idOcrValidation = {
                        ok: true,
                        hasBigte: res.hasBigte,
                        name: res.name,
                        fullText: res.fullText || ''
                    };
                }
            }
            if (
                !idTypeValidationAccount.skippedNoApiMapping &&
                idTypeValidationAccount.validatedFile === fid &&
                !idTypeValidationAccount.idTypeMatch
            ) {
                const msg = idTypeValidationAccount.errorMessage || getIDTypeMismatchError();
                await Swal.fire({
                    icon: 'error',
                    title: 'ID Type Mismatch',
                    text: msg,
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
                return;
            }
        }

        tryShowRegistrationAccountStep();
        if (!isUploadedIdFullyValid()) {
            await Swal.fire({
                icon: 'error',
                title: 'ID verification',
                text: 'Your ID must show Barangay Bigte and match the selected ID type before you can continue.',
                confirmButtonColor: '#dc3545'
            });
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
        .then(async response => {
            // Get response text first
            const responseText = await response.text();
            
            // Log the raw response for debugging
            console.log('Server response status:', response.status);
            console.log('Server response text:', responseText.substring(0, 500));
            
            // Try to parse as JSON (PHP should always return JSON)
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                // If not valid JSON, show the raw response
                console.error('Failed to parse JSON response:', responseText);
                throw new Error(`Server returned invalid response (${response.status}): ${responseText.substring(0, 200) || 'Empty response'}`);
            }
            
            // If response is not OK, handle error
            if (!response.ok || !data.success) {
                // Build detailed error message
                let errorMessage = data.message || `Server error (${response.status})`;
                if (data.error_details && String(data.error_details).trim()) {
                    errorMessage += '<br><br><small style="opacity:0.9">' + String(data.error_details).replace(/</g, '&lt;') + '</small>';
                }
                if (data.error_code === 'email_delivery_failed' && data.otp_code) {
                    console.info('Registration: OTP could not be emailed. OTP for testing (check server policy):', data.otp_code);
                }
                
                // Add debug information if available
                if (data.debug) {
                    console.error('Server debug info:', data.debug);
                    errorMessage += '\n\nDebug Info:';
                    if (data.missing_fields) {
                        errorMessage += `\nMissing fields: ${data.missing_fields.join(', ')}`;
                    }
                    if (data.received_fields) {
                        errorMessage += `\nReceived fields: ${data.received_fields.join(', ')}`;
                    }
                    if (data.debug.files_keys) {
                        errorMessage += `\nFiles keys: ${data.debug.files_keys.join(', ')}`;
                    }
                }
                
                // Show error alert
                await Swal.fire({
                    icon: 'error',
                    title: 'Registration Failed',
                    html: errorMessage.replace(/\n/g, '<br>'),
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#dc3545',
                    width: '600px'
                });
                
                return; // Stop execution
            }
            
            // Success - store user data for next step
            localStorage.setItem('registrationEmail', data.email);
            
            // If OTP code is provided (for testing), show it
            if (data.otp_code) {
                console.log('OTP Code for testing:', data.otp_code);
            }
            
            // Redirect to email verification page
            window.location.href = 'email_verification.html';
        })
        .catch(async error => {
            console.error('Registration error:', error);
            let errorMessage = 'An error occurred during registration. Please try again.';
            let errorTitle = 'Registration Error';
            
            // Detect fetch/network errors
            if (error.message && (
                error.message.includes('Failed to fetch') || 
                error.message.includes('NetworkError') ||
                error.message.includes('Network request failed') ||
                error.name === 'TypeError' ||
                error.name === 'AbortError'
            )) {
                errorMessage = 'Check your internet connection and Try again';
                errorTitle = 'Connection Error';
            } else if (error.message) {
                // For other errors, show the original message
                errorMessage = error.message;
            }
            
            await Swal.fire({
                icon: 'error',
                title: errorTitle,
                text: errorMessage,
                confirmButtonText: 'OK',
                confirmButtonColor: '#dc3545',
                width: '500px'
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
            window.location.href = 'index.php';
        }
    };

    window.goToLogin = function() {
        window.location.href = 'index.php';
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

    setRegistrationProgress('personal');
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
