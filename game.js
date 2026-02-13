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

        this.useYouTubeFallback = true;
        
        // If Spotify SDK already loaded, initialize player
        if (window.spotifySDKReady) {
            console.log("SDK was ready, initializing player now");
            this.initSpotifyPlayer();
        }
    }

    async playYouTubeFallback(song) {
        if(!song || !song.title) return false;

        try {
            document.getElementById('result-message').innerHTML = 'Loading from YouTube...';

            const searchQuery = encodeURIComponent(`${song.title} ${song.artist} audio`);
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;

            const response = await fetch(proxyUrl + encodeURIComponent(youtubeSearchUrl));
            const html = await response.text();

            const videoIdMatch = html.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
            if (!videoIdMatch) return false;

            const videoId = videoIdMatch[1];

            const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${song.startTime || 30}&end=${(song.startTime || 30) + 10}&controls=0`;

            const playerDiv = document.createElement('div');
            playerDiv.innerHTML = `
                <iframe width="0" height="0"
                    src="${embedUrl}"
                    frameborder="0"
                    allow="autoplay; encrypted-media">
                </iframe>
            `;
            document.body.appendChild(playerDiv);

            setTimeout(() => {
                playerDiv.remove();
            }, 15000);

            return true;
        } catch (e) {
            console.error('YouTube fallback failed:', e);
            return false;
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
                console.log('Starting game...');
                this.showScreen('player-screen');
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

    async loginToSpotify() {
        console.log("Starting Spotify login with PKCE...");
        
        const clientId = '73cebf4091ea4699bb90518b005d610b';
        const redirectUri = 'https://bluethsprojectsite.fun/callback.html';
        
        // Generate code verifier and challenge
        const generateRandomString = (length) => {
            const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
            let text = '';
            for (let i = 0; i < length; i++) {
                text += possible.charAt(Math.floor(Math.random() * possible.length));
            }
            return text;
        };
        
        const sha256 = async (plain) => {
            const encoder = new TextEncoder();
            const data = encoder.encode(plain);
            const digest = await crypto.subtle.digest('SHA-256', data);
            return btoa(String.fromCharCode(...new Uint8Array(digest)))
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
        };
        
        // Generate and store code verifier
        const codeVerifier = generateRandomString(64);
        localStorage.setItem('code_verifier', codeVerifier);
        
        // Generate code challenge
        const codeChallenge = await sha256(codeVerifier);
        
        // Generate state for security
        const state = generateRandomString(16);
        localStorage.setItem('spotify_state', state);
        
        // Build authorization URL
        const authUrl = new URL('https://accounts.spotify.com/authorize');
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('response_type', 'code');  // NOT token
        authUrl.searchParams.append('redirect_uri', redirectUri);
        authUrl.searchParams.append('code_challenge_method', 'S256');
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('scope', 'streaming');
        
        console.log("Redirecting to Spotify...");
        window.location.href = authUrl.toString();
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

    async playCurrentSong() {
        if(!this.currentSong) return;

        if(this.deviceId && this.token) {
            try {
                await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        uris: [this.currentSong.uri],
                        position_ms: this.currentSong.startTime * 1000
                    }),
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.token
                    }
                });

                setTimeout(() => {
                    fetch('https://api.spotify.com/v1/me/player/pause', {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bearer ' + this.token }
                    });
                }, 10000);

                return;
            } catch (e) {
                console.log('Spotify playback failed, trying YouTube...');
            }
        }

        if (this.useYouTubeFallback) {
            const success = await this.playYoutubeFallback(this.currentSong);
            if(!success) { 
                document.getElementById('result-message').innerHTML = 'Could not play this song. Try another!';
            }
        }
    }

    showScreen(screenId) {
        console.log("Showing screen:", screenId);
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('-active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('-active');
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
