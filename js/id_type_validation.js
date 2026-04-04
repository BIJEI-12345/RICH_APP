/**
 * Shared ID type verification (same as document request certification).
 * POST php/google_gemini_id_type_verify.php; Tesseract fallback.
 */
(function (global) {
    'use strict';

    function imageElementToBase64(imgElement) {
        return new Promise(function (resolve, reject) {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            canvas.width = imgElement.naturalWidth || imgElement.width;
            canvas.height = imgElement.naturalHeight || imgElement.height;
            ctx.drawImage(imgElement, 0, 0);
            try {
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            } catch (error) {
                reject(error);
            }
        });
    }

    function ensureTesseractLoaded() {
        return new Promise(function (resolve, reject) {
            if (global.Tesseract && global.Tesseract.recognize) return resolve();
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/tesseract.js@4.0.2/dist/tesseract.min.js';
            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error('Failed to load Tesseract.js')); };
            document.head.appendChild(script);
        });
    }

    async function ocrWithTesseractForIdType(fileOrBase64) {
        try {
            await ensureTesseractLoaded();
            var imageSource;
            if (fileOrBase64 instanceof File) {
                imageSource = fileOrBase64;
            } else if (typeof fileOrBase64 === 'string') {
                var img = new Image();
                await new Promise(function (resolve, reject) {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = fileOrBase64;
                });
                imageSource = img;
            } else {
                imageSource = fileOrBase64;
            }
            var result = await global.Tesseract.recognize(imageSource, 'eng');
            var data = result.data;
            var text = (data && data.text) ? data.text : '';
            var hay = text.toLowerCase();
            var hasBigte = hay.includes('bigte') || /\b[8b]igte\b/i.test(text.replace(/\s+/g, ' '));
            var name = { first: '', middle: '', last: '' };
            var lines = text.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
            for (var i = 0; i < lines.length; i++) {
                var ln = lines[i];
                var low = ln.toLowerCase();
                if (low.includes('name') || low.includes('bearer') || low.includes('cardholder')) {
                    var parts = ln.replace(/name[:\-\s]*/i, '').trim().split(/\s+/);
                    if (parts.length >= 2) {
                        name.first = parts[0];
                        name.last = parts[parts.length - 1];
                        if (parts.length >= 3) name.middle = parts.slice(1, parts.length - 1).join(' ');
                        break;
                    }
                }
            }
            return { ok: true, hasBigte: hasBigte, name: name, fullText: text };
        } catch (e) {
            console.warn('Fallback OCR failed:', e);
            return { ok: false, hasBigte: false, name: { first: '', middle: '', last: '' }, fullText: '' };
        }
    }

    function performIDTypeMatching(fullText, expectedIdType) {
        var lowerText = fullText.toLowerCase();
        var detectedIdType = 'unknown';
        var idTypeMatch = false;

        var idTypeMap = {
            'driver-license': {
                name: "Driver's License",
                keywords: ['driver', 'license', 'drivers license', 'driving license', 'lto', 'land transportation office']
            },
            'passport': {
                name: 'Passport',
                keywords: ['passport', 'department of foreign affairs', 'dfa']
            },
            'sss-id': {
                name: 'SSS ID',
                keywords: ['sss', 'social security', 'social security system']
            },
            'philhealth-id': {
                name: 'PhilHealth ID',
                keywords: ['philhealth', 'phil health', 'national health insurance']
            },
            'postal-id': {
                name: 'Postal ID',
                keywords: ['postal', 'philpost', 'philippine postal']
            },
            'voter-id': {
                name: "Voter's ID",
                keywords: ['voter', 'voters', 'comelec', 'commission on elections']
            },
            'senior-citizen-id': {
                name: 'Senior Citizen ID',
                keywords: ['senior citizen', 'oscad']
            },
            'pwd-id': {
                name: 'PWD ID',
                keywords: ['pwd', 'person with disability']
            },
            'barangay-id': {
                name: 'Barangay ID',
                keywords: ['barangay']
            },
            'company-id': {
                name: 'Company ID',
                keywords: ['company', 'employee', 'staff']
            }
        };

        if (/\bpassport\b/i.test(fullText) || /\bdfa\b/i.test(fullText)) {
            detectedIdType = 'passport';
        } else if (/\bdriver\b/i.test(fullText) && /\blicense\b/i.test(fullText)) {
            detectedIdType = 'driver-license';
        } else if (/\bsss\b/i.test(fullText)) {
            detectedIdType = 'sss-id';
        } else if (/\bphilhealth\b/i.test(fullText)) {
            detectedIdType = 'philhealth-id';
        } else if (/\bpostal\b/i.test(fullText)) {
            detectedIdType = 'postal-id';
        } else if (/\bvoter\b/i.test(fullText) || /\bcomelec\b/i.test(fullText)) {
            detectedIdType = 'voter-id';
        } else if (/\bsenior citizen\b/i.test(fullText)) {
            detectedIdType = 'senior-citizen-id';
        } else if (/\bpwd\b/i.test(fullText)) {
            detectedIdType = 'pwd-id';
        } else if (/\bbarangay\b/i.test(fullText)) {
            detectedIdType = 'barangay-id';
        } else if (/\bcompany\b/i.test(fullText) || /\bemployee\b/i.test(fullText)) {
            detectedIdType = 'company-id';
        }

        if (detectedIdType === expectedIdType) {
            idTypeMatch = true;
        } else if (idTypeMap[expectedIdType]) {
            var keywords = idTypeMap[expectedIdType].keywords;
            for (var k = 0; k < keywords.length; k++) {
                if (lowerText.includes(keywords[k].toLowerCase())) {
                    idTypeMatch = true;
                    break;
                }
            }
        }

        return { idTypeMatch: idTypeMatch, detectedIdType: detectedIdType };
    }

    async function fallbackToTesseractForIDType(imageElement, expectedIdType) {
        try {
            var tesseractResult = await ocrWithTesseractForIdType(imageElement);
            if (tesseractResult.ok && tesseractResult.fullText) {
                var idTypeMatchResult = performIDTypeMatching(tesseractResult.fullText, expectedIdType);
                var idTypeMap = {
                    'driver-license': { name: "Driver's License" },
                    'passport': { name: 'Passport' },
                    'sss-id': { name: 'SSS ID' },
                    'philhealth-id': { name: 'PhilHealth ID' },
                    'postal-id': { name: 'Postal ID' },
                    'voter-id': { name: "Voter's ID" },
                    'senior-citizen-id': { name: 'Senior Citizen ID' },
                    'pwd-id': { name: 'PWD ID' },
                    'barangay-id': { name: 'Barangay ID' },
                    'company-id': { name: 'Company ID' }
                };
                var expectedName = idTypeMap[expectedIdType] ? idTypeMap[expectedIdType].name : expectedIdType;
                return {
                    ok: true,
                    idTypeMatch: idTypeMatchResult.idTypeMatch,
                    detectedIdType: idTypeMatchResult.detectedIdType,
                    expectedIdType: expectedIdType,
                    expectedName: expectedName,
                    fullText: tesseractResult.fullText,
                    confidence: 'medium',
                    usingFallback: true
                };
            }
            return { ok: false, idTypeMatch: false, message: '' };
        } catch (e) {
            return { ok: false, idTypeMatch: false, message: '' };
        }
    }

    async function validateIDTypeWithGoogleGemini(imageElement, expectedIdType) {
        var base64Image = await imageElementToBase64(imageElement);
        try {
            var response = await fetch('php/google_gemini_id_type_verify.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: base64Image,
                    expected_id_type: expectedIdType
                })
            });
            var text = await response.text();
            var data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                return await fallbackToTesseractForIDType(imageElement, expectedIdType);
            }
            if (!data.success || !data.ok) {
                return await fallbackToTesseractForIDType(imageElement, expectedIdType);
            }
            return {
                ok: true,
                idTypeMatch: data.idTypeMatch,
                detectedIdType: data.detectedIdType,
                expectedIdType: data.expectedIdType,
                expectedName: data.expectedName,
                fullText: data.fullText || '',
                confidence: data.confidence || 'low'
            };
        } catch (error) {
            return await fallbackToTesseractForIDType(imageElement, expectedIdType);
        }
    }

    function getIDTypeMismatchError() {
        return 'The uploaded image is invalid. Please upload a valid ID and select correct ID type.';
    }

    global.RichAppIdType = {
        imageElementToBase64: imageElementToBase64,
        validateIDTypeWithGoogleGemini: validateIDTypeWithGoogleGemini,
        getIDTypeMismatchError: getIDTypeMismatchError
    };
})(typeof window !== 'undefined' ? window : this);
