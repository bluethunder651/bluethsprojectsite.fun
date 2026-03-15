class MusicQuizGame{
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
        this.isLoading = false;
        this.randomStartTime = 15;
        this.snippetDuration = 10; // Play 10 seconds of the song
        this.hasSeekedThisPlay = false;
        this.customPlaylist = null;
        this.isCustomPlaylist = false;
        this.website = 'https://julia.bluethsprojectsite.fun'
        this.currentAudio = null;
        
        this.YOUTUBE_API_KEY = 'AIzaSyDejNIPtcOOfuvrCNqorr2s1Yh_hEpFOc8'; 

        this.setupEventListeners();
        this.initVoiceRecognition();
    }

    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
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

    setupEventListeners() {
        console.log("Setting up event listeners...");
        
        const self = this;

        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Starting game...');
                self.showScreen('player-screen');
            });
        }

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

        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                this.difficulty = e.target.dataset.difficulty
                document.getElementById('confirm-difficulty').disabled = false;
            });
        });

        document.getElementById('confirm-difficulty').addEventListener('click', () => {
            self.showScreen('playlist-screen')
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
            self.showScreen('difficulty-screen');
        });
        
        document.querySelectorAll('.playlist-card').forEach(card => {
            card.addEventListener('click', (e) => {
                document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
                e.currentTarget.classList.add('selected');
                this.selectedPlaylist = e.currentTarget.dataset.playlist;
                document.getElementById('start-round').disabled = false;
                
                console.log('Selected playlist:', this.selectedPlaylist);
            });
        });

        document.getElementById('start-round').addEventListener('click', () => {
            self.startNewRound();
            self.showScreen('game-screen');
        });

        document.getElementById('play-snippet').addEventListener('click', () => {
            self.playCurrentSong();
            document.getElementById('play-snippet').disabled = true;
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

        document.getElementById('play-again').addEventListener('click', () => {
            this.currentRound = 1;

            self.startNewRound();
            self.showScreen('game-screen');
        });

        document.getElementById('new-game').addEventListener('click', () => {
            window.location.reload();
        });

        const loadPlaylistBtn = document.getElementById('load-playlist');
        if (loadPlaylistBtn){
            loadPlaylistBtn.addEventListener('click', () => {
                const url = document.getElementById('youtube-playlist-url').value();
                if (url) {
                    this.loadCustomPlaylist(url);
                }
            });
        }
    }

    async playCurrentSong(){
        if(!this.currentSong) return;

        this.stopPlayback();

        if(this.isLoading){
            document.getElementById('dev-message').innerHTML = 'Loading...';
            return;
        }

        this.randomStartTime = this.getRandomStartTime();

        document.getElementById('dev-message').innerHTML = 'Getting audio...';
        document.getElementById('play-snippet').disabled = true;
        document.getElementById('replay-snippet').disabled = true;

        try{
            const audioUrl = await this.getAudioFromServer(this.currentSong);

            if(audioUrl){
                this.playLocalAudio(audioUrl);
            } else {
                await this.playYoutube(this.currentSong);
            }
        } catch (e){
            console.error('Failed to get audio: ', e);
            document.getElementById('dev-message').innerHTML = 'Could not load audio.';
        }
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

    async getAudioFromServer(song){
        const songId = this.generateSongId(song);

        const response = await fetch(`${this.website}/api/music/audio`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: song.title,
                artist: song.artist,
                songId: songId,
                startTime: this.randomStartTime,
                duration: this.snippetDuration,
            })
        });

        if(response.ok){
            const data = await response.json();
            return data.audioUrl;
        }

        return null;
    }

    playLocalAudio(audioUrl){
        if(this.currentAudio){
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        const audio = new Audio();
        const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${this.website}${audioUrl}`;
        audio.src = audioUrl;
        audio.volume = 1.0;

        audio.onerror = (e) => {
            console.error('Audio error: ', e);
            document.getElementById('dev-message').innerHTML = 'Playback failed';
            document.getElementById('play-snippet').disabled = false;
        }

        const playPromise = audio.play();

        if(playPromise !== undefined){
            playPromise.catch(error => {
                console.error('Playback failed: ', error);
                document.getElementById('dev-message').innerHTML = 'Playback failed';
                document.getElementById('play-snippet').disabled = false;
            });
        }
        
        this.currentAudio = audio;

        setTimeout(() => {
            if(this.currentAudio){
                this.currentAudio.pause();
                this.currentAudio = null;
            }

            document.getElementById('dev-message').innerHTML = 'Playback finished.';
            if(this.replaysLeft > 0){
                document.getElementById('replay-snippet').disabled = false;
            }
        }, this.snippetDuration * 1000);

        document.getElementById('dev-message').innerHTML = 'Playing...'

    }

    stopPlayback(){
        if(this.currentAudio){
            this.currentAudio.pause();
            this.currentAudio = null;
        }

        if(this.youtubePlayer){
            try{
                if(this.youtubePlayer.pauseVideo){
                    this.youtubePlayer.pauseVideo();
                }
            }catch (e) {
                console.log("Error stopping YouTube: ", e);
            }
        }
    }

    generateSongId(song){
        return `${song.artist}_${song.title}`.replace(/[^a-zA-Z0-9]/g, '_');
    }

    getRandomStartTime() {
        return Math.floor(Math.random() * (45 - 15 + 1)) + 15;
    }

    startNewRound() {
        this.replaysLeft = 1;
        this.isPreloaded = false;

        document.getElementById('replay-snippet').disabled = false;
        document.getElementById('play-snippet').disabled = false;
        document.getElementById('title-guess').value = '';
        document.getElementById('artist-guess').value = '';
        document.getElementById('dev-message').innerHTML = 'Loading song...';
        document.getElementById('voice-status').textContent = '🎤';

        document.getElementById('round-number').textContent = this.currentRound;

        let difficulty;
        if (this.difficulty === "progressive"){
            switch(this.currentRound) {
                case 1: difficulty = 'easy'; break;
                case 2: difficulty = 'medium'; break;
                case 3: difficulty = 'hard'; break;
                case 4: difficulty = 'expert'; break;
            }
        } else if(this.difficulty === "progressive-e"){
            switch(this.currentRound){
                case 1: difficulty = 'easy'; break;
                case 2: difficulty = 'easy'; break;
                case 3: difficulty = 'medium'; break;
                case 4: difficulty = 'medium'; break;
            }
        } else {
            difficulty = this.difficulty
        }
        document.getElementById('difficulty').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

        let availableSongs;

        if(this.isCustomPlaylist && this.customPlaylist){
            availableSongs = this.customPlaylist;
            document.getElementById('difficulty').textContent = 'Custom Playlist';
        }else{
            availableSongs = songDatabase[difficulty];

            if (this.selectedPlaylist !== 'family') {
                switch(this.selectedPlaylist) {
                    case 'pop':
                        availableSongs = availableSongs.filter(song => song.genre.toLowerCase() === 'pop');
                        break;
                    case 'rock':
                        availableSongs = availableSongs.filter(song => song.genre.toLowerCase() === 'rock');
                        break;
                    case 'classical':
                        availableSongs = availableSongs.filter(song => song.genre.toLowerCase() === 'classical');
                    case '80s':
                        availableSongs = availableSongs.filter(song => {
                            const year = parseInt(song.year);
                            return year >= 1980 && year < 1990;
                        });
                        break;
                    case '90s':
                        availableSongs = availableSongs.filter(song => {
                            const year = parseInt(song.year);
                            return year >= 1990 && year < 2000;
                        });
                        break;
                    case '00s':
                        availableSongs = availableSongs.filter(song => {
                            const year = parseInt(song.year);
                            return year >= 2000 && year < 2010;
                        });
                        break;
                    case '10s':
                        availableSongs = availableSongs.filter(song => {
                            const year = parseInt(song.year);
                            return year >= 2010 && year < 2020;
                        });
                        break;
                    case '20s':
                        availableSongs = availableSongs.filter(song => {
                            const year = parseInt(song.year);
                            return year >= 2020 && year < 2030;
                        });
                        break;
                }
            }
        }



        if (availableSongs.length === 0){ 
            console.warn(`No songs found for ${this.selectedPlaylist} playlist in ${difficulty} difficulty`);
            document.getElementById('dev-message').innerHTML = 'No songs available for this selection. Using all songs.';
            availableSongs = songDatabase[difficulty]
        }
        this.currentSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];

        document.getElementById('current-player').innerHTML = `${this.players[this.currentPlayerIndex].name}'s Turn`;
        
    }

    processVoiceGuess(transcript){
        console.log('Voice transcript: ', transcript);
        document.getElementById('voice-status').textContent = `Heard: ${transcript}`;
        document.getElementById('title-guess').value = transcript;
    }

    processTextGuess(title, artist) {
        if(!this.currentSong) return;

        this.stopPlayback();

        let points = 0;
        let message = '';
        
        const fuseOptions = {
            includeScore: true,
            threshold: 0.4,
            ignoreLocation: true,
            ignoreFieldNorm: true,
            shouldSort: true,
            minMatchCharLength: 2
        };
        
        const currentArtists = this.currentSong.artist.split(/[&,]+|\sand\s|\sfeat\.?\s|\sft\.?\s/i).map(a => a.trim());
        console.log('Current artists:', currentArtists);
        
        const cleanTitleGuess = title.trim().toLowerCase();
        const cleanArtistGuess = artist.trim().toLowerCase();
        
        let titleMatch = false;
        let titleScore = 1;
        
        if (cleanTitleGuess) {
            const titleFuse = new Fuse([this.currentSong.title], fuseOptions);
            const titleResults = titleFuse.search(cleanTitleGuess);
            if (titleResults.length > 0) {
                titleMatch = true;
                titleScore = titleResults[0].score;
                console.log(`Title fuzzy match score: ${titleScore}`);
            }
            
            if (!titleMatch) {
                titleMatch = this.checkPartialMatch(cleanTitleGuess, this.currentSong.title);
            }
            
            if (!titleMatch) {
                titleMatch = this.checkNormalizedMatch(cleanTitleGuess, this.currentSong.title);
            }
        }
        
        let artistMatch = false;
        let artistScore = 1;
        let matchedArtist = '';
        
        if (cleanArtistGuess) {
            for (const currentArtist of currentArtists) {
                const artistFuse = new Fuse([currentArtist], fuseOptions);
                const artistResults = artistFuse.search(cleanArtistGuess);
                
                if (artistResults.length > 0) {
                    artistMatch = true;
                    artistScore = artistResults[0].score;
                    matchedArtist = currentArtist;
                    console.log(`Artist fuzzy match for "${currentArtist}" with score: ${artistScore}`);
                    break;
                }
                
                if (!artistMatch) {
                    if (this.checkPartialMatch(cleanArtistGuess, currentArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist partial match for "${currentArtist}"`);
                        break;
                    }
                }
                
                if (!artistMatch) {
                    if (this.checkNormalizedMatch(cleanArtistGuess, currentArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist normalized match for "${currentArtist}"`);
                        break;
                    }
                }
            }
            
            if (!artistMatch) {
                for (const currentArtist of currentArtists) {
                    const normalizedArtist = this.normalizeText(currentArtist);
                    const normalizedGuess = this.normalizeText(cleanArtistGuess);
                    
                    if (normalizedGuess.includes(normalizedArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist contained in guess for "${currentArtist}"`);
                        break;
                    }
                    
                    const artistWords = currentArtist.toLowerCase().split(/\s+/);
                    for (const word of artistWords) {
                        if (word.length > 3 && cleanArtistGuess.includes(word)) {
                            artistMatch = true;
                            matchedArtist = currentArtist;
                            console.log(`Artist word "${word}" found in guess`);
                            break;
                        }
                    }
                    if (artistMatch) break;
                }
            }
        }
        
        if (titleMatch && artistMatch) {
            points = 20;
            message = `Perfect! +20 Points (${this.currentSong.title} by ${this.currentSong.artist})`;
            if (currentArtists.length > 1 && matchedArtist) {
                message = `Perfect! +20 Points (${this.currentSong.title} by ${this.currentSong.artist} - you got "${matchedArtist}" right!)`;
            }
        } else if (titleMatch || artistMatch) {
            points = 10;
            message = `Good! +10 Points (${this.currentSong.title} by ${this.currentSong.artist})`;
            if (artistMatch && !titleMatch) {
                message = `Good! +10 Points (You got the artist${matchedArtist ? ' "' + matchedArtist + '"' : ''} right! It was ${this.currentSong.title} by ${this.currentSong.artist})`;
            } else if (titleMatch && !artistMatch) {
                message = `Good! +10 Points (You got the title right! It was ${this.currentSong.title} by ${this.currentSong.artist})`;
            }
        } else {
            points = 0;
            message = `Not this time. It was ${this.currentSong.title} by ${this.currentSong.artist}`;
        }
        
        this.players[this.currentPlayerIndex].score += points;
        document.getElementById('result-message').innerHTML = message;
        
        setTimeout(() => this.nextTurn(), 5000);
    }

    nextTurn() {
        this.currentPlayerIndex++;
        
        if (this.currentPlayerIndex >= this.players.length) {
            this.currentPlayerIndex = 0;
            this.currentRound++;
            
            if (this.currentRound > this.maxRounds) {
                this.endGame();
                return;
            }
        }
        
        this.startNewRound();
    }   

    endGame() {
        this.stopPlayback();
        
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        
        const scoresHtml = sorted.map((p, i) => `
            <div class="score-row">
                <span>${i+1}. ${p.name}</span>
                <span>${p.score} points</span>
            </div>
        `).join('');
        
        document.getElementById('final-scores').innerHTML = scoresHtml;
        
        document.getElementById('winner-announcement').innerHTML = 
            `Winner: ${sorted[0].name} with ${sorted[0].score} points!`;
        
        this.showScreen('scoreboard-screen');
    }    

    async playYouTube(song) {
        console.log("Fallback: Playing song with YouTube API:", song);
        if(!song || !song.title) return false;

        try {
            // Generate random start time if not set
            if (!this.randomStartTime) {
                this.randomStartTime = this.getRandomStartTime();
            }
            
            document.getElementById('dev-message').innerHTML = '🔍 Searching for song...';

            const searchQuery = encodeURIComponent(`${song.title} ${song.artist} audio`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${this.YOUTUBE_API_KEY}&maxResults=1`
            );
            
            if (!response.ok) {
                throw new Error('YouTube API error');
            }
            
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                document.getElementById('dev-message').innerHTML = '❌ No videos found';
                return false;
            }

            const videoId = data.items[0].id.videoId;
            
            // Play with random start and end times
            this.playVideoWithIframe(videoId, song);
            return true;
            
        } catch (e) {
            console.error('YouTube API failed:', e);
            document.getElementById('dev-message').innerHTML = '⚠️ Could not play this song. Try another!';
            return false;
        }
    }

}

const game = new MusicQuizGame();