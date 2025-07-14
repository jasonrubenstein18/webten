# Market Suggestions Chrome Extension

A Chrome extension that analyzes webpage content and suggests relevant prediction markets from Kalshi using AI-powered semantic matching and real-time API integration.

## 🚀 New Features

- 🧠 **AI-Powered Semantic Matching**: Uses OpenAI embeddings to find markets most relevant to webpage content
- 🔍 **Intelligent Page Analysis**: Automatically extracts and analyzes webpage content for market suggestions
- ⚡ **Real-time Relevance Scoring**: Shows similarity scores for suggested markets
- 🎯 **Smart Content Extraction**: Focuses on main article content while filtering out navigation and ads

## Features

- 🔍 **Real-time Market Fetching**: Connects directly to Kalshi's API to fetch up-to-date market data
- 🧠 **Semantic Analysis**: AI-powered matching between webpage content and prediction markets
- 🎨 **Modern UI**: Clean, responsive interface with purple gradient design
- 🔐 **Secure Authentication**: Implements RSA-PSS signing for API authentication
- 📊 **Platform Support**: Currently supports Kalshi markets with Polymarket integration planned
- 📋 **Easy Actions**: View markets on Kalshi or copy market tickers to clipboard
- ⚡ **Fast Performance**: Optimized for quick market discovery with intelligent caching

## Installation

### Prerequisites
- Chrome browser (version 88+)
- OpenAI API key (for semantic matching)
- Node.js (for building dependencies)

### Setup Instructions

1. **Clone or download** this repository to your local machine
2. **Navigate** to the project directory in your terminal
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Configure API Keys**:
   - Add your OpenAI API key to the `.env` file or update `background.js`
   - Kalshi demo API credentials are pre-configured
5. **Load the extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `webten` directory (this folder)

## Usage

### Semantic Market Analysis (New!)

1. **Navigate** to any news article, blog post, or webpage with content
2. **Click** the Market Suggestions extension icon in your Chrome toolbar
3. **Click "Analyze Page"** to:
   - Extract and analyze the webpage content
   - Generate AI embeddings for semantic matching
   - Find the most relevant active Kalshi markets
   - Display results with relevance scores
4. **View relevant markets** ranked by similarity to the page content
5. **Click any market** to open it directly on Kalshi for trading

### Traditional Market Browsing

1. **Click "All Markets"** to browse all available Kalshi markets
2. **Switch platforms** using the Kalshi/Polymarket tabs
3. **Copy tickers** by clicking the copy button on any market card

### How Semantic Matching Works

The extension uses advanced AI to understand content:

1. **Content Extraction**: Intelligently extracts main article content, filtering out navigation, ads, and sidebars
2. **Text Processing**: Cleans and summarizes content for optimal analysis
3. **Embedding Generation**: Uses OpenAI's text-embedding-3-small model to create semantic vectors
4. **Similarity Calculation**: Compares content embeddings with cached market embeddings using cosine similarity
5. **Relevance Ranking**: Returns top matches above a similarity threshold with percentage scores

### Example Use Cases

- **News Articles**: Read about election coverage → Get relevant political prediction markets
- **Sports Articles**: Read about upcoming games → Get sports betting markets
- **Economic News**: Read about inflation → Get economic prediction markets
- **Tech News**: Read about AI developments → Get tech company markets

## Technical Details

### AI Integration
- **OpenAI API**: Uses text-embedding-3-small for semantic analysis
- **Embedding Caching**: Intelligent caching system to minimize API calls
- **Similarity Threshold**: Configurable relevance threshold (default: 50%)
- **Batch Processing**: Efficient batch processing for market embeddings

### Architecture
- **Manifest V3**: Uses the latest Chrome extension architecture
- **Background Script**: Handles API authentication, AI processing, and market matching
- **Content Script**: Enhanced webpage content extraction and analysis
- **Popup Interface**: Modern dual-mode UI (Analyze Page vs All Markets)

### API Integration
- **Kalshi Authentication**: RSA-PSS signing using node-forge library
- **OpenAI Integration**: Secure API key management for embeddings
- **Rate Limiting**: Respects both Kalshi and OpenAI API rate limits
- **Error Handling**: Graceful handling of API errors with user feedback
- **Active Market Filtering**: Only shows currently tradeable markets

### Performance Optimizations
- **Embedding Caching**: 30-minute cache for market embeddings
- **Batch Processing**: Processes markets in batches to avoid rate limits
- **Content Optimization**: Limits content to 3000 characters for efficient processing
- **Smart Extraction**: Prioritizes main content areas over peripheral elements

## Development

### Project Structure
```
webten/
├── manifest.json          # Extension configuration
├── background.js          # Service worker with AI integration
├── popup.html            # Enhanced popup with dual modes
├── popup.css             # Modern styling with relevance indicators
├── popup.js              # Popup functionality with semantic features
├── contentScript.js      # Enhanced content extraction
├── test-page.html        # Test page for semantic matching
├── .env                  # API keys configuration
├── lib/                  # External libraries
│   ├── forge.min.js      # RSA signing library
│   └── emailjs.min.js    # Email functionality
└── package.json          # Dependencies and scripts
```

### Configuration

Update these settings in `background.js`:

```javascript
const CONFIG = {
    SIMILARITY_THRESHOLD: 0.5,    // Minimum similarity for relevance
    MAX_RELEVANT_MARKETS: 8,      # Maximum markets to return
    EMBEDDING_MODEL: 'text-embedding-3-small'
};
```

### Testing

Use the included `test-page.html` to test semantic matching:

1. Open `test-page.html` in Chrome
2. Click the extension icon
3. Click "Analyze Page" to see relevant political markets

## Security & Privacy

- **API Keys**: Stored securely in background script (use environment variables in production)
- **Content Processing**: Page content is processed locally and sent only to OpenAI for embeddings
- **No Data Storage**: No personal data is stored or transmitted beyond API requirements
- **HTTPS Only**: All API calls use secure HTTPS connections
- **Minimal Permissions**: Only requests necessary permissions for functionality

## Roadmap

- [x] **AI Semantic Matching**: Match webpage content to relevant markets ✅
- [x] **Enhanced Content Extraction**: Smart content analysis ✅
- [x] **Relevance Scoring**: Show similarity percentages ✅
- [ ] **Polymarket Integration**: Add full Polymarket API support with semantic matching
- [ ] **Market Filtering**: Filter by category, date, popularity
- [ ] **Price Tracking**: Show current market prices and trends
- [ ] **Notifications**: Alert users about relevant market updates
- [ ] **User Preferences**: Save favorite markets and analysis settings
- [ ] **Multi-language Support**: Support for non-English content analysis

## API Costs

The extension uses OpenAI's embedding API:
- **Cost**: ~$0.00002 per 1K tokens
- **Typical Usage**: ~$0.001 per page analysis
- **Caching**: Reduces costs by caching market embeddings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with various webpage types
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the browser console for error messages
- Ensure you have valid API keys configured
- Test with the included `test-page.html`

---

**Note**: This extension is for educational and research purposes. The AI matching is designed to help discover relevant markets but should not be considered financial advice. Always conduct your own research before making any financial decisions in prediction markets.
