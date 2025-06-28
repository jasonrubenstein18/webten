// popup-loader.js
document.addEventListener('DOMContentLoaded', () => {
    // Add click handlers to sport buttons
    document.querySelectorAll('.sport-btn').forEach(button => {
        button.addEventListener('click', async (e) => {
            const sport = e.target.dataset.sport;
            
            // Store selected sport
            await chrome.storage.sync.set({ selectedSport: sport });
            
            // Load sport-specific popup script
            const scriptMap = {
                'basketball_nba': 'popups/nba.js',
                'basketball_ncaab': 'popups/ncaab.js',
                'football_ncaaf': 'popups/ncaaf.js',
                'football_nfl': 'popups/nfl.js',
                'icehockey_nhl': 'popups/nhl.js',
                'baseball_mlb': 'popups/mlb.js'
            };

            const scriptPath = scriptMap[sport];
            if (scriptPath) {
                const script = document.createElement('script');
                script.src = scriptPath;
                document.body.appendChild(script);
            }
        });
    });
});