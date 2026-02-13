// game.js - FIXED token handling
console.log("game.js loading...");

// Define Spotify callback IMMEDIATELY
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log("✅ Spotify SDK is ready!");
    
    if (window.game) {
        console.log("Game exists, initializing player...");
        window.game.initSpotifyPlayer();
    } else {
        console.log("Game not ready yet, marking SDK ready");
        window.spotifySDKReady = true;
    }
};

class MusicQuizGame {
    constructor() {
        console.log("Game constructor starting...");
        
        this.players = [];
        this.currentPlayerIndex = 0;
        this.currentRound = 1;
        this.maxRounds = 4;
        this.selectedPlaylist = 'family';
        this.currentSong = null;
        this.replaysLeft = 1;
        this.spotifyPlayer = null;
        this.deviceId = null;
        this.token = null;
        
        // CRITICAL: Check for token in URL and localStorage
        this.checkForToken();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // If Spotify SDK already loaded, initialize player
        if (window.spotifySDKReady) {
            console.log("SDK was ready, initializing player now");
            this.initSpotifyPlayer();
        }
    }

    checkForToken() {
        console.log("Checking for token...");
        console.log("Current URL:", window.location.href);
        console.log("Hash:", window.location.hash);
        
        // Method 1: Check URL hash (from OAuth redirect)
        if (window.location.hash) {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            this.token = params.get('access_token');
            
            if (this.token) {
                console.log("✅ Found token in URL hash!");
                
                // Save to localStorage for future visits
                localStorage.setItem('spotify_token', this.token);
                localStorage.setItem('spotify_token_expiry', Date.now() + 3600000); // 1 hour
                
                // Clean URL - remove hash
                window.history.replaceState(null, null, window.location.pathname);
            }
        }
        
        // Method 2: Check URL search params (from our callback)
        if (!this.token && window.location.search) {
            const params = new URLSearchParams(window.location.search);
            this.token = params.get('access_token');
            
            if (this.token) {
                console.log("✅ Found token in URL search!");
                localStorage.setItem('spotify_token', this.token);
                localStorage.setItem('spotify_token_expiry', Date.now() + 3600000);
                
                // Clean URL
                window.history.replaceState(null, null, window.location.pathname);
            }
        }
        
        // Method 3: Check localStorage for existing token
        if (!this.token) {
            const storedToken = localStorage.getItem('spotify_token');
            const expiry = localStorage.getItem('spotify_token_expiry');
            
            if (storedToken && expiry && parseInt(expiry) > Date.now()) {
                console.log("✅ Found valid stored token!");
                this.token = storedToken;
            } else if (storedToken) {
                console.log("❌ Stored token expired");
                localStorage.removeItem('spotify_token');
                localStorage.removeItem('spotify_token_expiry');
            }
        }
        
        // Update UI based on token status
        this.updateConnectionStatus();
    }

    updateConnectionStatus() {
        const statusDiv = document.getElementById('connection-status');
        if (!statusDiv) return;
        
        if (this.token) {
            statusDiv.innerHTML = '✅ Connected to Spotify';
            statusDiv.className = 'status connected';
        } else {
            statusDiv.innerHTML = '❌ Not connected. Click "Connect Spotify"';
            statusDiv.className = 'status';
        }
    }

    setupEventListeners() {
        console.log("Setting up event listeners...");
        
        // Login button
        const loginBtn = document.getElementById('login-spotify');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.loginToSpotify();
            });
        }

        // Start game button
        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (!this.token) {
                    alert('Please connect to Spotify first!');
                    return;
                }
                console.log("Starting game with token:", this.token.substring(0, 10) + "...");
                alert("Game would start here! Token exists.");
            });
        }

        // Back button on test screen
        const backBtn = document.getElementById('back-button');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.showScreen('landing-screen');
            });
        }
    }

    loginToSpotify() {
        console.log("Starting Spotify login...");
        
        // IMPORTANT: Replace with your actual Client ID
        const clientId = 'YOUR_CLIENT_ID_HERE'; 
        const redirectUri = 'https://bluethsprojectsite.fun/callback.html';
        
        // Only request streaming scope
        const scope = 'streaming';
        
        // Generate random state for security
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('spotify_state', state);
        
        const authUrl = 'https://accounts.spotify.com/authorize?' +
            'client_id=' + clientId +
            '&response_type=token' +
            '&redirect_uri=' + encodeURIComponent(redirectUri) +
            '&scope=' + encodeURIComponent(scope) +
            '&state=' + state +
            '&show_dialog=true';
        
        console.log("Redirecting to Spotify...");
        window.location.href = authUrl;
    }

    initSpotifyPlayer() {
        console.log("Initializing Spotify player...");
        
        if (!this.token) {
            console.error("❌ No token available for player");
            return;
        }

        console.log("Token available, creating player...");

        try {
            this.spotifyPlayer = new Spotify.Player({
                name: 'Music Quiz Family Game',
                getOAuthToken: cb => { 
                    console.log("Player requesting token...");
                    cb(this.token); 
                },
                volume: 0.7
            });

            // Error handling
            this.spotifyPlayer.addListener('initialization_error', ({ message }) => {
                console.error('Initialization error:', message);
            });

            this.spotifyPlayer.addListener('authentication_error', ({ message }) => {
                console.error('Authentication error:', message);
                // Token might be invalid - clear it
                localStorage.removeItem('spotify_token');
                this.token = null;
                this.updateConnectionStatus();
            });

            this.spotifyPlayer.addListener('account_error', ({ message }) => {
                console.error('Account error:', message);
                alert('Spotify Premium required for playback');
            });

            this.spotifyPlayer.addListener('playback_error', ({ message }) => {
                console.error('Playback error:', message);
            });

            // Ready
            this.spotifyPlayer.addListener('ready', ({ device_id }) => {
                console.log('✅ Player ready with Device ID:', device_id);
                this.deviceId = device_id;
                
                const statusDiv = document.getElementById('connection-status');
                if (statusDiv) {
                    statusDiv.innerHTML = '✅ Spotify player ready!';
                }
            });

            // Not ready
            this.spotifyPlayer.addListener('not_ready', ({ device_id }) => {
                console.log('Device ID went offline:', device_id);
            });

            // Connect
            console.log("Connecting player...");
            this.spotifyPlayer.connect();
            
        } catch (error) {
            console.error("Error creating Spotify player:", error);
        }
    }

    showScreen(screenId) {
        console.log("Showing screen:", screenId);
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        } else {
            console.error("Screen not found:", screenId);
        }
    }
}

// Start game when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM ready - creating game");
    window.game = new MusicQuizGame();
});
