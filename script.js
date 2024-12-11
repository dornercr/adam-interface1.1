// Global variables
let articles = [];
let filteredArticles = [];
let currentPage = 1;
const resultsPerPage = 50;

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

function initializeApp() {
    loadAvailableLanguages();
    checkDarkModePreference();
}

function loadAvailableLanguages() {
    fetch('available_files.json')
        .then(response => response.json())
        .then(availableFiles => {
            const languages = Object.keys(availableFiles);
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang;
                option.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
                languageSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error("Error loading available languages:", error);
            showToast("Failed to load available languages. Please try again later.", 'danger');
        });
}

function checkDarkModePreference() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        darkModeToggle.checked = true;
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

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
            articles = results.flatMap(result => result.data);
            populateILRDropdown();
            searchArticles();
            showToast(`Loaded ${articles.length} articles for ${language}`, 'success');
        })
        .catch(error => {
            console.error("Error loading data:", error);
            showToast("An error occurred while loading the data. Please try again.", 'danger');
        })
        .finally(hideLoading);
}

function populateILRDropdown() {
    const ilrLevels = [...new Set(articles.map(a => a.ilr_quantized))].sort();
    ilrSelect.innerHTML = '<option value="">All Levels</option>';
    ilrLevels.forEach(level => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = `ILR ${level}`;
        ilrSelect.appendChild(option);
    });
}

function searchArticles() {
    const topic = topicSearch.value.toLowerCase();
    const ilr = ilrSelect.value;
    const lowRange = parseFloat(document.getElementById('lowRange').value);
    const highRange = parseFloat(document.getElementById('highRange').value);

    filteredArticles = articles.filter(article => {
        const titleMatch = article.title && article.title.toLowerCase().includes(topic);
        const summaryMatch = article.summary && article.summary.toLowerCase().includes(topic);
        const translatedSummaryMatch = article.translated_summary && article.translated_summary.toLowerCase().includes(topic);
        const ilrMatch = ilr === '' || article.ilr_quantized === ilr;

        // Parse ilr_range if it's a string
        let rangeMatch = true;
        if (article.ilr_range && typeof article.ilr_range === 'string') {
            try {
                const parsedRange = JSON.parse(article.ilr_range.replace(/'/g, '"')); // Replace single quotes if needed
                if (Array.isArray(parsedRange)) {
                    const low = parseFloat(parsedRange[0]);
                    const high = parseFloat(parsedRange[1]);
                    rangeMatch = (isNaN(lowRange) || low >= lowRange) &&
                                 (isNaN(highRange) || high <= highRange);
                }
            } catch (err) {
                console.error("Error parsing ilr_range:", err);
                rangeMatch = false; // Exclude invalid ranges
            }
        }

        return (topic === '' || titleMatch || summaryMatch || translatedSummaryMatch) && ilrMatch && rangeMatch;
    });

    currentPage = 1; // Reset to the first page when searching
    displayResults();
}


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

        const articleDiv = document.createElement('div');
        articleDiv.className = 'col-md-6 mb-4';
        articleDiv.innerHTML = `
            <div class="card h-100">
                <div class="card-body">
                    <span class="badge bg-primary ilr-badge">ILR ${article.ilr_quantized || 'N/A'}</span>
                    <h5 class="card-title" style="${isArabicTitle ? 'text-align: right; direction: rtl;' : ''}">
                        ${article.title}
                    </h5>
                    <h6 class="card-subtitle mb-2 text-muted">${selectedLanguage}</h6>
                    <p class="card-text" style="${isArabicSummary ? 'text-align: right; direction: rtl;' : ''}">
                        ${article.summary || 'No summary available'}
                    </p>
                    <p class="card-text"><strong>ILR Range:</strong> ${ilrRangeDisplay}</p>
                    <div class="mt-3">
                        <h6 class="card-subtitle mb-2 text-muted">Translated Summary</h6>
                        <p class="card-text" style="${isArabicTranslatedSummary ? 'text-align: right; direction: rtl;' : ''}">
                            ${article.translated_summary || 'No translated summary available'}
                        </p>
                    </div>
                </div>
                <div class="card-footer bg-transparent border-top-0">
                    ${article.link ? `<a href="${article.link}" class="btn btn-sm btn-outline-primary" target="_blank">Read Full Article</a>` : ''}
                    <button class="btn btn-sm btn-outline-secondary ms-2" onclick="saveForLater('${article.id}')">
                        Save for Later
                    </button>
                </div>
            </div>
        `;
        resultsDiv.appendChild(articleDiv);
    });

    updatePaginationControls();
}







function updatePaginationControls() {
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

function changePage(delta) {
    const newPage = currentPage + delta;
    const totalPages = Math.ceil(filteredArticles.length / resultsPerPage);
    
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        displayResults();
    }
}

function saveForLater(articleId) {
    // Implement save for later functionality
    showToast(`Article ${articleId} saved for later`, 'info');
}

function showLoading() {
    loadingSpinner.style.display = 'flex';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Utility function to extend Papa Parse with promise support
Papa.parsePromise = function(file, config) {
    return new Promise((complete, error) => {
        Papa.parse(file, { ...config, complete, error });
    });
};

// Utility function for debouncing
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