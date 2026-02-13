// game.js - FIXED token handling
console.log("game.js loading...");

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
        
        this.setupEventListeners();
        this.initVoiceRecognition();
        this.useYouTubeFallback = true;    
    }
    
    async playYouTube(song) {
        console.log("Running YouTube");
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
            console.error('YouTube failed:', e);
            return false;
        }
    }

    setupEventListeners() {
        console.log("Setting up event listeners...");

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

        document.querySelectorAll('.player-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                const numPlayers = parseInt(e.target.dataset.players);
                this.createPlayerInputs(numPlayers);
                document.getElementById('confirm-players').disabled = false;
            });
        });

        document.getElementById('confirm-players').addEventListener('click', () => {
            this.players = [];
            for (let i = 1; i <= document.querySelectorAll('.player-name-input').length; i++) {
                const nameInput = document.getElementById('player' + i);
                this.players.push({
                    name: nameInput.value || 'Player ' + i,
                    score: 0
                });
            }
            this.showScreen('playlist-screen');
        });
        
        document.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
                e.currentTarget.classList = e.currentTarget.dataset.playlist;
                document.getElementById('start-round').disabled = false;
            });
        });

        document.getElementById('start-round').addEventListener('click', () => {
            this.startNewRound();
            this.showScreen('game-screen');
        });

        document.getElementById('play-snippet').addEventListener('click', () => {
            const success = this.playYoutube(this.currentSong);
            if(!success) { 
                document.getElementById('result-message').innerHTML = 'Could not play this song. Try another!';
            }
        });

        document.getElementById('replay-snippet').addEventListener('click', () => {
            if(self.replaysLeft > 0) {
                this.playCurrentSong();
                self.replaysLeft--;
                if (self.replaysLeft === 0) {
                    document.getElementById('replay-snippet').disabled = true;
                }
            }
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
            const artistsGuess = document.getElementById('artist-guess').value;
            this.processTextGuess(titleGuess, artistGuess);
        });
    }
    
    startNewRound() {
        this.replaysLeft = 1;

        document.getElementById('replay-snippet').disabled = false;
        document.getElementById('title-guess').value = '';
        document.getElementById('artist-guess').value = '';
        document.getElementById('result-message').innerHTML = '';

        document.getElementById('round-number').textContent = this.currentRound;

        let difficulty;
        switch(this.currentRound) {
            case 1: difficulty = 'easy'; break;
            case 2: difficulty = 'medium'; break;
            case 3: difficulty = 'hard'; break;
            case 4: difficulty = 'expert'; break;
        }

        document.getElementById('difficulty').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

        const songs = songDatabase[difficulty];
        self.currentSong = songs[Math.floor(Math.random() * songs.length)];
        console.log(self.currentSong);

        document.getElementById('current-player').innerHTML = `${this.players[this.currentPlayerIndex].name}'s Turn`;
    }

    processTextGuess(title, artist) {
        if(!self.currentSong) return;

        let points = 0;
        let message = '';

        const titleCorrect = title.toLowerCase().includes(self.currentSong.title.toLowerCase()) || self.currentSong.title.toLowerCase().includes(title.toLowerCase());
        const artistCorrect = artist.toLowerCase().includes(self.currentSong.artist.toLowerCase()) || self.currentSong.artist.toLowerCase().includes(artist.toLowerCase());

        if (titleCorrect && artistCorrect) {
            points = 20;
            message = 'Perfect! +20 Points';
        } else if (titleCorrect || artistCorrect) {
            points = 10;
            message = `Good! +10 Points (${self.currentSong.title} by ${self.currentSong.artist}`;
        } else {
            points = 0;
            message = `Not this time. It was ${self.currentSong.title} by ${self.currentSong.artist}`;
        }

        this.players[self.currentPlayerIndex].score += points;

        document.getElementById('result-message').innerHTML = message;

        setTimeout(() => this.nextTurn(), 3000);
    }

    processVoiceGuess(transcript) {
        const titleMatch = transcript.toLowerCase().includes(self.currentSong.title.toLowerCase());
        const artistMatch = transcript.toLowerCase().includes(self.currentSong.artist.toLowerCase());
        
        this.processTextGuess(
            titleMatch ? self.currentSong.title : '',
            artistMatch ? self.currentSong.artist : ''
        );
    }

     nextTurn() {
        // Move to next player
        self.currentPlayerIndex++;
        
        // Check if round is complete
        if (self.currentPlayerIndex >= this.players.length) {
            self.currentPlayerIndex = 0;
            self.currentRound++;
            
            if (self.currentRound > this.maxRounds) {
                this.endGame();
                return;
            }
        }
        
        // Start next turn
        this.startNewRound();
    }   

    endGame() {
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
            self.recognition = new webkitSpeechRecognition();
            self.recognition.continuous = false;
            self.recognition.interimResults = false;
            self.recognition.lang = 'en-US';
            
            self.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                document.getElementById('voice-status').textContent = '🎤 Heard: "' + transcript + '"';
                this.processVoiceGuess(transcript);
            };
            
            self.recognition.onstart = () => {
                document.getElementById('voice-status').classList.add('listening');
                document.getElementById('voice-status').textContent = '🎤 Listening...';
            };
            
            self.recognition.onend = () => {
                document.getElementById('voice-status').classList.remove('listening');
            };
        }
    }

    async playCurrentSong() {
        if(!this.currentSong) return;

        if (this.useYouTubeFallback) {
            const success = await this.playYoutube(this.currentSong);
            if(!success) { 
                document.getElementById('result-message').innerHTML = 'Could not play this song. Try another!';
            }
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
