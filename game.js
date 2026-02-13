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
        if (!this.currentSong) return false;
        
        // Don't preload if we already have this song preloaded
        if (this.isPreloaded && this.preloadedSong === this.currentSong) {
            console.log('Song already preloaded');
            return true;
        }
        
        try {
            document.getElementById('result-message').innerHTML = '🔍 Loading song...';
            
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
                return false;
            }

            // Store the video ID
            this.preloadedVideoId = data.items[0].id.videoId;
            this.preloadedSong = this.currentSong;
            this.isPreloaded = true;
            
            console.log(`Preloaded: ${this.currentSong.title} - Video ID: ${this.preloadedVideoId}`);
            
            // Create hidden player container but don't play yet
            this.createHiddenPlayer(this.preloadedVideoId);
            
            document.getElementById('result-message').innerHTML = '✅ Song loaded! Press Play to listen';
            return true;
            
        } catch (e) {
            console.error('Preload failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Could not load song';
            return false;
        }
    }
    
    // New method: Create hidden player for preloading
    createHiddenPlayer(videoId) {
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
        
        // Create YouTube player (but don't autoplay)
        if (window.YT && window.YT.Player) {
            this.createPlayerInstance(playerDiv, videoId);
        } else {
            // Wait for API to load
            const checkAPI = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(checkAPI);
                    this.createPlayerInstance(playerDiv, videoId);
                }
            }, 100);
        }
    }
    
    // New method: Create player instance without playing
    createPlayerInstance(playerDiv, videoId) {
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
                showinfo: 0
            },
            events: {
                'onReady': (event) => {
                    console.log('Player ready, video cued');
                    // Just cue the video, don't play
                    event.target.cueVideoById({
                        videoId: videoId,
                        startSeconds: this.currentSong?.startTime || 30
                    });
                },
                'onStateChange': (event) => {
                    // Optional: Handle state changes
                    if (event.data === YT.PlayerState.CUED) {
                        console.log('Video cued and ready to play');
                    }
                },
                'onError': (event) => {
                    console.error('Player error:', event.data);
                    document.getElementById('result-message').innerHTML = '⚠️ Playback error occurred';
                }
            }
        });
    }
    
    // Updated: Play the preloaded video
    playPreloadedVideo() {
        if (!this.youtubePlayer || !this.preloadedVideoId) {
            console.log('No preloaded video, loading now...');
            // Fallback: load and play immediately
            this.playYouTube(this.currentSong);
            return;
        }
        
        try {
            const startTime = this.currentSong?.startTime || 30;
            const duration = 15;
            
            console.log('Playing preloaded video');
            
            // Seek to start time and play
            this.youtubePlayer.seekTo(startTime, true);
            this.youtubePlayer.playVideo();
            
            // Set timer to stop playback after duration
            setTimeout(() => {
                if (this.youtubePlayer && this.youtubePlayer.stopVideo) {
                    this.youtubePlayer.stopVideo();
                    console.log('Playback finished');
                    
                    // Recue the video for next play
                    this.youtubePlayer.cueVideoById({
                        videoId: this.preloadedVideoId,
                        startSeconds: startTime
                    });
                }
            }, duration * 1000);
            
            document.getElementById('result-message').innerHTML = '🔊 Playing...';
            
        } catch (e) {
            console.error('Playback failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Playback failed';
            
            // Fallback to regular method
            this.playYouTube(this.currentSong);
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
            
            // Play immediately
            this.playVideoWithIframe(videoId, song);
            return true;
            
        } catch (e) {
            console.error('YouTube API failed:', e);
            document.getElementById('result-message').innerHTML = '⚠️ Could not play this song. Try another!';
            return false;
        }
    }
    
    playVideoWithIframe(videoId, song) {
        // Same as before but without preloading
        const startTime = song.startTime || 30;
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
    
    // Modified: Play current song using preloaded video
    async playCurrentSong() {
        if(!this.currentSong) return;

        // Stop any currently playing audio
        this.stopPlayback();

        if (this.isPreloaded && this.preloadedVideoId) {
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
        if (this.replaysLeft < 1) {
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
            this.replaysLeft--;
            if (this.replaysLeft === 0) {
                document.getElementById('replay-snippet').disabled = true;
            }
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
                e.currentTarget.classList = e.currentTarget.dataset.playlist;
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
