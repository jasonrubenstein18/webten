// Common utility functions shared across all sports

/**
 * Displays an error message in the popup
 * @param {string} message - Error message to display
 */
function displayError(message) {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = `
        <div class="error">
            <p>${message}</p>
            <p>Please try again or contact support if the problem persists.</p>
        </div>
    `;
    
    // Hide loading indicator if it exists
    const loadingContainer = document.getElementById('loading-container');
    if (loadingContainer) {
        loadingContainer.style.display = 'none';
    }
}

/**
 * Extracts the total price from the page
 * @returns {Promise<number|null>} The total price or null if not found
 */
async function getTotalPrice() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (!tabs.length) {
                resolve(null);
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { type: "GET_TOTAL_PRICE" }, (response) => {
                resolve(response?.totalPrice || null);
            });
        });
    });
}

/**
 * Handles user login
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<boolean>} Success status
 */
async function login(email, password) {
    try {
        // Implement actual login logic here
        // For now, just simulate a successful login
        localStorage.setItem('isAuthenticated', 'true');
        return true;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

/**
 * Handles user logout
 */
async function logout() {
    localStorage.removeItem('isAuthenticated');
    return true;
}

/**
 * Checks if user is authenticated
 * @returns {boolean} Authentication status
 */
function isAuthenticated() {
    return localStorage.getItem('isAuthenticated') === 'true';
}

/**
 * Safely handle messages between scripts
 * @param {Object} message - The message to process
 * @param {function} handler - The message handler function
 * @returns {*} Result from the handler
 */
function safeHandleMessage(message, handler) {
    try {
        if (!message) {
            console.error("Received undefined or null message");
            return null;
        }
        return handler(message);
    } catch (error) {
        console.error("Error handling message:", error);
        return null;
    }
}

// Export all utility functions
window.utils = {
    displayError,
    getTotalPrice,
    login,
    logout,
    isAuthenticated,
    safeHandleMessage
};

// Common utility functions for the extension
window.utils = (function() {
    // Private variables
    let _isAuthenticated = false;
    let _userData = null;
    
    /**
     * Send a message to the background script and wrap it in a Promise
     * @param {string} type - Message type
     * @param {object} data - Message data
     * @returns {Promise} Promise that resolves with the response
     */
    function sendMessagePromise(type, data = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: type,
                ...data
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    console.error('Error in response:', response.error);
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    /**
     * Get the total price from the current page
     * @returns {Promise<number>} The total price
     */
    async function getTotalPrice() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            
            const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(currentTab.id, { 
                    type: "GET_TOTAL_PRICE"
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error getting total price:', chrome.runtime.lastError);
                        resolve(null);
                    } else {
                        resolve(response);
                    }
                });
            });
            
            return response?.totalPrice;
        } catch (error) {
            console.error('Error in getTotalPrice:', error);
            return null;
        }
    }
    
    /**
     * Handle authentication
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise} Authentication result
     */
    async function login(email, password) {
        try {
            // In a real implementation, you would call an API here
            // This is a mock implementation
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // For demo purposes, accept any email/password
            _isAuthenticated = true;
            _userData = { email, name: email.split('@')[0] };
            
            return { success: true, userData: _userData };
        } catch (error) {
            _isAuthenticated = false;
            _userData = null;
            throw error;
        }
    }
    
    /**
     * Check if user is authenticated
     * @returns {boolean} Authentication status
     */
    function isAuthenticated() {
        return _isAuthenticated;
    }
    
    /**
     * Get user data
     * @returns {object|null} User data or null if not authenticated
     */
    function getUserData() {
        return _userData;
    }
    
    /**
     * Safely handle messages between scripts
     * @param {Object} message - The message to process
     * @param {function} handler - The message handler function
     * @returns {*} Result from the handler
     */
    function safeHandleMessage(message, handler) {
        try {
            if (!message) {
                console.error("Received undefined or null message");
                return null;
            }
            return handler(message);
        } catch (error) {
            console.error("Error handling message:", error);
            return null;
        }
    }
    
    // Public API
    return {
        sendMessagePromise: sendMessagePromise,
        getTotalPrice: getTotalPrice,
        login: login,
        isAuthenticated: isAuthenticated,
        getUserData: getUserData,
        safeHandleMessage: safeHandleMessage
    };
})();

// Initialize utils
console.log("Utils initialized"); 