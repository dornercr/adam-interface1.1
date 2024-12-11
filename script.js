// Global variables
let articles = [];
let filteredArticles = [];
let currentPage = 1;
const resultsPerPage = 15;

// Predefined ILR levels
const predefinedILRLevels = ["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5"];

// DOM elements
const darkModeToggle = document.getElementById('darkModeToggle');
const languageSelect = document.getElementById('languageSelect');
const topicSearch = document.getElementById('topicSearch');
const ilrSelect = document.getElementById('ilrSelect');
const searchBtn = document.getElementById('searchBtn');
const resultsDiv = document.getElementById('results');
const loadingSpinner = document.getElementById('loadingSpinner');
const pageInfo = document.getElementById('pageInfo');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');

// Event listeners
document.addEventListener('DOMContentLoaded', initializeApp);
darkModeToggle.addEventListener('change', toggleDarkMode);
languageSelect.addEventListener('change', loadLanguageData);
searchBtn.addEventListener('click', searchArticles);
prevPageBtn.addEventListener('click', () => changePage(-1));
nextPageBtn.addEventListener('click', () => changePage(1));

// Debounced search function
const debouncedSearch = debounce(searchArticles, 300);
topicSearch.addEventListener('input', debouncedSearch);
ilrSelect.addEventListener('change', debouncedSearch);

/**
 * Initializes the application by loading available languages and setting dark mode preferences.
 */
function initializeApp() {
    loadAvailableLanguages();
    checkDarkModePreference();
}

/**
 * Fetches available languages from 'available_files.json' and populates the language dropdown.
 */
function loadAvailableLanguages() {
    fetch('available_files.json')
        .then(response => response.json())
        .then(availableFiles => {
            const languages = Object.keys(availableFiles);
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = capitalizeFirstLetter(lang);
                languageSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error loading available languages:", error);
            showToast("Failed to load available languages. Please try again later.", 'danger');
        });
}

/**
 * Capitalizes the first letter of a given string.
 * @param {string} string - The string to capitalize.
 * @returns {string} - The capitalized string.
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Checks and applies the user's dark mode preference from localStorage.
 */
function checkDarkModePreference() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }
}

/**
 * Toggles the dark mode theme and updates the preference in localStorage.
 */
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

/**
 * Loads language-specific data from CSV files and processes articles.
 */
function loadLanguageData() {
    const language = languageSelect.value;
    if (!language) return;

    showLoading();

    fetch('available_files.json')
        .then(response => response.json())
        .then(availableFiles => {
            const languageFiles = availableFiles[language];
            if (!languageFiles || languageFiles.length === 0) {
                throw new Error(`No CSV files found for language: ${language}`);
            }

            const promises = languageFiles.map(csvFile =>
                Papa.parsePromise(csvFile, { download: true, header: true })
            );

            return Promise.all(promises);
        })
        .then(results => {
            // Process and normalize articles
            articles = results.flatMap(result => result.data.map(article => ({
                ...article,
                title: article.title || '',
                summary: article.summary || '',
                translated_summary: article.translated_summary || article.translated || '',
                ilr_quantized: normalizeILRLevel(article.ilr_quantized),
                ilr_range: article.ilr_range || '',
                link: article.link || '',
                id: article.id || generateId()
            })));
            populateILRDropdown();
            searchArticles();
            showToast(`Loaded ${articles.length} articles for ${capitalizeFirstLetter(language)}`, 'success');
        })
        .catch(error => {
            console.error("Error loading data:", error);
            showToast("An error occurred while loading the data. Please try again.", 'danger');
        })
        .finally(hideLoading);
}

/**
 * Normalizes the ILR level to match predefined ILR levels.
 * @param {string|number} ilr - The ILR level to normalize.
 * @returns {string} - The normalized ILR level or 'N/A' if no match is found.
 */
function normalizeILRLevel(ilr) {
    if (!ilr) return 'N/A';

    // Convert to string and trim
    const ilrStr = String(ilr).trim();

    // Direct match
    if (predefinedILRLevels.includes(ilrStr)) {
        return ilrStr;
    }

    // Attempt to parse as float and fix to one decimal
    const ilrFloat = parseFloat(ilrStr);
    if (!isNaN(ilrFloat)) {
        const ilrFormatted = ilrFloat.toFixed(1);
        if (predefinedILRLevels.includes(ilrFormatted)) {
            return ilrFormatted;
        }
    }

    // Handle cases like "ILR 1.0"
    if (ilrStr.startsWith("ILR ")) {
        const ilrValue = ilrStr.substring(4);
        if (predefinedILRLevels.includes(ilrValue)) {
            return ilrValue;
        }
    }

    // If no match, return 'N/A'
    return 'N/A';
}

/**
 * Populates the ILR dropdown with predefined ILR levels.
 */
function populateILRDropdown() {
    ilrSelect.innerHTML = '<option value="">All Levels</option>';
    predefinedILRLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = `ILR ${level}`;
        ilrSelect.appendChild(option);
    });
}

/**
 * Filters and sorts articles based on search criteria and ILR selection.
 */
function searchArticles() {
    const topic = topicSearch.value.toLowerCase();
    const ilr = ilrSelect.value;

    filteredArticles = articles.filter(article => {
        const titleMatch = article.title.toLowerCase().includes(topic);
        const summaryMatch = article.summary.toLowerCase().includes(topic);
        const translatedSummaryMatch = article.translated_summary.toLowerCase().includes(topic);
        const ilrMatch = ilr === '' || article.ilr_quantized === ilr;

        return (topic === '' || titleMatch || summaryMatch || translatedSummaryMatch) && ilrMatch;
    });

    // Sort filteredArticles: Articles with translated_summary first
    filteredArticles.sort((a, b) => {
        const aHasTranslation = a.translated_summary && a.translated_summary.trim() !== '';
        const bHasTranslation = b.translated_summary && b.translated_summary.trim() !== '';

        if (aHasTranslation && !bHasTranslation) return -1; // a comes before b
        if (!aHasTranslation && bHasTranslation) return 1;  // b comes before a
        return 0; // no change
    });

    currentPage = 1;
    displayResults();
}

/**
 * Truncates a given text to the specified number of words.
 * Adds an ellipsis (...) if the text exceeds the word limit.
 *
 * @param {string} text - The text to be truncated.
 * @param {number} wordLimit - The maximum number of words allowed.
 * @returns {string} - The truncated text with an ellipsis if needed.
 */
function truncateText(text, wordLimit) {
    if (!text) return 'No translated summary available';
    
    const words = text.trim().split(/\s+/);
    if (words.length <= wordLimit) {
        return text;
    }
    return words.slice(0, wordLimit).join(' ') + '...';
}

/**
 * Displays the search results with pagination and truncated summaries.
 */
function displayResults() {
    const startIndex = (currentPage - 1) * resultsPerPage;
    const endIndex = startIndex + resultsPerPage;
    const paginatedResults = filteredArticles.slice(startIndex, endIndex);

    resultsDiv.innerHTML = '';

    if (paginatedResults.length === 0) {
        resultsDiv.innerHTML = '<div class="col-12"><div class="alert alert-info">No results found. Try adjusting your search criteria.</div></div>';
        return;
    }

    const selectedLanguage = languageSelect.options[languageSelect.selectedIndex].textContent; // Get the selected language name

    paginatedResults.forEach(article => {
        // Skip articles without a title
        if (!article.title) return;

        let ilrRangeDisplay = 'N/A';

        // Parse ilr_range if it's a string
        if (article.ilr_range && typeof article.ilr_range === 'string') {
            try {
                const parsedRange = JSON.parse(article.ilr_range.replace(/'/g, '"'));
                if (Array.isArray(parsedRange)) {
                    const low = parseFloat(parsedRange[0]);
                    const high = parseFloat(parsedRange[1]);
                    ilrRangeDisplay = `[${low.toFixed(2)}, ${high.toFixed(2)}]`;
                }
            } catch (err) {
                console.error("Error parsing ilr_range:", err);
            }
        }

        // Check if title, summary, or translated summary contains Arabic text
        const isArabicTitle = /[\u0600-\u06FF]/.test(article.title);
        const isArabicSummary = /[\u0600-\u06FF]/.test(article.summary);
        const isArabicTranslatedSummary = /[\u0600-\u06FF]/.test(article.translated_summary);

        // Truncate the translated summary to 200 words
        const truncatedTranslatedSummary = truncateText(article.translated_summary, 200);

        const articleDiv = document.createElement('div');
        articleDiv.className = 'col-md-6 mb-4';
        articleDiv.innerHTML = `
            <div class="card h-100">
                <div class="card-body">
                    <span class="badge ${article.ilr_quantized !== 'N/A' ? 'bg-primary' : 'bg-secondary'} ilr-badge">ILR ${article.ilr_quantized || 'N/A'}</span>
                    <h5 class="card-title" style="${isArabicTitle ? 'text-align: right; direction: rtl;' : ''}">
                        ${sanitizeHTML(article.title)}
                    </h5>
                    <h6 class="card-subtitle mb-2 text-muted">${sanitizeHTML(selectedLanguage)}</h6>
                    <p class="card-text" style="${isArabicSummary ? 'text-align: right; direction: rtl;' : ''}">
                        ${sanitizeHTML(article.summary) || 'No summary available'}
                    </p>
                    <p class="card-text"><strong>ILR Range:</strong> ${sanitizeHTML(ilrRangeDisplay)}</p>
                    <div class="mt-3">
                        <h6 class="card-subtitle mb-2 text-muted">Translated Summary</h6>
                        <p class="card-text" style="${isArabicTranslatedSummary ? 'text-align: right; direction: rtl;' : ''}">
                            ${sanitizeHTML(truncatedTranslatedSummary)}
                        </p>
                    </div>
                </div>
                <div class="card-footer bg-transparent border-top-0">
                    ${article.link ? `<a href="${sanitizeURL(article.link)}" class="btn btn-sm btn-outline-primary" target="_blank">Read Full Article</a>` : ''}
                    <button class="btn btn-sm btn-outline-secondary ms-2" onclick="saveForLater('${sanitizeHTML(article.id)}')">
                        Save for Later
                    </button>
                </div>
            </div>
        `;
        resultsDiv.appendChild(articleDiv);
    });

    updatePaginationControls();
}

/**
 * Updates the pagination controls based on the current page and total results.
 */
function updatePaginationControls() {
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

/**
 * Changes the current page by a given delta (e.g., -1 for previous, +1 for next).
 * @param {number} delta - The change in page number.
 */
function changePage(delta) {
    const newPage = currentPage + delta;
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayResults();
    }
}

/**
 * Saves an article for later viewing.
 * @param {string} articleId - The unique identifier of the article.
 */
function saveForLater(articleId) {
    // Implement actual save functionality as needed
    showToast(`Article ${sanitizeHTML(articleId)} saved for later`, 'info');
}

/**
 * Displays the loading spinner.
 */
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

/**
 * Hides the loading spinner.
 */
function hideLoading() {
    loadingSpinner.style.display = 'none';
}

/**
 * Displays a toast notification with a given message and type.
 * @param {string} message - The message to display.
 * @param {string} type - The type of toast ('info', 'success', 'danger', etc.).
 */
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) return; // Ensure the container exists

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${sanitizeHTML(message)}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

/**
 * Sanitizes HTML to prevent XSS attacks.
 * @param {string} str - The string to sanitize.
 * @returns {string} - The sanitized string.
 */
function sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

/**
 * Sanitizes URLs to prevent XSS attacks.
 * @param {string} url - The URL to sanitize.
 * @returns {string} - The sanitized URL.
 */
function sanitizeURL(url) {
    try {
        const parsedURL = new URL(url);
        return parsedURL.href;
    } catch (e) {
        console.error("Invalid URL:", url);
        return '#';
    }
}

/**
 * Generates a unique identifier.
 * @returns {string} - A unique ID.
 */
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Utility function to extend Papa Parse with promise support.
 * @param {string} file - The file to parse.
 * @param {object} config - Papa Parse configuration options.
 * @returns {Promise} - A promise that resolves with the parse results.
 */
Papa.parsePromise = function(file, config) {
    return new Promise((complete, error) => {
        Papa.parse(file, { ...config, complete, error });
    });
};

/**
 * Utility function for debouncing.
 * Delays the execution of a function until after a specified wait time has elapsed since the last time it was invoked.
 * @param {function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {function} - The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
