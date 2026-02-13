// game.js - With preloading functionality

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
        this.deviceId = null;
        this.token = null;
        this.useYouTubeFallback = true;
        this.recognition = null;
        this.youtubePlayer = null;
        this.playerReady = false;
        this.preloadedVideoId = null;
        this.preloadedSong = null;
        this.isPreloaded = false;
        this.isLoading = false; // Flag to prevent multiple simultaneous loads
        this.randomStartTime = 15; // Default value
        
        // IMPORTANT: Add your YouTube API key here
        this.YOUTUBE_API_KEY = 'AIzaSyDejNIPtcOOfuvrCNqorr2s1Yh_hEpFOc8'; // Replace with your actual key
        
        this.setupEventListeners();
        this.initVoiceRecognition();
        this.loadYouTubeAPI();
    }
    
    // Load YouTube IFrame API
    loadYouTubeAPI() {
        // Don't load if already loaded
        if (window.YT) {
            this.onYouTubeAPIReady();
            return;
        }
        
        // Create script tag to load YouTube API
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        // Set up callback for when API is ready
        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube API loaded');
            this.onYouTubeAPIReady();
        };
    }
    
    onYouTubeAPIReady() {
        this.playerReady = true;
        console.log('YouTube player ready');
    }
    
    // New method: Preload the video when round starts
    async preloadVideoForCurrentSong() {
        // Prevent multiple simultaneous preloads
        if (this.isLoading) {
            console.log('Already loading a song, please wait...');
            return false;
        }
        
        if (!this.currentSong) return false;
        
        // Don't preload if we already have this song preloaded
        if (this.isPreloaded && this.preloadedSong === this.currentSong) {
            console.log('Song already preloaded');
            return true;
        }
        
        this.isLoading = true;
        
        try {
            document.getElementById('result-message').innerHTML = '🔍 Loading song...';
            
            // Generate random start time for this song
            this.randomStartTime = Math.floor(Math.random() * (45 - 15 + 1)) + 15;
            console.log(`Random start time: ${this.randomStartTime} seconds`);
            
            // Search for the song on YouTube
            const searchQuery = encodeURIComponent(`${this.currentSong.title} ${this.currentSong.artist} audio`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${this.YOUTUBE_API_KEY}&maxResults=1`
            );
            
            if (!response.ok) {
                throw new Error('YouTube API error');
            }
            
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                document.getElementById('result-message').innerHTML = '❌ No videos found for this song';
                this.isLoading = false;
                return false;
            }

            // Store the video ID
            this.preloadedVideoId = data.items[0].id.videoId;
            this.preloadedSong = this.currentSong;
            
            console.log(`Preloaded: ${this.currentSong.title} - Video ID: ${this.preloadedVideoId}`);
            
            // Create hidden player container
            await this.createHiddenPlayer(this.preloadedVideoId);
            
            this.isPreloaded = true;
            document.getElementById('result-message').innerHTML = '✅ Song loaded! Press Play to listen';
            this.isLoading = false;
            return true;
            
        } catch (e) {
            console.error('Preload failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Could not load song';
            this.isLoading = false;
            return false;
        }
    }
    
    // New method: Create hidden player for preloading
    async createHiddenPlayer(videoId) {
        return new Promise((resolve) => {
            // Create or get player container
            let playerContainer = document.getElementById('youtube-player-container');
            if (!playerContainer) {
                playerContainer = document.createElement('div');
                playerContainer.id = 'youtube-player-container';
                playerContainer.style.position = 'absolute';
                playerContainer.style.width = '0';
                playerContainer.style.height = '0';
                playerContainer.style.overflow = 'hidden';
                document.body.appendChild(playerContainer);
            }
            
            // Clear previous player
            playerContainer.innerHTML = '';
            
            // Create new player div
            const playerDiv = document.createElement('div');
            playerDiv.id = 'youtube-player';
            playerContainer.appendChild(playerDiv);
            
            // Check if API is ready
            if (window.YT && window.YT.Player) {
                this.createPlayerInstance(playerDiv, videoId, resolve);
            } else {
                // Wait for API to load
                const checkAPI = setInterval(() => {
                    if (window.YT && window.YT.Player) {
                        clearInterval(checkAPI);
                        this.createPlayerInstance(playerDiv, videoId, resolve);
                    }
                }, 100);
            }
        });
    }
    
    // New method: Create player instance without playing
    createPlayerInstance(playerDiv, videoId, resolve) {
        // Destroy existing player if it exists
        if (this.youtubePlayer && this.youtubePlayer.destroy) {
            this.youtubePlayer.destroy();
        }
        
        // Create new player (cued but not playing)
        this.youtubePlayer = new YT.Player(playerDiv.id, {
            height: '0',
            width: '0',
            videoId: videoId,
            playerVars: {
                autoplay: 0,  // Don't autoplay
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
                showinfo: 0,
                start: this.randomStartTime // Cue at the random start time
            },
            events: {
                'onReady': (event) => {
                    console.log('Player ready, video cued at', this.randomStartTime);
                    // Just cue the video, don't play
                    event.target.cueVideoById({
                        videoId: videoId,
                        startSeconds: this.randomStartTime
                    });
                    resolve(true);
                },
                'onStateChange': (event) => {
                    if (event.data === YT.PlayerState.CUED) {
                        console.log('Video cued and ready to play at', this.randomStartTime);
                    } else if (event.data === YT.PlayerState.PLAYING) {
                        console.log('Video playing at position:', this.randomStartTime);
                    } else if (event.data === YT.PlayerState.ENDED) {
                        console.log('Video ended');
                    }
                },
                'onError': (event) => {
                    console.error('Player error:', event.data);
                    document.getElementById('result-message').innerHTML = '⚠️ Playback error occurred';
                    this.isPreloaded = false;
                    resolve(false);
                }
            }
        });
    }
    
    // Updated: Play the preloaded video with proper error handling
    playPreloadedVideo() {
        // Check if we have a player and preloaded video
        if (!this.youtubePlayer || !this.preloadedVideoId) {
            console.log('No preloaded video, loading now...');
            this.playCurrentSong(); // Recursively call with fallback
            return;
        }
        
        try {
            // Check if player is in a valid state
            const playerState = this.youtubePlayer.getPlayerState();
            
            // If player is not ready or has error, reload
            if (playerState === -1 || playerState === 5) { // -1: unstarted, 5: video cued
                console.log('Player state:', playerState);
            }
            
            const duration = 15; // Play for 15 seconds
            
            console.log(`Playing preloaded video from ${this.randomStartTime} seconds`);
            
            // Seek to start time and play
            this.youtubePlayer.seekTo(this.randomStartTime, true);
            this.youtubePlayer.playVideo();
            
            // Update UI
            document.getElementById('result-message').innerHTML = '🔊 Playing...';
            
            // Clear any existing timeout
            if (this.playbackTimeout) {
                clearTimeout(this.playbackTimeout);
            }
            
            // Set timer to stop playback after duration
            this.playbackTimeout = setTimeout(() => {
                if (this.youtubePlayer && this.youtubePlayer.stopVideo) {
                    this.youtubePlayer.stopVideo();
                    console.log('Playback finished');
                    
                    // Recue the video for next play at the same start time
                    this.youtubePlayer.cueVideoById({
                        videoId: this.preloadedVideoId,
                        startSeconds: this.randomStartTime
                    });
                    
                    document.getElementById('result-message').innerHTML = '⏸️ Stopped';
                }
            }, duration * 1000);
            
        } catch (e) {
            console.error('Playback failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Playback failed, retrying...';
            
            // Reset preload state and try again
            this.isPreloaded = false;
            this.preloadVideoForCurrentSong().then(() => {
                // Try playing again after preload
                setTimeout(() => this.playPreloadedVideo(), 1000);
            });
        }
    }
    
    // Modified: Original playYouTube method (keep as fallback)
    async playYouTube(song) {
        console.log("Fallback: Playing song with YouTube API:", song);
        if(!song || !song.title) return false;

        try {
            document.getElementById('result-message').innerHTML = '🔍 Searching for song...';

            const searchQuery = encodeURIComponent(`${song.title} ${song.artist} audio`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${this.YOUTUBE_API_KEY}&maxResults=1`
            );
            
            if (!response.ok) {
                throw new Error('YouTube API error');
            }
            
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                document.getElementById('result-message').innerHTML = '❌ No videos found';
                return false;
            }

            const videoId = data.items[0].id.videoId;
            
            // Play immediately with random start time
            this.playVideoWithIframe(videoId, song);
            return true;
            
        } catch (e) {
            console.error('YouTube API failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Could not play this song. Try another!';
            return false;
        }
    }
    
    playVideoWithIframe(videoId, song) {
        // Use the current random start time
        const startTime = this.randomStartTime;
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${startTime + 15}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&showinfo=0`;

        const playerDiv = document.createElement('div');
        playerDiv.innerHTML = `
            <iframe 
                width="0" 
                height="0"
                src="${embedUrl}"
                frameborder="0"
                allow="autoplay; encrypted-media"
                style="position:absolute; width:0; height:0; border:0; display:none;">
            </iframe>
        `;
        document.body.appendChild(playerDiv);

        setTimeout(() => {
            playerDiv.remove();
        }, 20000);
    }
    
    // Stop current playback
    stopPlayback() {
        if (this.playbackTimeout) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        
        if (this.youtubePlayer && this.youtubePlayer.stopVideo) {
            this.youtubePlayer.stopVideo();
        }
    }
    
    // Modified: Start new round with preloading
    startNewRound() {
        this.replaysLeft = 1;
        this.isPreloaded = false; // Reset preload status for new round

        document.getElementById('replay-snippet').disabled = false;
        document.getElementById('title-guess').value = '';
        document.getElementById('artist-guess').value = '';
        document.getElementById('result-message').innerHTML = 'Loading song...';

        document.getElementById('round-number').textContent = this.currentRound;

        let difficulty;
        switch(this.currentRound) {
            case 1: difficulty = 'easy'; break;
            case 2: difficulty = 'medium'; break;
            case 3: difficulty = 'hard'; break;
            case 4: difficulty = 'expert'; break;
        }

        document.getElementById('difficulty').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

        // Get random song
        const songs = songDatabase[difficulty];
        this.currentSong = songs[Math.floor(Math.random() * songs.length)];

        console.log('Selected song:', this.currentSong);

        document.getElementById('current-player').innerHTML = `${this.players[this.currentPlayerIndex].name}'s Turn`;
        
        // Preload the video immediately
        this.preloadVideoForCurrentSong();
    }
    
    // Modified: Play current song with loading state check
    async playCurrentSong() {
        if(!this.currentSong) return;

        // Stop any currently playing audio
        this.stopPlayback();

        // Check if we're still loading
        if (this.isLoading) {
            document.getElementById('result-message').innerHTML = '⏳ Still loading, please wait...';
            
            // Wait for loading to complete and try again
            const checkLoading = setInterval(() => {
                if (!this.isLoading) {
                    clearInterval(checkLoading);
                    this.playCurrentSong();
                }
            }, 500);
            return;
        }

        if (this.isPreloaded && this.preloadedVideoId && this.youtubePlayer) {
            // Play the preloaded video
            this.playPreloadedVideo();
        } else {
            // Fallback: load and play immediately
            document.getElementById('result-message').innerHTML = 'Loading song...';
            const success = await this.playYouTube(this.currentSong);
            if(!success) { 
                document.getElementById('result-message').innerHTML = 'Could not play this song. Try another!';
            }
        }
        
        // Decrement replays if this was a replay
        if (this.replaysLeft > 0) {
            this.replaysLeft--;
            if (this.replaysLeft === 0) {
                document.getElementById('replay-snippet').disabled = true;
            }
        }
    }
    
    // Update replay method to work with preloading
    handleReplay() {
        if (this.replaysLeft > 0) {
            this.playCurrentSong();
        }
    }
    
    // Rest of your existing methods (setupEventListeners, processTextGuess, etc.)
    // ... (keep all your other methods exactly as they were)
    
    setupEventListeners() {
        console.log("Setting up event listeners...");
        
        // Store reference to this instance
        const self = this;

        // Start game button
        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Starting game...');
                self.showScreen('player-screen');
            });
        }

        // Back button on test screen
        const backBtn = document.getElementById('back-button');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                self.showScreen('landing-screen');
            });
        }

        document.querySelectorAll('.player-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                const numPlayers = parseInt(e.target.dataset.players);
                self.createPlayerInputs(numPlayers);
                document.getElementById('confirm-players').disabled = false;
            });
        });

        document.getElementById('confirm-players').addEventListener('click', () => {
            self.players = [];
            for (let i = 1; i <= document.querySelectorAll('.player-name-input').length; i++) {
                const nameInput = document.getElementById('player' + i);
                self.players.push({
                    name: nameInput.value || 'Player ' + i,
                    score: 0
                });
            }
            self.showScreen('playlist-screen');
        });
        
        document.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                self.selectedPlaylist = e.currentTarget.dataset.playlist;
                document.getElementById('start-round').disabled = false;
            });
        });

        document.getElementById('start-round').addEventListener('click', () => {
            self.startNewRound();
            self.showScreen('game-screen');
        });

        document.getElementById('play-snippet').addEventListener('click', () => {
            self.playCurrentSong();
        });

        document.getElementById('replay-snippet').addEventListener('click', () => {
            self.handleReplay();
        });

        document.getElementById('voice-input').addEventListener('click', () => {
            if(self.recognition) {
                self.recognition.start();
            } else{
                alert('Voice recognition not supported in this browser.');
            }
        });

        document.getElementById('submit-guess').addEventListener('click', () => {
            const titleGuess = document.getElementById('title-guess').value;
            const artistGuess = document.getElementById('artist-guess').value;
            self.processTextGuess(titleGuess, artistGuess);
        });
    }
    
    processTextGuess(title, artist) {
        if(!this.currentSong) return;

        // Stop any playing audio
        this.stopPlayback();

        let points = 0;
        let message = '';

        const titleCorrect = title.toLowerCase().includes(this.currentSong.title.toLowerCase()) || this.currentSong.title.toLowerCase().includes(title.toLowerCase());
        const artistCorrect = artist.toLowerCase().includes(this.currentSong.artist.toLowerCase()) || this.currentSong.artist.toLowerCase().includes(artist.toLowerCase());

        if (titleCorrect && artistCorrect) {
            points = 20;
            message = 'Perfect! +20 Points';
        } else if (titleCorrect || artistCorrect) {
            points = 10;
            message = `Good! +10 Points (${this.currentSong.title} by ${this.currentSong.artist})`;
        } else {
            points = 0;
            message = `Not this time. It was ${this.currentSong.title} by ${this.currentSong.artist}`;
        }

        this.players[this.currentPlayerIndex].score += points;

        document.getElementById('result-message').innerHTML = message;

        setTimeout(() => this.nextTurn(), 3000);
    }

    getRandomStartTime() {
        return Math.floor(Math.random() * (45 - 15 + 1)) + 15;
    }

    processVoiceGuess(transcript) {
        const titleMatch = transcript.toLowerCase().includes(this.currentSong.title.toLowerCase());
        const artistMatch = transcript.toLowerCase().includes(this.currentSong.artist.toLowerCase());
        
        this.processTextGuess(
            titleMatch ? this.currentSong.title : '',
            artistMatch ? this.currentSong.artist : ''
        );
    }

    nextTurn() {
        // Move to next player
        this.currentPlayerIndex++;
        
        // Check if round is complete
        if (this.currentPlayerIndex >= this.players.length) {
            this.currentPlayerIndex = 0;
            this.currentRound++;
            
            if (this.currentRound > this.maxRounds) {
                this.endGame();
                return;
            }
        }
        
        // Start next turn (this will preload the next song)
        this.startNewRound();
    }   

    endGame() {
        // Stop any playing audio
        this.stopPlayback();
        
        // Sort players by score
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        
        // Display final scores
        const scoresHtml = sorted.map((p, i) => `
            <div class="score-row">
                <span>${i+1}. ${p.name}</span>
                <span>${p.score} points</span>
            </div>
        `).join('');
        
        document.getElementById('final-scores').innerHTML = scoresHtml;
        
        // Announce winner
        document.getElementById('winner-announcement').innerHTML = 
            `Winner: ${sorted[0].name} with ${sorted[0].score} points!`;
        
        this.showScreen('scoreboard-screen');
    }

    createPlayerInputs(numPlayers) {
        const container = document.getElementById('player-names');
        container.innerHTML = '';
        
        for (let i = 1; i <= numPlayers; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'player' + i;
            input.className = 'player-name-input';
            input.placeholder = 'Player ' + i + ' name';
            container.appendChild(input);
        }
    }

    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            // Store reference to this instance for callbacks
            const self = this;
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                document.getElementById('voice-status').textContent = '🎤 Heard: "' + transcript + '"';
                self.processVoiceGuess(transcript);
            };
            
            this.recognition.onstart = () => {
                document.getElementById('voice-status').classList.add('listening');
                document.getElementById('voice-status').textContent = '🎤 Listening...';
            };
            
            this.recognition.onend = () => {
                document.getElementById('voice-status').classList.remove('listening');
            };
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
