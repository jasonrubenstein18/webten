# Market Suggestions Chrome Extension

A Chrome extension that analyzes webpage content and suggests relevant prediction markets from Kalshi using real-time API integration.

## Features

- 🔍 **Real-time Market Fetching**: Connects directly to Kalshi's API to fetch up-to-date market data
- 🎨 **Modern UI**: Clean, responsive interface with purple gradient design
- 🔐 **Secure Authentication**: Implements RSA-PSS signing for API authentication
- 📊 **Platform Support**: Currently supports Kalshi markets with Polymarket integration planned
- 📋 **Easy Actions**: View markets on Kalshi or copy market titles to clipboard
- ⚡ **Fast Performance**: Optimized for quick market discovery

## Installation

### Prerequisites
- Chrome browser (version 88+)
- Node.js (for building dependencies)

### Setup Instructions

1. **Clone or download** this repository to your local machine
2. **Navigate** to the project directory in your terminal
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Build the extension**:
   ```bash
   npm run build
   ```
5. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `webten` directory (this folder)

## Usage

### Basic Usage

1. **Navigate** to any webpage in your browser
2. **Click** the Market Suggestions extension icon in your Chrome toolbar
3. **Click "Analyze Page"** to fetch current markets from Kalshi
4. **Browse markets** in the popup window
5. **Switch platforms** using the Kalshi/Polymarket tabs at the bottom
6. **View markets** by clicking "View Market" to open in Kalshi
7. **Copy titles** by clicking "Copy Title" to copy market tickers

### API Configuration

The extension is pre-configured to work with Kalshi's demo API using the provided credentials. For production use, you would need to:

1. Register for a Kalshi API account
2. Generate your API keys
3. Update the credentials in `background.js`

### Features in Detail

- **Market Cards**: Each market is displayed with its ticker, description, and action buttons
- **Real-time Data**: Markets are fetched live from Kalshi's API when you click "Analyze Page"
- **Modern Design**: Purple gradient header with clean card-based layout
- **Platform Tabs**: Easy switching between Kalshi and Polymarket (Polymarket integration coming soon)
- **Copy Functionality**: Quickly copy market tickers for research or sharing

## Technical Details

### Architecture
- **Manifest V3**: Uses the latest Chrome extension architecture
- **Background Script**: Handles API authentication and requests
- **Content Script**: Analyzes webpage content (planned for content-based suggestions)
- **Popup Interface**: Modern React-like UI built with vanilla JavaScript

### API Integration
- **Authentication**: RSA-PSS signing using node-forge library
- **Endpoints**: Currently uses `/trade-api/v2/markets` for market data
- **Rate Limiting**: Respects Kalshi's API rate limits
- **Error Handling**: Graceful handling of API errors with user feedback

### Security
- **Private Key**: Stored securely in background script (production would use secure storage)
- **HTTPS Only**: All API calls use secure HTTPS connections
- **Permission Model**: Minimal permissions required for functionality

## Development

### Project Structure
```
webten/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── popup.html            # Extension popup HTML
├── popup.css             # Modern styling
├── popup.js              # Popup functionality
├── contentScript.js      # Page content analysis
├── lib/                  # External libraries
│   ├── forge.min.js      # RSA signing library
│   └── emailjs.min.js    # Email functionality
└── package.json          # Dependencies and scripts
```

### Building

To rebuild the extension after making changes:

```bash
npm run build
```

Then reload the extension in Chrome:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Market Suggestions extension

### API Testing

The extension includes comprehensive error handling and logging. Check the browser console and extension service worker logs for debugging information.

## Roadmap

- [ ] **Content Analysis**: Suggest markets based on webpage content
- [ ] **Polymarket Integration**: Add full Polymarket API support  
- [ ] **Market Filtering**: Filter markets by category, date, popularity
- [ ] **Price Tracking**: Show current market prices and trends
- [ ] **Notifications**: Alert users about market updates
- [ ] **User Preferences**: Save favorite markets and settings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the browser console for error messages
- Ensure you have the latest Chrome version

---

**Note**: This extension is for educational and research purposes. Always conduct your own research before making any financial decisions in prediction markets.
