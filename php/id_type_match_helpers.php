<?php
/**
 * ID types use display strings as keys (same as HTML option value / document request).
 *
 * @return array{detectedIdType: string, confidence: string, idTypeMatch: bool, matchReason: string, expectedName: string}
 */
function compute_id_type_match_from_fulltext(string $fullText, string $expectedIdType): array
{
    $idTypeMap = [
        'National ID' => [
            'name' => 'National ID',
            'keywords' => [
                'philsys', 'philid', 'phil id', 'national id', 'pambansang', 'pagkakakilanlan',
                'philippine identification', 'identification card', 'psn', 'philippine identification card'
            ]
        ],
        "Driver's License" => [
            'name' => "Driver's License",
            'keywords' => [
                'driver', 'license', 'drivers license', 'driving license', 'lto',
                'land transportation office', 'non-professional', 'professional', 'student permit'
            ]
        ],
        'Passport' => [
            'name' => 'Passport',
            'keywords' => ['passport', 'republic of the philippines', 'department of foreign affairs', 'dfa', 'passport no']
        ],
        'SSS ID' => [
            'name' => 'SSS ID',
            'keywords' => ['sss', 'social security', 'social security system', 'sss id', 'sss number', 'sss no']
        ],
        'Umid ID' => [
            'name' => 'Umid ID',
            'keywords' => ['umid', 'unified multipurpose', 'unified multi-purpose', 'umid card']
        ],
        'GSIS ID' => [
            'name' => 'GSIS ID',
            'keywords' => ['gsis', 'government service insurance', 'government service insurance system']
        ],
        'TIN ID' => [
            'name' => 'TIN ID',
            'keywords' => ['tin', 'bureau of internal revenue', 'bir', 'tax identification']
        ],
        'Barangay ID' => [
            'name' => 'Barangay ID',
            'keywords' => [
                'barangay', 'barangay id', 'barangay clearance', 'barangay certificate', 'barangay identification', 'brgy'
            ]
        ],
        'PhilHealth ID' => [
            'name' => 'PhilHealth ID',
            'keywords' => ['philhealth', 'phil health', 'philhealth id', 'national health insurance', 'nhip']
        ],
        'Postal ID' => [
            'name' => 'Postal ID',
            'keywords' => ['postal', 'postal id', 'philpost', 'philippine postal', 'postal identification']
        ],
        'Senior Citizen ID' => [
            'name' => 'Senior Citizen ID',
            'keywords' => ['senior citizen', 'senior', 'sc id', 'senior citizen id', 'oscad']
        ],
    ];

    $expectedName = isset($idTypeMap[$expectedIdType]) ? $idTypeMap[$expectedIdType]['name'] : $expectedIdType;
    $expectedKeywords = isset($idTypeMap[$expectedIdType]) ? $idTypeMap[$expectedIdType]['keywords'] : [];

    $detectedIdType = 'unknown';
    $confidence = 'low';
    $lowerText = strtolower($fullText);

    if (preg_match('/\bpassport\b/i', $fullText) || preg_match('/\bdepartment of foreign affairs\b/i', $fullText) || preg_match('/\bdfa\b/i', $fullText)) {
        $detectedIdType = 'Passport';
        $confidence = 'high';
    } elseif ((preg_match('/\bdriver\b/i', $fullText) || preg_match('/\blto\b/i', $fullText)) && preg_match('/\blicense\b/i', $fullText)) {
        $detectedIdType = "Driver's License";
        $confidence = 'high';
    } elseif (
        preg_match('/\bphilsys\b/i', $fullText) ||
        preg_match('/\bphil\s*id\b/i', $fullText) ||
        preg_match('/pambansang\s+pagkakakilanlan/i', $fullText) ||
        preg_match('/philippine\s+identification/i', $fullText) ||
        (preg_match('/\bnational\s+id\b/i', $fullText) && preg_match('/philippine|phil/i', $fullText))
    ) {
        $detectedIdType = 'National ID';
        $confidence = 'high';
    } elseif (preg_match('/\bumid\b/i', $fullText) || preg_match('/unified\s+multipurpose/i', $fullText)) {
        $detectedIdType = 'Umid ID';
        $confidence = 'high';
    } elseif (preg_match('/\bgsis\b/i', $fullText) || preg_match('/government\s+service\s+insurance/i', $fullText)) {
        $detectedIdType = 'GSIS ID';
        $confidence = 'high';
    } elseif (preg_match('/\btin\b/i', $fullText) && (preg_match('/\bbir\b/i', $fullText) || preg_match('/bureau\s+of\s+internal\s+revenue/i', $fullText) || preg_match('/tax\s+identification/i', $fullText))) {
        $detectedIdType = 'TIN ID';
        $confidence = 'medium';
    } elseif (preg_match('/\bphilhealth\b/i', $fullText) || preg_match('/\bphil health\b/i', $fullText) || preg_match('/\bnational health insurance\b/i', $fullText)) {
        $detectedIdType = 'PhilHealth ID';
        $confidence = 'high';
    } elseif (preg_match('/\bpostal\b/i', $fullText) || preg_match('/\bphilpost\b/i', $fullText)) {
        $detectedIdType = 'Postal ID';
        $confidence = 'medium';
    } elseif (preg_match('/\bsenior citizen\b/i', $fullText) || preg_match('/\boscad\b/i', $fullText)) {
        $detectedIdType = 'Senior Citizen ID';
        $confidence = 'high';
    } elseif (preg_match('/\bbarangay\b/i', $fullText) || preg_match('/\bbrgy\.?\b/i', $fullText)) {
        $detectedIdType = 'Barangay ID';
        $confidence = 'medium';
    } elseif (preg_match('/\bsss\b/i', $fullText) || preg_match('/\bsocial security\b/i', $fullText)) {
        $detectedIdType = 'SSS ID';
        $confidence = 'high';
    }

    $idTypeMatch = false;
    $matchReason = '';

    if ($expectedIdType && $expectedIdType !== 'other' && $fullText !== '') {
        if (!empty($expectedName)) {
            $nameVariations = [
                $expectedName,
                str_replace("'s", "s", $expectedName),
                str_replace("'s", "", $expectedName),
                str_replace("'", "", $expectedName),
            ];
            $nameVariations = array_unique(array_filter($nameVariations));

            foreach ($nameVariations as $variation) {
                $escapedVariation = preg_quote($variation, '/');
                if (preg_match('/\b' . $escapedVariation . '\b/i', $fullText)) {
                    $idTypeMatch = true;
                    $matchReason = 'display_name_match_' . str_replace([' ', "'"], ['_', ''], strtolower($variation));
                    break;
                }
                if (stripos($fullText, $variation) !== false) {
                    $idTypeMatch = true;
                    $matchReason = 'display_name_partial_match_' . str_replace([' ', "'"], ['_', ''], strtolower($variation));
                    break;
                }
            }
        }

        if (!$idTypeMatch && $detectedIdType !== 'unknown' && $detectedIdType === $expectedIdType) {
            $idTypeMatch = true;
            $matchReason = 'exact_type_match';
        }

        if (!$idTypeMatch && !empty($expectedKeywords)) {
            foreach ($expectedKeywords as $keyword) {
                $lowerKeyword = strtolower($keyword);
                $escapedKeyword = preg_quote($lowerKeyword, '/');
                if (preg_match('/\b' . $escapedKeyword . '\b/i', $fullText)) {
                    $idTypeMatch = true;
                    $matchReason = 'keyword_match_' . str_replace(' ', '_', $keyword);
                    break;
                }
                if (strpos($lowerText, $lowerKeyword) !== false) {
                    $idTypeMatch = true;
                    $matchReason = 'keyword_match_' . str_replace(' ', '_', $keyword);
                    break;
                }
            }
        }

        if ($expectedIdType === "Driver's License" && !$idTypeMatch) {
            $hasDriver = preg_match('/\bdriver\b/i', $fullText) || preg_match('/\blto\b/i', $fullText);
            $hasLicense = preg_match('/\blicense\b/i', $fullText);
            if ($hasDriver && $hasLicense) {
                $idTypeMatch = true;
                $matchReason = 'driver_license_words_found';
            }
        }

        if ($expectedIdType === 'Passport' && !$idTypeMatch && preg_match('/\bpassport\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'passport_word_found';
        }

        if ($expectedIdType === 'SSS ID' && !$idTypeMatch && preg_match('/\bsss\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'sss_word_found';
        }

        if ($expectedIdType === 'National ID' && !$idTypeMatch) {
            if (preg_match('/philsys|philid|pagkakakilanlan|pambansang|philippine\s+identification/i', $fullText)) {
                $idTypeMatch = true;
                $matchReason = 'national_id_keywords';
            }
        }

        if ($expectedIdType === 'Umid ID' && !$idTypeMatch && preg_match('/umid|unified\s+multipurpose/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'umid_keywords';
        }

        if ($expectedIdType === 'GSIS ID' && !$idTypeMatch && preg_match('/\bgsis\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'gsis_word_found';
        }

        if ($expectedIdType === 'TIN ID' && !$idTypeMatch && (preg_match('/\btin\b/i', $fullText) && preg_match('/\bbir\b/i', $fullText))) {
            $idTypeMatch = true;
            $matchReason = 'tin_bir_found';
        }

        if ($expectedIdType === 'PhilHealth ID' && !$idTypeMatch && preg_match('/\bphilhealth\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'philhealth_word_found';
        }

        if ($expectedIdType === 'Postal ID' && !$idTypeMatch && preg_match('/\bpostal\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'postal_word_found';
        }

        if ($expectedIdType === 'Senior Citizen ID' && !$idTypeMatch && preg_match('/senior citizen|oscad/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'senior_citizen_found';
        }

        if ($expectedIdType === 'Barangay ID' && !$idTypeMatch && preg_match('/\bbarangay\b/i', $fullText)) {
            $idTypeMatch = true;
            $matchReason = 'barangay_word_found';
        }
    }

    return [
        'detectedIdType' => $detectedIdType,
        'confidence' => $confidence,
        'idTypeMatch' => $idTypeMatch,
        'matchReason' => $matchReason,
        'expectedName' => $expectedName
    ];
}
