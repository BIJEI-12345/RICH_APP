// Transactions JavaScript

// Global variables
let allTransactions = [];
let filteredTransactions = [];
let currentFilter = 'all';
let statCardsInitialized = false;

/** Finished / resolved / completed items stay on this page for 15 days after completion, then drop from the list (UI only). */
const FINISHED_UI_RETENTION_DAYS = 15;

function transactionStatusIsFinishedForRetention(transaction) {
    if (!transaction || transaction.status == null) {
        return false;
    }
    const s = String(transaction.status).toLowerCase();
    return s === 'finished' || s === 'resolved' || s === 'completed';
}

/** Milliseconds at completion (best available field from API). */
function transactionFinishedAnchorDateMs(transaction) {
    if (!transaction) {
        return NaN;
    }
    const candidates = [
        transaction.completion_date,
        transaction.finish_at,
        transaction.resolved_at,
        transaction.resolved_datetime,
        transaction.processing_date,
        transaction.updated_at,
        transaction.created_at,
        transaction.request_date
    ];
    for (let i = 0; i < candidates.length; i++) {
        const raw = candidates[i];
        if (raw == null || raw === '') {
            continue;
        }
        const t = new Date(raw).getTime();
        if (!Number.isNaN(t)) {
            return t;
        }
    }
    return NaN;
}

/** True when this finished item is past the 15-day UI window (hidden from list). */
function transactionIsFinishedHiddenFromUi(transaction) {
    if (!transactionStatusIsFinishedForRetention(transaction)) {
        return false;
    }
    const anchor = transactionFinishedAnchorDateMs(transaction);
    if (Number.isNaN(anchor)) {
        return false;
    }
    const removeAfterMs = anchor + FINISHED_UI_RETENTION_DAYS * 86400000;
    return Date.now() >= removeAfterMs;
}

function transactionsVisibleInUi() {
    return allTransactions.filter(function (t) {
        return !transactionIsFinishedHiddenFromUi(t);
    });
}

/** Whole days remaining before removal (>=1); null if not finished or no date. */
function transactionDaysUntilUiRemoval(transaction) {
    if (!transactionStatusIsFinishedForRetention(transaction)) {
        return null;
    }
    const anchor = transactionFinishedAnchorDateMs(transaction);
    if (Number.isNaN(anchor)) {
        return null;
    }
    const removeAfterMs = anchor + FINISHED_UI_RETENTION_DAYS * 86400000;
    const msLeft = removeAfterMs - Date.now();
    if (msLeft <= 0) {
        return 0;
    }
    return Math.ceil(msLeft / 86400000);
}

function getFinishedRetentionHintHtml(transaction) {
    if (!transactionStatusIsFinishedForRetention(transaction) || transactionIsFinishedHiddenFromUi(transaction)) {
        return '';
    }
    const days = transactionDaysUntilUiRemoval(transaction);
    if (days == null || days < 1) {
        return '';
    }
    const dayWord = days === 1 ? 'day' : 'days';
    return (
        '<div class="transaction-retention-hint" role="status">' +
        'This entry will be removed from this list in <strong>' +
        days +
        '</strong> ' +
        dayWord +
        '.</div>'
    );
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initializePage();
});

// Initialize page functionality
function initializePage() {
    setupEventListeners();
    loadTransactions();
}

// Setup event listeners
function setupEventListeners() {
    // Filter tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');
            setActiveFilter(filter);
        });
    });

    // Search functionality
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            // Show/hide clear button based on input content
            if (this.value.length > 0) {
                clearSearchBtn.classList.add('show');
            } else {
                clearSearchBtn.classList.remove('show');
            }
            
            filterTransactions();
        });
        
        // Show clear button on focus if there's content
        searchInput.addEventListener('focus', function() {
            if (this.value.length > 0) {
                clearSearchBtn.classList.add('show');
            }
        });
    }

    // Stat cards click functionality
    setupStatCardListeners();
}

// Setup stat card listeners
function setupStatCardListeners() {
    // Only initialize once
    if (statCardsInitialized) {
        return;
    }
    
    // Add click listeners to stat cards
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', function() {
            // Get the filter type based on the card's icon class
            const icon = this.querySelector('.stat-icon');
            let targetFilter = '';
            
            if (icon.classList.contains('pending')) {
                targetFilter = 'new';
            } else if (icon.classList.contains('processing')) {
                targetFilter = 'processing';
            } else if (icon.classList.contains('completed')) {
                targetFilter = 'finished';
            } else if (icon.classList.contains('revoked')) {
                targetFilter = 'revoked';
            }
            
            // Debug logging
            console.log('=== STAT CARD CLICK DEBUG ===');
            console.log('Current filter:', currentFilter);
            console.log('Target filter:', targetFilter);
            console.log('All transactions count:', allTransactions.length);
            
            // Toggle functionality: if clicking the same filter, show all
            if (currentFilter === targetFilter) {
                console.log('Toggling to show all');
                setActiveFilter('all');
            } else {
                console.log('Setting filter to:', targetFilter);
                setActiveFilter(targetFilter);
            }
        });
    });
    
    statCardsInitialized = true;
}

// Set active filter
function setActiveFilter(filter) {
    currentFilter = filter;
    
    // Update active tab (if filter tabs exist)
    const filterTabs = document.querySelectorAll('.filter-tab');
    if (filterTabs.length > 0) {
        filterTabs.forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-filter="${filter}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
    }
    
    // Update stat card visual feedback
    updateStatCardSelection(filter);
    
    // Filter transactions
    filterTransactions();
}

// Update stat card visual feedback
function updateStatCardSelection(activeFilter) {
    const statCards = document.querySelectorAll('.stat-card');
    const showAllBtn = document.getElementById('show-all-btn');
    
    // Remove active class from all cards
    statCards.forEach(card => {
        card.classList.remove('active');
    });
    
    // Update show all button state
    if (showAllBtn) {
        if (activeFilter === 'all') {
            showAllBtn.classList.add('active');
        } else {
            showAllBtn.classList.remove('active');
        }
    }
    
    // Add active class to the clicked card
    if (activeFilter !== 'all') {
        statCards.forEach(card => {
            const icon = card.querySelector('.stat-icon');
            if (icon.classList.contains('pending') && activeFilter === 'new') {
                card.classList.add('active');
            } else if (icon.classList.contains('processing') && activeFilter === 'processing') {
                card.classList.add('active');
            } else if (icon.classList.contains('completed') && activeFilter === 'finished') {
                card.classList.add('active');
            } else if (icon.classList.contains('revoked') && activeFilter === 'revoked') {
                card.classList.add('active');
            }
        });
    }
}

// Reset filter to show all transactions
function resetFilter() {
    setActiveFilter('all');
}

// Clear search input
function clearSearch() {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    
    if (searchInput) {
        searchInput.value = '';
        clearSearchBtn.classList.remove('show');
        filterTransactions();
        searchInput.focus(); // Keep focus on input for better UX
    }
}

// Load transactions from server
async function loadTransactions() {
    showLoading();
    
    try {
        // Include user_email as a fallback for sessions that aren't set (e.g., direct page open)
        const storedEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || '';
        const url = storedEmail
            ? `php/transactions.php?action=list&user_email=${encodeURIComponent(storedEmail)}`
            : 'php/transactions.php?action=list';

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }
        
        const data = await response.json();
        
        if (data.success) {
            allTransactions = data.transactions || [];
            console.log('=== USER TRANSACTIONS DEBUG ===');
            console.log('User name from server:', data.user_name);
            console.log('Total transactions loaded:', allTransactions.length);
            console.log('All transactions:', allTransactions);
            console.log('ID types check:', allTransactions.map(t => ({
                id: t.id,
                idType: typeof t.id,
                type: t.document_type,
                status: t.status,
                request_type: t.request_type,
                notes: t.notes
            })));
            
            // Check if all transactions belong to this user
            const finishedTransactions = allTransactions.filter(t => 
                t.status === 'Finished' || 
                t.status === 'finished' || 
                t.status === 'FINISHED' ||
                t.status === 'Resolved' ||
                t.status === 'resolved' ||
                t.status === 'RESOLVED' ||
                t.status === 'Completed' ||
                t.status === 'completed' ||
                t.status === 'COMPLETED'
            );
            console.log('Finished transactions found:', finishedTransactions.length);
            console.log('Finished transaction details:', finishedTransactions);
            
            // Check specifically for Emergency reports
            const emergencyTransactions = allTransactions.filter(t => t.request_type === 'emergency');
            console.log('Emergency transactions found:', emergencyTransactions.length);
            console.log('Emergency transaction details:', emergencyTransactions);
            
            const finishedEmergencyTransactions = finishedTransactions.filter(t => t.request_type === 'emergency');
            console.log('Finished Emergency transactions found:', finishedEmergencyTransactions.length);
            console.log('Finished Emergency transaction details:', finishedEmergencyTransactions);
            
            // Check what status values Emergency reports actually have
            const emergencyStatuses = emergencyTransactions.map(t => t.status);
            console.log('Emergency report status values:', emergencyStatuses);
            console.log('Unique Emergency status values:', [...new Set(emergencyStatuses)]);
            updateStatistics();
            filterTransactions();
            
            // Setup stat card listeners after transactions are loaded
            setupStatCardListeners();
            
            // Show message if no transactions found
            if (allTransactions.length === 0) {
                showNoTransactions();
            }
        } else {
            console.error('Failed to load transactions:', data.message);
            showNoTransactions();
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        showNoTransactions();
    } finally {
        hideLoading();
    }
}

// Filter transactions based on current filter and search
function filterTransactions() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const pool = transactionsVisibleInUi();
    
    console.log('=== FILTER DEBUG ===');
    console.log('Search term:', searchTerm);
    console.log('Current filter:', currentFilter);
    console.log('All transactions (API):', allTransactions.length);
    console.log('Visible in UI (after ' + FINISHED_UI_RETENTION_DAYS + 'd retention):', pool.length);
    
    // Check finished transactions before filtering
    const finishedBeforeFilter = pool.filter(t => 
        t.status === 'Finished' || 
        t.status === 'finished' || 
        t.status === 'FINISHED' ||
        t.status === 'Resolved' ||
        t.status === 'resolved' ||
        t.status === 'RESOLVED' ||
        t.status === 'Completed' ||
        t.status === 'completed' ||
        t.status === 'COMPLETED'
    );
    console.log('Finished transactions before filtering:', finishedBeforeFilter.length);
    console.log('Finished transaction IDs before filtering:', finishedBeforeFilter.map(t => t.id));
    
    filteredTransactions = pool.filter(transaction => {
        // Filter by status - map statuses for display
        let displayStatus = transaction.status;
        if (transaction.status === 'New' || transaction.status === 'new' || transaction.status === 'NEW') {
            displayStatus = 'new';
        } else if (transaction.status === 'Processing' || transaction.status === 'processing' || transaction.status === 'PROCESSING') {
            displayStatus = 'processing';
        } else if (transaction.status === 'Finished' || 
                   transaction.status === 'finished' || 
                   transaction.status === 'FINISHED' ||
                   transaction.status === 'resolved' ||
                   transaction.status === 'RESOLVED' ||
                   transaction.status === 'Completed' ||
                   transaction.status === 'completed' ||
                   transaction.status === 'COMPLETED') {
            displayStatus = 'finished';
        } else if (transaction.status === 'Revoked' ||
                   transaction.status === 'revoked' ||
                   transaction.status === 'REVOKED' ||
                   transaction.status === 'Cancelled' ||
                   transaction.status === 'cancelled' ||
                   transaction.status === 'CANCELLED') {
            displayStatus = 'revoked';
        }
        
        const statusMatch = currentFilter === 'all' || displayStatus === currentFilter;
        
        // Filter by search term
        const searchMatch = !searchTerm || 
            transaction.document_type.toLowerCase().includes(searchTerm) ||
            transaction.status.toLowerCase().includes(searchTerm) ||
            (transaction.request_type && transaction.request_type.toLowerCase().includes(searchTerm));
        
        console.log(`Transaction ${transaction.id}: status=${transaction.status}, displayStatus=${displayStatus}, statusMatch=${statusMatch}, searchMatch=${searchMatch}, type=${transaction.document_type}`);
        
        // Special debug for Emergency reports
        if (transaction.request_type === 'emergency') {
            console.log(`EMERGENCY DEBUG - ID: ${transaction.id}, Status: ${transaction.status}, DisplayStatus: ${displayStatus}, StatusMatch: ${statusMatch}`);
        }
        
        return statusMatch && searchMatch;
    });
    
    console.log('Filtered transactions count:', filteredTransactions.length);
    displayTransactions();
}

// Display transactions
function displayTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    const noTransactionsDiv = document.getElementById('no-transactions');
    
    console.log('=== DISPLAY DEBUG ===');
    console.log('All transactions:', allTransactions.length);
    console.log('Filtered transactions:', filteredTransactions.length);
    console.log('Current filter:', currentFilter);
    console.log('Filtered transaction IDs:', filteredTransactions.map(t => t.id));
    
    // Always hide the no transactions message first
    if (noTransactionsDiv) {
        noTransactionsDiv.style.display = 'none';
    }
    
    // Show transactions list
    if (transactionsList) {
        transactionsList.style.display = 'block';
    }
    
    // Check specifically for finished transactions
    const finishedInFiltered = filteredTransactions.filter(t => 
        t.status === 'Finished' || 
        t.status === 'finished' || 
        t.status === 'FINISHED' ||
        t.status === 'Resolved' ||
        t.status === 'resolved' ||
        t.status === 'RESOLVED' ||
        t.status === 'Completed' ||
        t.status === 'completed' ||
        t.status === 'COMPLETED'
    );
    console.log('Finished transactions in filtered list:', finishedInFiltered.length);
    console.log('Finished transaction IDs being displayed:', finishedInFiltered.map(t => t.id));
    
    if (filteredTransactions.length === 0) {
        // Only show no transactions if there are actually no transactions at all
        if (allTransactions.length === 0) {
            showNoTransactions();
        } else {
            // Show a message for filtered results
            if (transactionsList) {
                transactionsList.innerHTML = `
                    <div class="no-transactions">
                        <div class="no-transactions-content">
                            <i class="fas fa-filter"></i>
                            <h3>No ${currentFilter === 'all' ? '' : currentFilter} transactions found</h3>
                            <p>Try adjusting your filter or search criteria.</p>
                        </div>
                    </div>
                `;
            }
        }
        return;
    }
    
    if (transactionsList) {
        transactionsList.innerHTML = filteredTransactions.map(transaction => 
            createTransactionCard(transaction)
        ).join('');
    }
}

/** 1–5 stars on list card for Community Concern when `rating` (or legacy resident_rating) is set. */
function getTransactionCardRatingHtml(transaction) {
    if (!transaction || transaction.request_type !== 'concern') {
        return '';
    }
    const v = transactionConcernRatingValue(transaction);
    if (v < 1) {
        return '';
    }
    var stars = '';
    for (var i = 1; i <= 5; i++) {
        stars += '<span class="transaction-card-star' + (i <= v ? ' is-on' : '') + '"><i class="fas fa-star" aria-hidden="true"></i></span>';
    }
    return '<div class="transaction-card-rating" title="Rating: ' + v + '/5" aria-label="Rating ' + v + ' out of 5 stars">' + stars + '</div>';
}

// Create transaction card HTML
function createTransactionCard(transaction) {
    // Map status for display purposes
    let displayStatus = transaction.status;
    let statusClass = transaction.status;
    let statusText = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
    
    // Map statuses for display based on actual database values
    if (transaction.status === 'New' || transaction.status === 'new' || transaction.status === 'NEW') {
        displayStatus = 'new';
        statusClass = 'new';
        statusText = 'NEW';
    } else if (transaction.status === 'Processing' || transaction.status === 'processing' || transaction.status === 'PROCESSING') {
        displayStatus = 'processing';
        statusClass = 'processing';
        statusText = 'PROCESSING';
     } else if (transaction.status === 'Finished' || transaction.status === 'finished' || transaction.status === 'FINISHED') {
         displayStatus = 'finished';
         statusClass = 'finished';
         statusText = 'FINISHED';
    } else if (transaction.status === 'Resolved' || transaction.status === 'resolved' || transaction.status === 'RESOLVED') {
        displayStatus = 'finished';
        statusClass = 'finished';
        statusText = 'FINISHED';
    } else if (transaction.status === 'Completed' || transaction.status === 'completed' || transaction.status === 'COMPLETED') {
        displayStatus = 'finished';
        statusClass = 'finished';
        statusText = 'FINISHED';
    } else if (transaction.status === 'Revoked' ||
               transaction.status === 'revoked' ||
               transaction.status === 'REVOKED' ||
               transaction.status === 'Cancelled' ||
               transaction.status === 'cancelled' ||
               transaction.status === 'CANCELLED') {
        displayStatus = 'revoked';
        statusClass = 'revoked';
        statusText = 'REVOKED';
    } else {
        // For other statuses, show as-is
        displayStatus = transaction.status.toLowerCase();
        statusClass = transaction.status.toLowerCase();
        statusText = transaction.status.toUpperCase();
    }
    
    // Get request type icon
    const requestTypeIcon = getRequestTypeIcon(transaction.request_type);

    const clearancePurpose = (transaction.notes != null ? String(transaction.notes) : '').trim();
    const showBarangayClaimingFee =
        transaction.request_type === 'barangay_id' && displayStatus === 'finished';
    const clearanceFinished =
        transaction.request_type === 'clearance' && displayStatus === 'finished';

    let claimingFeeText = null;
    if (showBarangayClaimingFee) {
        claimingFeeText = 'Pay ₱100 upon claiming';
    } else if (clearanceFinished) {
        if (clearancePurpose === 'barangay-clearance' || clearancePurpose === 'proof-of-residency') {
            claimingFeeText = 'Pay ₱100 upon claiming';
        } else if (clearancePurpose === 'business-clearance') {
            claimingFeeText = 'Prepare payment upon claiming';
        }
    }

    const claimingFeeHtml = claimingFeeText
        ? `<div class="transaction-claiming-fee" aria-label="Payment upon claiming">${claimingFeeText}</div>`
        : '';

    const cardRatingHtml = getTransactionCardRatingHtml(transaction);
    const retentionHintHtml = getFinishedRetentionHintHtml(transaction);

    const cardStatusBadge =
        displayStatus === 'revoked'
            ? `<i class="fas fa-ban status-badge-revoked-icon" aria-hidden="true"></i><span>${statusText}</span>`
            : statusText;
    
    return `
        <div class="transaction-card ${statusClass}">
            <div class="transaction-header">
                <div class="transaction-info">
                    <div class="request-type-icon">
                        <i class="${requestTypeIcon}"></i>
                    </div>
                    <div class="transaction-title">
                    <h3>${transaction.document_type}</h3>
                    </div>
                </div>
                <div class="status-badge ${statusClass}">${cardStatusBadge}</div>
            </div>
            
            <div class="transaction-details">
                <div class="transaction-details-top">
                    <div class="transaction-details-main">
                        <div class="detail-item">
                            <span class="detail-label">Submitted at:</span>
                            <span class="detail-value">${formatDateTime(transaction.request_date)}</span>
                        </div>
                    </div>
                    ${claimingFeeHtml}
                </div>
                ${retentionHintHtml}
            </div>
            
            <div class="transaction-footer">
                ${cardRatingHtml}
                <div class="transaction-actions">
                    ${createActionButtons(transaction)}
                </div>
            </div>
        </div>
    `;
}

// Get icon for request type
function getRequestTypeIcon(requestType) {
    const icons = {
        'concern': 'fas fa-exclamation-triangle',
        'emergency': 'fas fa-exclamation-circle',
        'indigency': 'fas fa-file-alt',
        'barangay_id': 'fas fa-id-card',
        'certification': 'fas fa-certificate',
        'coe': 'fas fa-briefcase',
        'clearance': 'fas fa-shield-alt'
    };
    return icons[requestType] || 'fas fa-file-alt';
}

// Get request type title for modal
function getRequestTypeTitle(requestType) {
    const titles = {
        'concern': 'Community Concern',
        'emergency': 'Emergency Report',
        'indigency': 'Indigency Certificate',
        'barangay_id': 'Barangay ID',
        'certification': 'Certification',
        'coe': 'Certificate of Employment',
        'clearance': 'Clearance'
    };
    return titles[requestType] || 'Document Request';
}

// Get request type description for modal
function getRequestTypeDescription(requestType) {
    const descriptions = {
        'concern': 'Community issue or concern reported',
        'emergency': 'Emergency situation reported',
        'indigency': 'Request for indigency certificate',
        'barangay_id': 'Request for barangay identification',
        'certification': 'Request for certification document',
        'coe': 'Request for certificate of employment',
        'clearance': 'Request for clearance document'
    };
    return descriptions[requestType] || 'Official document request';
}

// Create action buttons based on transaction status
function createActionButtons(transaction) {
    let buttons = '';
    
    // View details button (always available)
    buttons += '<button class="action-btn view" onclick="viewTransactionDetails(\'' + transaction.id + '\')">View Details</button>';
    
    // Download button (only for finished transactions with documents)
    if (transaction.status === 'Finished' && transaction.document_url) {
        buttons += '<button class="action-btn download" onclick="downloadDocument(\'' + transaction.id + '\')">Download</button>';
    }
    
    // Cancel button removed - no longer needed
    
    return buttons;
}

// View transaction details
function viewTransactionDetails(transactionId) {
    console.log('View Details clicked for ID:', transactionId, 'Type:', typeof transactionId);
    console.log('All transaction IDs:', allTransactions.map(t => ({id: t.id, type: typeof t.id, document_type: t.document_type})));
    
    // Try to find transaction with string comparison (IDs are now prefixed strings)
    const transaction = allTransactions.find(t => t.id === transactionId);
    console.log('Found transaction:', transaction);
    console.log('Transaction details:', {
        id: transaction?.id,
        document_type: transaction?.document_type,
        request_type: transaction?.request_type,
        status: transaction?.status,
        statement: transaction?.statement,
        emergency_type: transaction?.emergency_type,
        notes: transaction?.notes
    });
    if (!transaction) {
        console.log('Transaction not found!');
        console.log('Available IDs:', allTransactions.map(t => t.id));
        return;
    }
    
    const modal = document.getElementById('transaction-modal');
    const modalBody = document.getElementById('modal-body');
    
    // Map status for display
    let displayStatus = transaction.status;
    let statusText = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
    
    if (transaction.status === 'New') {
        displayStatus = 'new';
        statusText = 'NEW';
    } else if (transaction.status === 'Processing') {
        displayStatus = 'processing';
        statusText = 'PROCESSING';
    } else if (transaction.status === 'Finished') {
        displayStatus = 'finished';
        statusText = 'FINISHED';
    } else if (transaction.status === 'Resolved' || transaction.status === 'resolved' || transaction.status === 'RESOLVED') {
        displayStatus = 'finished';
        statusText = 'FINISHED';
    } else if (transaction.status === 'Revoked' ||
               transaction.status === 'revoked' ||
               transaction.status === 'REVOKED' ||
               transaction.status === 'Cancelled' ||
               transaction.status === 'cancelled' ||
               transaction.status === 'CANCELLED') {
        displayStatus = 'revoked';
        statusText = 'REVOKED';
    } else {
        // For other statuses, show as-is
        displayStatus = transaction.status.toLowerCase();
        statusText = transaction.status.toUpperCase();
    }
    
    // Get appropriate timeline based on request type
    const timeline = getTimelineForRequestType(transaction);
    
    // Generate personal information cards based on transaction data
    const personalInfoCards = generatePersonalInfoCards(transaction);
    const requestSpecificCards = generateRequestSpecificCards(transaction);

    const statusBadgeContent =
        displayStatus === 'revoked'
            ? `<i class="fas fa-ban status-badge-revoked-icon" aria-hidden="true"></i><span>${statusText}</span>`
            : statusText;
    
    modalBody.innerHTML = `
        <div class="transaction-detail">
            <div class="request-type-header">
                <div class="request-type-icon-large">
                    <i class="${getRequestTypeIcon(transaction.request_type)}"></i>
                </div>
                <div class="request-type-info">
                    <h3>${getRequestTypeTitle(transaction.request_type)}</h3>
                    <p class="request-type-subtitle">${getRequestTypeDescription(transaction.request_type)}</p>
                    <div class="status-badge-large ${displayStatus}">${statusBadgeContent}</div>
                </div>
            </div>
            
            <div class="detail-section">
                <div class="info-cards-grid">
                    ${personalInfoCards}
                </div>
            </div>
            
            ${requestSpecificCards ? `
            <div class="detail-section">
                <h4>Request Details</h4>
                <div class="info-cards-grid">
                    ${requestSpecificCards}
                </div>
            </div>
            ` : ''}
            
            <div class="detail-section">
                <div class="timeline">
                    ${timeline}
                </div>
            </div>
            
            ${getConcernResolvedImageSectionHtml(transaction)}
            
            ${getConcernRatingSectionHtml(transaction)}
            
            ${transaction.notes && transaction.request_type !== 'concern' ? `
            <div class="detail-section">
                <h4>Statement of Concern</h4>
                <div class="notes-content">
                    <p>${transaction.notes}</p>
                </div>
            </div>
            ` : ''}
            
        </div>
    `;
    
    console.log('Showing modal...');
    modal.style.display = 'block';
    console.log('Modal display set to block');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            autoSizeRevokeReasonTextareas(modalBody);
            initConcernRatingInModal(modalBody, transaction);
            loadConcernResolvedImageIntoModal(modalBody, transaction);
        });
    });
}

function transactionConcernIsFinished(transaction) {
    const s = (transaction && transaction.status) ? String(transaction.status).toLowerCase() : '';
    return s === 'finished' || s === 'resolved';
}

/** From list API: 1 kung may laman ang resolved_image sa DB; 0 kung wala. */
function transactionConcernHasResolvedImageInDb(transaction) {
    if (!transaction) {
        return false;
    }
    const v = transaction.has_resolved_image;
    if (v === true || v === 1 || v === '1') {
        return true;
    }
    if (v === false || v === 0 || v === '0') {
        return false;
    }
    return Number(v) === 1;
}

/** API uses lowercase 'concern'; tolerate any casing from merged data. */
function transactionRequestTypeIsConcern(transaction) {
    return !!(transaction && String(transaction.request_type || '').toLowerCase() === 'concern');
}

/** Build absolute or correct relative URL for img src (paths, data URLs, http). */
function resolveConcernResolvedImageSrc(raw) {
    if (raw == null) {
        return '';
    }
    const s = String(raw).trim();
    if (s === '') {
        return '';
    }
    if (/^(https?:\/\/|data:image\/)/i.test(s)) {
        return s;
    }
    try {
        return new URL(s, window.location.href).href;
    } catch (e) {
        return s;
    }
}

/**
 * Absolute URL for serve_concern_resolved_image (list payload omits BLOB).
 */
function buildServeConcernResolvedImageUrl(transaction) {
    const storedEmail = (sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || '').trim();
    const params = new URLSearchParams({
        action: 'serve_concern_resolved_image',
        concern_ref: String(transaction && transaction.id != null ? transaction.id : '')
    });
    if (storedEmail) {
        params.set('user_email', storedEmail);
    }
    const rel = 'php/transactions.php?' + params.toString();
    try {
        return new URL(rel, window.location.href).href;
    } catch (e) {
        return rel;
    }
}

/**
 * Load resolved photo: inline data/path/http, else <img src> to serve_concern_resolved_image (no fetch).
 */
function loadConcernResolvedImageIntoModal(modalRoot, transaction) {
    if (!modalRoot || !transactionRequestTypeIsConcern(transaction) || !transactionConcernIsFinished(transaction)) {
        return;
    }
    const section = modalRoot.querySelector('.concern-resolved-image-section');
    if (!section) {
        return;
    }
    const img = section.querySelector('.concern-resolved-image-img');
    const loadingEl = section.querySelector('.concern-resolved-image-loading');
    const frame = section.querySelector('.concern-resolved-image-frame');
    if (!img) {
        return;
    }

    function finishOk() {
        img.style.display = '';
        if (loadingEl) {
            loadingEl.remove();
        }
        if (frame) {
            frame.classList.remove('concern-resolved-image-frame--loading');
        }
    }

    function finishErr(message) {
        if (loadingEl) {
            loadingEl.textContent = message;
            loadingEl.classList.add('concern-resolved-image-error');
        }
        if (frame) {
            frame.classList.remove('concern-resolved-image-frame--loading');
        }
    }

    const raw = transaction.resolved_image;
    if (raw != null && String(raw).trim() !== '') {
        const direct = resolveConcernResolvedImageSrc(raw);
        if (direct) {
            img.onload = function () {
                img.onload = null;
                img.onerror = null;
                finishOk();
            };
            img.onerror = function () {
                img.onload = null;
                img.onerror = null;
                finishErr('Hindi maipakita ang larawan.');
            };
            img.src = direct;
            return;
        }
    }

    if (!transactionConcernHasResolvedImageInDb(transaction)) {
        if (loadingEl) {
            loadingEl.textContent =
                'Walang naka-upload na resolution photo mula sa barangay para sa request na ito.';
            loadingEl.classList.remove('concern-resolved-image-loading');
            loadingEl.classList.add('concern-resolved-image-empty');
        }
        if (frame) {
            frame.classList.remove('concern-resolved-image-frame--loading');
        }
        img.style.display = 'none';
        return;
    }

    const url = buildServeConcernResolvedImageUrl(transaction);
    if (!url || !String(transaction.id || '').trim()) {
        section.remove();
        return;
    }

    img.onload = function () {
        img.onload = null;
        img.onerror = null;
        finishOk();
    };
    img.onerror = function () {
        img.onload = null;
        img.onerror = null;
        finishErr(
            'Hindi ma-load ang larawan (server). Subukan i-refresh; kung tuloy pa rin, maaaring sira ang file sa database.'
        );
    };
    img.src = url;
}

/** Optional text block from API field `resolution_statement` (above the image). */
function getConcernResolutionStatementHtml(transaction) {
    if (!transaction || transaction.resolution_statement == null) {
        return '';
    }
    const raw = String(transaction.resolution_statement).trim();
    if (raw === '') {
        return '';
    }
    const body = escapeHtmlTransactions(raw).replace(/\n/g, '<br>');
    return (
        '<div class="concern-resolution-statement">' +
        '<p class="concern-resolution-statement-label">Pahayag ng resolusyon</p>' +
        '<div class="concern-resolution-statement-body">' +
        body +
        '</div></div>'
    );
}

/** Barangay photo after resolution — shown above “Your rating” (column `resolved_image`). */
function getConcernResolvedImageSectionHtml(transaction) {
    if (!transaction || !transactionRequestTypeIsConcern(transaction) || !transactionConcernIsFinished(transaction)) {
        return '';
    }
    const resolutionStatementHtml = getConcernResolutionStatementHtml(transaction);
    return `
            <div class="detail-section concern-resolved-image-section">
                <h4 class="concern-resolved-image-title">Resolved photo</h4>
                <p class="concern-resolved-image-note">Ito ang larawan ng resolusyon — dito nakabase ang iyong star rating.</p>
                ${resolutionStatementHtml}
                <div class="concern-resolved-image-frame concern-resolved-image-frame--loading">
                    <span class="concern-resolved-image-loading" aria-hidden="true">Nilo-load…</span>
                    <img src="" alt="Resolved concern photo" class="concern-resolved-image-img" style="display:none" decoding="async" />
                </div>
            </div>`;
}

/** DB `rating` INT: 0 = not rated; 1–5 = stars (left to right). Falls back to legacy resident_rating. */
function transactionConcernRatingValue(transaction) {
    if (!transaction) {
        return 0;
    }
    const raw = transaction.rating != null && String(transaction.rating).trim() !== ''
        ? transaction.rating
        : transaction.resident_rating;
    const n = parseInt(String(raw), 10);
    if (Number.isNaN(n) || n < 1) {
        return 0;
    }
    return Math.min(5, n);
}

function transactionConcernSuggestionsText(transaction) {
    if (!transaction || transaction.suggestions == null) {
        return '';
    }
    return String(transaction.suggestions).trim();
}

function concernRatingFeedbackFieldId(transaction) {
    const raw = String(transaction && transaction.id ? transaction.id : 'c').replace(/[^a-zA-Z0-9_-]/g, '');
    return 'concern-rating-feedback-' + raw;
}

function updateConcernRatingStarPreview(section, starCount) {
    const n = Math.min(5, Math.max(0, parseInt(String(starCount), 10) || 0));
    section.dataset.selectedRating = String(n);
    section.querySelectorAll('.concern-rating-star').forEach(function (btn) {
        const i = parseInt(btn.getAttribute('data-rating'), 10);
        btn.classList.toggle('is-on', i <= n && n >= 1);
    });
    const send = section.querySelector('.concern-rating-send-btn');
    if (send) {
        send.disabled = n < 1;
    }
}

function getConcernRatingSectionHtml(transaction) {
    if (!transaction || !transactionRequestTypeIsConcern(transaction) || !transactionConcernIsFinished(transaction)) {
        return '';
    }
    const value = transactionConcernRatingValue(transaction);
    const rated = value >= 1;
    const fid = concernRatingFeedbackFieldId(transaction);
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        const on = rated && i <= value;
        starsHtml += `<button type="button" class="concern-rating-star${on ? ' is-on' : ''}" data-rating="${i}" ${rated ? 'disabled' : ''} title="${i} of 5 stars"><i class="fas fa-star" aria-hidden="true"></i></button>`;
    }
    if (rated) {
        const sug = transactionConcernSuggestionsText(transaction);
        const feedbackBlock = sug
            ? `<div class="concern-rating-suggestions-readonly">
                    <p class="concern-rating-suggestions-label"><i class="fas fa-comment-dots" aria-hidden="true"></i> Feedback / suggestions</p>
                    <p class="concern-rating-suggestions-body">${escapeHtmlTransactions(sug)}</p>
                </div>`
            : '<p class="concern-rating-no-suggestion-note"><i class="fas fa-info-circle" aria-hidden="true"></i> Walang text na feedback — salamat pa rin sa iyong rating.</p>';
        return `
            <div class="detail-section concern-rating-section concern-rating-section--done">
                <div class="concern-rating-done-card">
                    <div class="concern-rating-title-row">
                        <h4>Your rating</h4>
                        <p class="concern-rating-subline">Your feedback will help our barangay improve.</p>
                    </div>
                    <div class="concern-rating-stars-row">
                        <div class="concern-rating-stars-bubble">
                            <div class="concern-rating-stars" role="group" aria-label="1 to 5 stars">
                                ${starsHtml}
                            </div>
                        </div>
                        <div class="concern-rating-status-chip">
                            <i class="fas fa-check-circle" aria-hidden="true"></i>
                            <span>Naipadala na ang rating: <strong>${value}/5</strong></span>
                        </div>
                    </div>
                    ${feedbackBlock}
                </div>
            </div>`;
    }
    return `
            <div class="detail-section concern-rating-section" data-selected-rating="0">
                <div class="concern-rating-title-row">
                    <h4>Your rating</h4>
                    <p class="concern-rating-subline">Your feedback will help our barangay improve.</p>
                </div>
                <div class="concern-rating-stars" role="group" aria-label="1 to 5 stars">
                    ${starsHtml}
                </div>
                <p class="concern-rating-hint">Pumili muna ng stars (1 = pinakamababa, 5 = pinakamahusay).</p>
                <label class="concern-rating-feedback-label" for="${fid}">Feedback o suggestions <span class="concern-rating-optional">(opsyonal)</span></label>
                <textarea id="${fid}" class="concern-rating-feedback" rows="3" maxlength="65000" placeholder="Pwede mong iwanang blangko at magpadala gamit lang ang stars."></textarea>
                <div class="concern-rating-actions">
                    <button type="button" class="concern-rating-send-btn" disabled>Ipadala</button>
                </div>
                <div class="concern-rating-loading" aria-hidden="true">
                    <span class="concern-rating-spinner" aria-hidden="true"></span>
                    <span class="concern-rating-loading-text">Nagse-save…</span>
                </div>
            </div>`;
}

function swalTransactionsAboveModal(opts) {
    if (typeof Swal === 'undefined') {
        return Promise.resolve({ isConfirmed: false });
    }
    return Swal.fire(Object.assign({
        customClass: { container: 'swal2-transactions-above-modal' }
    }, opts));
}

function initConcernRatingInModal(modalRoot, transaction) {
    if (!modalRoot || !transaction || !transactionRequestTypeIsConcern(transaction) || !transactionConcernIsFinished(transaction)) {
        return;
    }
    if (transactionConcernRatingValue(transaction) >= 1) {
        return;
    }
    const section = modalRoot.querySelector('.concern-rating-section');
    if (!section) {
        return;
    }
    const ta = section.querySelector('.concern-rating-feedback');
    const sendBtn = section.querySelector('.concern-rating-send-btn');
    section.querySelectorAll('.concern-rating-star').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const r = parseInt(btn.getAttribute('data-rating'), 10);
            if (r >= 1 && r <= 5) {
                updateConcernRatingStarPreview(section, r);
            }
        });
    });
    if (sendBtn) {
        sendBtn.addEventListener('click', function () {
            const r = parseInt(section.dataset.selectedRating || '0', 10);
            const suggestions = ta ? ta.value.trim() : '';
            if (r < 1 || r > 5) {
                swalTransactionsAboveModal({
                    icon: 'info',
                    title: 'Pumili ng stars',
                    text: 'Mag-tap muna ng 1 hanggang 5 stars bago magpadala.'
                });
                return;
            }
            submitConcernRating(transaction, r, suggestions, section);
        });
    }
}

async function submitConcernRating(transaction, rating, suggestions, sectionEl) {
    const userEmail = sessionStorage.getItem('user_email') || localStorage.getItem('user_email') || '';
    if (!userEmail) {
        await swalTransactionsAboveModal({ icon: 'warning', title: 'Kailangan mag-login', text: 'Mag-log in muna para maipadala ang rating.' });
        return;
    }
    if (suggestions === '') {
        const conf = await swalTransactionsAboveModal({
            icon: 'question',
            title: 'Walang feedback?',
            text: 'Magpapadala kang may stars lang, walang text na feedback o suggestions. Ituloy?',
            showCancelButton: true,
            confirmButtonText: 'Oo, ipadala',
            cancelButtonText: 'Bumalik'
        });
        if (!conf.isConfirmed) {
            return;
        }
    }
    sectionEl.classList.add('is-loading');
    try {
        const res = await fetch('php/transactions.php?action=rate_concern', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concern_id: transaction.id,
                rating: rating,
                suggestions: suggestions,
                user_email: userEmail
            })
        });
        const data = await res.json();
        if (data.success) {
            const newRating = data.rating != null ? data.rating : (data.resident_rating != null ? data.resident_rating : rating);
            const newSug = data.suggestions != null ? data.suggestions : suggestions;
            transaction.rating = newRating;
            transaction.resident_rating = newRating;
            transaction.suggestions = newSug;
            const match = allTransactions.find(function (t) { return t.id === transaction.id; });
            if (match) {
                match.rating = newRating;
                match.resident_rating = newRating;
                match.suggestions = newSug;
            }
            sectionEl.outerHTML = getConcernRatingSectionHtml(transaction);
            await swalTransactionsAboveModal({
                icon: 'success',
                title: 'Salamat!',
                text: data.message || 'Na-save ang iyong rating.',
                timer: 2400,
                showConfirmButton: false
            });
        } else {
            await swalTransactionsAboveModal({ icon: 'info', title: 'Hindi na-save', text: data.message || 'Subukan ulit.' });
        }
    } catch (e) {
        console.error(e);
        await swalTransactionsAboveModal({ icon: 'error', title: 'Error', text: 'May problema sa koneksyon.' });
    } finally {
        sectionEl.classList.remove('is-loading');
    }
}

/** Set textarea height to fit content (read-only revoke reason). */
function autoSizeRevokeReasonTextareas(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    var maxPx = Math.round(window.innerHeight * 0.55);
    root.querySelectorAll('textarea.transaction-revoke-reason-text').forEach(function (ta) {
        ta.style.minHeight = '0';
        ta.style.overflowY = 'hidden';
        ta.style.height = '0';
        var h = ta.scrollHeight;
        if (h > maxPx) {
            ta.style.height = maxPx + 'px';
            ta.style.overflowY = 'auto';
        } else {
            ta.style.height = Math.max(h, 48) + 'px';
        }
    });
}

function escapeHtmlTransactions(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeHtmlAttrTransactions(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

function transactionIsRevoked(transaction) {
    const s = transaction && transaction.status != null ? String(transaction.status).toLowerCase() : '';
    return s === 'revoked';
}

/** "concern" vs "documents" for revoke reason label (Community Concern vs certificates/forms). */
function getRevokeReasonSubjectWord(requestType) {
    return requestType === 'concern' ? 'concern' : 'documents';
}

/** Second timeline row when revoked: same layout as Submitted (large icon + card), read-only reason. */
function getRevokeReasonReadonlyBlock(transaction) {
    const raw = transaction.reason_revoke != null ? String(transaction.reason_revoke).trim() : '';
    const display = raw || 'Walang nailagay na dahilan.';
    const safe = escapeHtmlTransactions(display).replace(/<\/textarea/gi, '&lt;/textarea');
    const id = 'revoke-reason-' + String(transaction.id || 'tx').replace(/[^a-zA-Z0-9_-]/g, '');
    const rt = transaction.request_type;
    const revokedTitle =
        rt === 'concern'
            ? 'Report Revoked:'
            : rt === 'emergency'
              ? 'Emergency Revoked:'
              : 'Request Revoked:';
    const subjectWord = getRevokeReasonSubjectWord(rt);
    const reasonLabel = `Rason kung bakit narevoked/nareject ang ${subjectWord} mo:`;
    return `
            <div class="timeline-item timeline-item-revoked">
                <div class="timeline-icon">
                    <i class="fas fa-ban" aria-hidden="true"></i>
                </div>
                <div class="timeline-content timeline-content-revoked-reason">
                    <h5>${revokedTitle}</h5>
                    <p class="transaction-revoke-desc">${escapeHtmlTransactions(reasonLabel)}</p>
                    <label class="transaction-revoke-reason-sr-only" for="${id}">Dahilan ng revoke</label>
                    <textarea id="${id}" class="transaction-revoke-reason-text" readonly rows="1" spellcheck="false">${safe}</textarea>
                </div>
            </div>`;
}

function getRevokedTimelineHtml(transaction) {
    const rt = transaction.request_type;
    let submitTitle = 'Request Submitted';
    if (rt === 'concern') {
        submitTitle = 'Report Submitted';
    } else if (rt === 'emergency') {
        submitTitle = 'Emergency Reported';
    }
    return `
            <div class="timeline-item completed">
                <div class="timeline-icon">
                    <i class="fas fa-paper-plane"></i>
                </div>
                <div class="timeline-content">
                    <h5>${submitTitle}</h5>
                    <p>${formatDateTime(transaction.request_date)}</p>
                </div>
            </div>
            ${getRevokeReasonReadonlyBlock(transaction)}
        `;
}

// Get timeline based on request type
function getTimelineForRequestType(transaction) {
    const requestType = transaction.request_type;

    if (transactionIsRevoked(transaction)) {
        return getRevokedTimelineHtml(transaction);
    }

    if (requestType === 'concern') {
        // For concerns, show simplified timeline without redundant Under Review
        return `
            <div class="timeline-item ${transaction.status === 'New' ? 'active' : 'completed'}">
                <div class="timeline-icon">
                    <i class="fas fa-paper-plane"></i>
                </div>
                <div class="timeline-content">
                    <h5>Report Submitted</h5>
                    <p>${formatDateTime(transaction.request_date)}</p>
                </div>
            </div>
            
            <div class="timeline-item ${transaction.status === 'Finished' ? 'completed' : (transaction.processing_date ? 'active' : 'pending')}">
                <div class="timeline-icon">
                    <i class="fas fa-cog"></i>
                </div>
                <div class="timeline-content">
                    <h5>Processing</h5>
                    <p>${transaction.processing_date ? formatDateTime(transaction.processing_date) : 'Not started'}</p>
                </div>
            </div>
            
            <div class="timeline-item ${transaction.status === 'Finished' ? 'completed' : 'pending'}">
                <div class="timeline-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="timeline-content">
                    <h5>Finished</h5>
                    <p>${transaction.completion_date ? formatDateTime(transaction.completion_date) : 'Not resolved'}</p>
                </div>
            </div>
        `;
    } else if (requestType === 'emergency') {
        // For emergencies, skip Under Review step
        return `
            <div class="timeline-item ${transaction.status === 'New' ? 'active' : 'completed'}">
                <div class="timeline-icon">
                    <i class="fas fa-paper-plane"></i>
                </div>
                <div class="timeline-content">
                    <h5>Emergency Reported</h5>
                    <p>${formatDateTime(transaction.request_date)}</p>
                </div>
            </div>
            
            <div class="timeline-item ${transaction.status === 'Finished' ? 'completed' : 'pending'}">
                <div class="timeline-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="timeline-content">
                    <h5>Finished</h5>
                    <p>${transaction.completion_date ? formatDateTime(transaction.completion_date) : 'Not resolved'}</p>
                </div>
            </div>
        `;
    }
    // For document requests, use completed
    return `
            <div class="timeline-item ${transaction.status === 'New' ? 'active' : 'completed'}">
                <div class="timeline-icon">
                    <i class="fas fa-paper-plane"></i>
                </div>
                <div class="timeline-content">
                    <h5>Request Submitted</h5>
                    <p>${formatDateTime(transaction.request_date)}</p>
                </div>
            </div>
            
            <div class="timeline-item ${transaction.status === 'Processing' ? 'active' : (transaction.status === 'Finished' ? 'completed' : 'pending')}">
                <div class="timeline-icon">
                    <i class="fas fa-cog"></i>
                </div>
                <div class="timeline-content">
                    <h5>Processing</h5>
                    <p>${transaction.processing_date ? formatDateTime(transaction.processing_date) : 'Not started'}</p>
                </div>
            </div>
            
            <div class="timeline-item ${transaction.status === 'Finished' ? 'completed' : 'pending'}">
                <div class="timeline-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="timeline-content">
                    <h5>Completed</h5>
                    <p>${transaction.completion_date ? formatDateTime(transaction.completion_date) : 'Not completed'}</p>
                </div>
            </div>
        `;
}

// Close modal
function closeModal() {
    const modal = document.getElementById('transaction-modal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('transaction-modal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
}

// Generate personal information cards
function generatePersonalInfoCards(transaction) {
    let cards = '';
    
    // First Name
    if (transaction.first_name || transaction.given_name) {
        const firstName = transaction.given_name || transaction.first_name;
        cards += `
            <div class="info-card">
                <div class="info-icon personal">
                    <i class="fas fa-user"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">First Name</span>
                    <span class="info-value">${firstName}</span>
                </div>
            </div>
        `;
    }
    
    // Middle Name
    if (transaction.middle_name) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Middle Name</span>
                    <span class="info-value">${transaction.middle_name}</span>
                </div>
            </div>
        `;
    }
    
    // Last Name
    if (transaction.last_name) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-user"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Last Name</span>
                    <span class="info-value">${transaction.last_name}</span>
                </div>
            </div>
        `;
    }
    
    // Address
    if (transaction.address) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Address</span>
                    <span class="info-value">${transaction.address}</span>
                </div>
            </div>
        `;
    }
    
    // Birth Date
    if (transaction.birth_date) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-calendar"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Birth Date</span>
                    <span class="info-value">${transaction.birth_date}</span>
                </div>
            </div>
        `;
    }
    
    // Age
    if (transaction.age) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-birthday-cake"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Age</span>
                    <span class="info-value">${transaction.age} years old</span>
                </div>
            </div>
        `;
    }
    
    // Gender
    if (transaction.gender) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-venus-mars"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Gender</span>
                    <span class="info-value">${transaction.gender}</span>
                </div>
            </div>
        `;
    }
    
    // Civil Status
    if (transaction.civil_status) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-heart"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Civil Status</span>
                    <span class="info-value">${transaction.civil_status}</span>
                </div>
            </div>
        `;
    }
    
    // Height and Weight (for Barangay ID)
    if (transaction.height) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-ruler-vertical"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Height (Feet)</span>
                    <span class="info-value">${transaction.height}</span>
                </div>
            </div>
        `;
    }
    
    if (transaction.weight) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-weight"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Weight</span>
                    <span class="info-value">${transaction.weight} kg</span>
                </div>
            </div>
        `;
    }
    
    return cards;
}

// Generate request-specific cards
function generateRequestSpecificCards(transaction) {
    let cards = '';
    
    // Emergency Type (for emergency reports)
    if (transaction.request_type === 'emergency' && transaction.emergency_type) {
        cards += `
            <div class="info-card">
                <div class="info-icon emergency">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Type of Emergency</span>
                    <span class="info-value">${transaction.emergency_type}</span>
                </div>
            </div>
        `;
    }
    
    // Statement of Concern (for concerns)
    if (transaction.request_type === 'concern' && transaction.statement) {
        cards += `
            <div class="info-card">
                <div class="info-icon statement">
                    <i class="fas fa-comment-alt"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Statement of Concern</span>
                    <span class="info-value">${transaction.statement}</span>
                </div>
            </div>
        `;
    }
    
    // Purpose (for most forms)
    if (transaction.purpose) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-bullseye"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Purpose</span>
                    <span class="info-value">${transaction.purpose}</span>
                </div>
            </div>
        `;
    }
    
    // Employment details (for COE)
    if (transaction.employment_type) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-briefcase"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Employment Type</span>
                    <span class="info-value">${transaction.employment_type}</span>
                </div>
            </div>
        `;
    }
    
    if (transaction.position) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-user-tie"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Position</span>
                    <span class="info-value">${transaction.position}</span>
                </div>
            </div>
        `;
    }
    
    if (transaction.monthly_salary) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-money-bill-wave"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Monthly Salary</span>
                    <span class="info-value">₱${parseFloat(transaction.monthly_salary).toLocaleString()}</span>
                </div>
            </div>
        `;
    }
    
    if (transaction.date_started) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-calendar-plus"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Date Started</span>
                    <span class="info-value">${transaction.date_started}</span>
                </div>
            </div>
        `;
    }
    
    // Emergency contact (for Barangay ID)
    if (transaction.emergency_contact_name) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-phone"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Emergency Contact</span>
                    <span class="info-value">${transaction.emergency_contact_name}</span>
                </div>
            </div>
        `;
    }
    
    if (transaction.emergency_contact_number) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-phone-alt"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Emergency Number</span>
                    <span class="info-value">${transaction.emergency_contact_number}</span>
                </div>
            </div>
        `;
    }
    
    // Valid ID
    if (transaction.valid_id) {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-id-card"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Valid ID</span>
                    <span class="info-value">${transaction.valid_id}</span>
                </div>
            </div>
        `;
    }
    
    // Processing Date (for Processing status) - only for document requests, not concerns/emergencies
    if (transaction.status === 'Processing' && transaction.processing_date && transaction.request_type !== 'concern' && transaction.request_type !== 'emergency') {
        cards += `
            <div class="info-card">
                <div class="info-icon">
                    <i class="fas fa-cogs"></i>
                </div>
                <div class="info-content">
                    <span class="info-label">Processing Started</span>
                    <span class="info-value">${formatDateTime(transaction.processing_date)}</span>
                </div>
            </div>
        `;
    }
    
    
    return cards;
}

// Download document
async function downloadDocument(transactionId) {
    try {
        const response = await fetch(`php/transactions.php?action=download&id=${transactionId}`, {
            method: 'GET'
        });
        
        if (!response.ok) {
            throw new Error('Failed to download document');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_${transactionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        Swal.fire({
            icon: 'success',
            title: 'Download Started',
            text: 'Your document download has started.',
            timer: 2000,
            showConfirmButton: false
        });
    } catch (error) {
        console.error('Error downloading document:', error);
        Swal.fire({
            icon: 'error',
            title: 'Download Failed',
            text: 'Failed to download the document. Please try again.',
        });
    }
}

// Cancel transaction
async function cancelTransaction(transactionId) {
    const result = await Swal.fire({
        title: 'Cancel Transaction',
        text: 'Are you sure you want to cancel this transaction? This action cannot be undone.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Yes, cancel it!'
    });
    
    if (result.isConfirmed) {
        try {
            const response = await fetch('php/transactions.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'cancel',
                    transaction_id: transactionId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Transaction Cancelled',
                    text: 'Your transaction has been cancelled successfully.',
                    timer: 2000,
                    showConfirmButton: false
                });
                
                // Reload transactions
                loadTransactions();
            } else {
                throw new Error(data.message || 'Failed to cancel transaction');
            }
        } catch (error) {
            console.error('Error cancelling transaction:', error);
            Swal.fire({
                icon: 'error',
                title: 'Cancellation Failed',
                text: 'Failed to cancel the transaction. Please try again.',
            });
        }
    }
}

// Update statistics
function updateStatistics() {
    // Count based on what's actually being displayed (after filtering)
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const pool = transactionsVisibleInUi();
    
    // Apply the same filtering logic as the display
    const filteredTransactions = pool.filter(transaction => {
        // Filter by status - map statuses for display
        let displayStatus = transaction.status;
        if (transaction.status === 'New' || transaction.status === 'new' || transaction.status === 'NEW') {
            displayStatus = 'new';
        } else if (transaction.status === 'Processing' || transaction.status === 'processing' || transaction.status === 'PROCESSING') {
            displayStatus = 'processing';
        } else if (transaction.status === 'Finished' || transaction.status === 'finished' || transaction.status === 'FINISHED' ||
            transaction.status === 'Resolved' || transaction.status === 'resolved' || transaction.status === 'RESOLVED' ||
            transaction.status === 'Completed' || transaction.status === 'completed' || transaction.status === 'COMPLETED') {
            displayStatus = 'finished';
        } else if (transaction.status === 'Revoked' || transaction.status === 'revoked' || transaction.status === 'REVOKED' ||
            transaction.status === 'Cancelled' || transaction.status === 'cancelled' || transaction.status === 'CANCELLED') {
            displayStatus = 'revoked';
        }
        
        const statusMatch = currentFilter === 'all' || displayStatus === currentFilter;
        
        // Filter by search term
        const searchMatch = !searchTerm || 
            transaction.document_type.toLowerCase().includes(searchTerm) ||
            transaction.status.toLowerCase().includes(searchTerm) ||
            (transaction.request_type && transaction.request_type.toLowerCase().includes(searchTerm));
        
        return statusMatch && searchMatch;
    });
    
    // Count based on filtered transactions (what's actually displayed)
    const newTransactions = filteredTransactions.filter(t => 
        t.status === 'New' || 
        t.status === 'new' || 
        t.status === 'NEW'
    );
    const processingTransactions = filteredTransactions.filter(t => 
        t.status === 'Processing' || 
        t.status === 'processing' || 
        t.status === 'PROCESSING'
    );
    const finishedTransactions = filteredTransactions.filter(t => 
        t.status === 'Finished' || 
        t.status === 'finished' || 
        t.status === 'FINISHED' ||
        t.status === 'Resolved' ||
        t.status === 'resolved' ||
        t.status === 'RESOLVED' ||
        t.status === 'Completed' ||
        t.status === 'completed' ||
        t.status === 'COMPLETED'
    );
    const revokedTransactions = filteredTransactions.filter(t =>
        t.status === 'Revoked' ||
        t.status === 'revoked' ||
        t.status === 'REVOKED' ||
        t.status === 'Cancelled' ||
        t.status === 'cancelled' ||
        t.status === 'CANCELLED'
    );
    
    console.log('=== STATISTICS DEBUG (FILTERED) ===');
    console.log('Filtered transactions:', filteredTransactions.length);
    console.log('New transactions (filtered):', newTransactions.length);
    console.log('Processing transactions (filtered):', processingTransactions.length);
    console.log('Finished transactions (filtered):', finishedTransactions.length);
    console.log('Revoked transactions (filtered):', revokedTransactions.length);
    
    const stats = {
        new: newTransactions.length,
        processing: processingTransactions.length,
        finished: finishedTransactions.length,
        revoked: revokedTransactions.length
    };
    
    document.getElementById('pending-count').textContent = stats.new;
    document.getElementById('processing-count').textContent = stats.processing;
    document.getElementById('completed-count').textContent = stats.finished;
    document.getElementById('revoked-count').textContent = stats.revoked;
}

// Show loading indicator
function showLoading() {
    document.getElementById('loading-indicator').style.display = 'flex';
    document.getElementById('transactions-list').style.display = 'none';
    document.getElementById('no-transactions').style.display = 'none';
}

// Hide loading indicator
function hideLoading() {
    document.getElementById('loading-indicator').style.display = 'none';
    document.getElementById('transactions-list').style.display = 'block';
}

// Show no transactions message
function showNoTransactions() {
    document.getElementById('transactions-list').style.display = 'none';
    document.getElementById('no-transactions').style.display = 'flex';
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format date and time
function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// Go back to main UI
function goBack() {
    window.location.href = 'main_UI.html';
}

// Go to request page
function goToRequest() {
    window.location.href = 'request.html';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('transaction-modal');
    if (event.target === modal) {
        closeModal();
    }
}
