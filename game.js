// game.js - FIXED Spotify integration
console.log("game.js loading...");

// Define Spotify callback IMMEDIATELY at the top of the file
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log("Spotify SDK is ready!");
    
    // If game already exists, initialize player
    if (window.game) {
        window.game.initSpotifyPlayer();
    } else {
        // Store that SDK is ready for when game loads
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
        
        // Check URL for token on startup
        this.checkForToken();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // If Spotify SDK already loaded, initialize player
        if (window.spotifySDKReady) {
            this.initSpotifyPlayer();
        }
    }

    checkForToken() {
        // Check URL hash for access token
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        this.token = params.get('access_token');
        
        const statusDiv = document.getElementById('connection-status');
        
        if (this.token) {
            console.log("Found Spotify token");
            statusDiv.innerHTML = 'Connected to Spotify';
            statusDiv.className = 'status connected';
            
            // Store token for later use
            localStorage.setItem('spotify_token', this.token);
            
            // Clean URL (remove hash)
            window.history.replaceState(null, null, window.location.pathname);
        } else {
            // Check if we have a stored token
            const storedToken = localStorage.getItem('spotify_token');
            if (storedToken) {
                this.token = storedToken;
                statusDiv.innerHTML = 'Connected to Spotify';
                statusDiv.className = 'status connected';
            }
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
                console.log("Starting game...");
                alert("Game would start here!");
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
        console.log("Logging into Spotify...");
        
        // YOUR CLIENT ID - Replace with your actual Client ID
        const clientId = '73cebf4091ea4699bb90518b005d610b'; 
        const redirectUri = 'https://bluethsprojectsite.fun/callback.html';
        
        // ONLY request streaming scope - no Web API needed
        const scope = 'streaming';
        
        const authUrl = 'https://accounts.spotify.com/authorize?' +
            'client_id=' + clientId +
            '&response_type=token' +
            '&redirect_uri=' + encodeURIComponent(redirectUri) +
            '&scope=' + encodeURIComponent(scope) +
            '&show_dialog=true';  // Force login every time for testing
        
        console.log("Redirecting to:", authUrl);
        window.location.href = authUrl;
    }

    initSpotifyPlayer() {
        console.log("Initializing Spotify player...");
        
        if (!this.token) {
            console.error("No token available");
            return;
        }

        try {
            this.spotifyPlayer = new Spotify.Player({
                name: 'Music Quiz Family Game',
                getOAuthToken: cb => { 
                    console.log("Getting token...");
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
                // Token might be expired - clear it
                localStorage.removeItem('spotify_token');
                this.token = null;
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
                console.log('Player ready with Device ID:', device_id);
                this.deviceId = device_id;
                
                const statusDiv = document.getElementById('connection-status');
                statusDiv.innerHTML = 'Spotify player ready!';
            });

            // Not ready
            this.spotifyPlayer.addListener('not_ready', ({ device_id }) => {
                console.log('Device ID gone offline:', device_id);
            });

            // Connect
            this.spotifyPlayer.connect();
            console.log("Connecting player...");
            
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
