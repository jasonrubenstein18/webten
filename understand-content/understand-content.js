console.log('Understand Content Extension: Module loaded');

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, initializing understand content...');
    
    // Get back button
    const backBtn = document.getElementById('back-btn');
    
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            console.log('Navigating back to main menu...');
            window.location.href = '../popup.html';
        });
    }
    
    // Add hover effect to back button
    if (backBtn) {
        backBtn.addEventListener('mouseenter', () => {
            backBtn.style.transform = 'translateX(-2px)';
        });
        
        backBtn.addEventListener('mouseleave', () => {
            backBtn.style.transform = 'translateX(0)';
        });
    }
    
    // Future: Add functionality for content analysis
    // This is where we'll add the main content analysis logic
    
    console.log('Understand Content module initialized');
});

// Error handling for uncaught errors
window.addEventListener('error', (event) => {
    console.error('Understand Content error:', event.error);
});

// Error handling for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Understand Content unhandled promise rejection:', event.reason);
});
