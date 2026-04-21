class MusicQuizGame{
    constructor() {        
        this.players = [];
        this.currentPlayerIndex = 0;
        this.currentRound = 1;
        this.maxRounds = 4;
        this.selectedPlaylist = 'family';
        this.currentSong = null;
        this.replaysLeft = 1;
        this.deviceId = null;
        this.token = null;
        this.tokenExpiry = null;
        this.useYouTubeFallback = true;
        this.recognition = null;
        this.youtubePlayer = null;
        this.playerReady = false;
        this.preloadedVideoId = null;
        this.preloadedSong = null;
        this.isPreloaded = false;
        this.isLoading = false;
        this.randomStartTime = 15;
        this.snippetDuration = 15;
        this.hasSeekedThisPlay = false;
        this.customPlaylist = null;
        this.isCustomPlaylist = false;
        this.artistPlaylist = null;
        this.isArtistPlaylist = false;
        this.website = 'https://julia.bluethsprojectsite.fun'
        this.currentAudio = null;
        this.retryAttempts = 0;
        this.maxRetryAttempts = 2;
        this.playedSongs = [];
        this.maxRounds = 4;
        this.playlist = [];
        this.nextSongURL = '';
        this.currentIndex = 0;
        this.gameCode = '';
        this.pairedGameCode = '';
        this.pairedDevice = false;
        this.sentCode = false;

        this.socket = io(this.website, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
        })
    
        this.setupEventListeners();
        this.connectSocket();
        this.initVoiceRecognition();
    }

    initVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition){
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';

            this.recognition.maxAlternatives = 1;

            const self = this;

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                const confidence = event.results[0][0].confidence;

                console.log(`Voice recognition confidence: ${confidence}`);
                document.getElementById('voice-status').textContent = '🎤 Heard: "' + transcript + '"';
                self.processVoiceGuess(transcript);
            };

            this.recognition.onstart = () => {
                document.getElementById('voice-status').classList.add('listening');
                document.getElementById('voice-status').textContent = '🎤 Listening...';

                if(this.isMobileDevice()){
                    this.showMicrophoneIndicator(true);
                }
            };

            this.recognition.onend = () => {
                document.getElementById('voice-status').classList.remove('listening');

                if(this.isMobileDevice()){
                    this.showMicrophoneIndicator(false);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                
                let errorMessage = '🎤 ';
                switch(event.error) {
                    case 'not-allowed':
                        errorMessage += 'Microphone permission denied. Please allow microphone access.';
                        break;
                    case 'audio-capture':
                        errorMessage += 'No microphone found or microphone unavailable.';
                        break;
                    case 'network':
                        errorMessage += 'Network error. Please check your connection.';
                        break;
                    case 'aborted':
                        errorMessage += 'Voice input was aborted.';
                        break;
                    case 'no-speech':
                        errorMessage += 'No speech detected. Please try again.';
                        break;
                    default:
                        errorMessage += `Voice recognition error: ${event.error}`;
                    }
                
                document.getElementById('voice-status').textContent = errorMessage;

                setTimeout(() => {
                    if (document.getElementById('voice-status').textContent === errorMessage){
                        document.getElementById('voice-status').textContent = '🎤';
                    }
                }, 3000);
                
            };

        } else {
            console.warn('Speech recognition not supported');
            const voiceBtn = document.getElementById('voice-input');
            if(voiceBtn){
                voiceBtn.disabled = true;
                voiceBtn.title = 'Voice Recogntion not supported';
            }
            document.getElementById('voice-status').textContent = '🎤 Not supported';
        }

    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    connectSocket() {
        this.socket.on('music_code_received', (data) => {
            console.log('Code Received!')
            console.log('This.gamecode: ', this.gameCode, ", data.code: ", data.code);
            if(this.gameCode === data.code){
                this.pairedDevice = true;
                this.playlist = data.playlist;
                this.maxRounds = data.rounds;
                this.difficulty = data.difficulty;
                this.players = data.players;
                this.startNewRound();
            }
        });

        this.socket.on('music_guess_submitted', (data) => {
            if(this.gameCode === data.code){
                this.processTextGuess(data.title, data.artist);
            }
        })
    }

    showMicrophoneIndicator(isActive){
        const voiceBtn = document.getElementById('voice-input');
        if(voiceBtn){
            if (isActive){
                voiceBtn.classList.add('mic-active');
                voiceBtn.style.animation = 'pulse 1s infinite';
            } else {
                voiceBtn.classList.remove('mic-active');
                voiceBtn.style.animation = '';
            }
        }
    }

    setupEventListeners() {
        console.log("Setting up event listeners...");
        
        const self = this;

        document.addEventListener('DOMContentLoaded', async function() {
            const response = await fetch(`${self.website}/api/music/load-seen-songs`, {
                headers:{
                    'Referer': window.location.origin
                }
            })
        });

        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                console.log('Starting game...');
                self.showScreen('player-screen');
            });
        }

        const pairDeviceBtn = document.getElementById('pair-device');
        if(pairDeviceBtn){
            pairDeviceBtn.addEventListener('click', () => {
                self.generateCode();
                self.showScreen('pair-device-screen');
            })
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

        document.getElementById('youtube-playlist-url').addEventListener('input', () => {
            document.getElementById('confirm-difficulty').disabled = false;
        })

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
            self.showScreen('rounds-screen');
        });



        document.getElementById('confirm-rounds').addEventListener('click', () => {
            this.maxRounds = document.getElementById('rounds-input').value || 4;
            this.snippetDuration = document.getElementById('duration-input').value || 15;
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

        document.getElementById('start-round').addEventListener('click', async () => {
            if(Date.now() > this.tokenExpiry){
                await this.refreshToken();
                if (!this.token) return [];
            }

            self.prepareRounds();
            if(this.pairedGameCode === ''){
                self.startNewRound();
                self.showScreen('game-screen');
            } else {
                console.log('Sending out code!');
                this.sentCode = true;
                this.socket.emit('music_code_sent', {
                    token: this.token,
                    code: this.pairedGameCode,
                    playlist: this.playlist,
                    rounds: this.maxRounds,
                    difficulty: this.difficulty,
                    players: this.players
                });
                this.showScreen('game-screen');
                document.getElementById('dev-message').style.display = 'none';
                document.getElementById('album-art').style.display = 'none';
            }
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

        document.getElementById('submit-guess').addEventListener('click', async () => {
            const titleGuess = document.getElementById('title-guess').value;
            const artistGuess = document.getElementById('artist-guess').value;
            if(this.sentCode){
                if(Date.now() > this.tokenExpiry){
                    await this.refreshToken();
                    if (!this.token) return [];
                }
                this.socket.emit('music_submit_guess', {
                    token: this.token,
                    code: this.pairedGameCode,
                    title: titleGuess,
                    artist: artistGuess
                });
            } else {
                self.processTextGuess(titleGuess, artistGuess);
            }
        });

        document.getElementById('play-again').addEventListener('click', () => {
            this.currentRound = 1;
            this.currentIndex = 0;
            
            self.prepareRounds();
            self.startNewRound();
            self.showScreen('game-screen');
        });

        document.getElementById('new-game').addEventListener('click', () => {
            window.location.reload();
        });

        const loadPlaylistBtn = document.getElementById('load-playlist');
        if (loadPlaylistBtn){
            loadPlaylistBtn.addEventListener('click', () => {
                const url = document.getElementById('youtube-playlist-url').value;
                if (url) {
                    this.loadCustomPlaylist(url);
                }
            });
        }

        document.getElementById('go-home-2').addEventListener('click', () => window.location.href =  'https://bluethsprojectsite.fun');
        
        document.getElementById('confirm-pair-device-code').addEventListener('click', () => {
            this.confirmPairedDevice();
        })
    }

    async confirmPairedDevice(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        
        const response = await fetch(`${this.website}/api/local/music/check-paired-device`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                pairedCode: document.getElementById('pair-device-code').value
            })
        });

        if(response.ok){
            const data = await response.json();
            this.pairedGameCode = data.code;
            this.showScreen('player-screen');
        }
        else {
            document.getElementById('pair-device-tagline').textContent = 'Code not recognized'
        }
    }

    async generateCode(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        const response = await fetch(`${this.website}/api/local/music/pair-devices`, {
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin
            }
        });

        if (response.ok){
            const data = await response.json();
            this.gameCode = data.code;
            document.getElementById('device-code').textContent = this.gameCode;
        }
    }

    handleReplay() {
        if (this.replaysLeft > 0) {
            this.replaysLeft--;
            if (this.replaysLeft === 0) {
                document.getElementById('replay-snippet').disabled = true;
            }

            const playPromise = this.currentAudio.play();

            if(playPromise !== undefined){
                playPromise.catch(error => {
                    console.error('Playback failed: ', error);
                    document.getElementById('dev-message').innerHTML = 'Playback failed: ', error;
                    document.getElementById('play-snippet').disabled = false;
                });
            }
            
            setTimeout(() => {
                document.getElementById('dev-message').innerHTML = 'Playback finished.';
            }, this.snippetDuration * 1000);
        }
    }

    async preloadNextSong(){
        if(!this.playlist) return;
        console.log('Running preloadNextSong, this.playlist.length: ', this.playlist.length);
        let nextSong;
        if(this.currentRound < this.playlist.length){
            nextSong = this.playlist[this.currentIndex];
        } else {
            nextSong = this.playlist[0];
        }

        this.nextSongURL = await this.getAudioFromServer(nextSong);
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

        console.log('Current Round: ', this.currentRound, ', Current Index: ', this.currentIndex);

        try{
            let audioUrl = '';
            if(this.nextSongURL !== ""){
                audioUrl = this.nextSongURL;
                console.log("NextSongURL is not null, sending: ", audioUrl)
                this.nextSongURL = '';
            } else {
                audioUrl = await this.getAudioFromServer(this.currentSong);
                console.log('NextSongURL is null, sending: ', audioUrl)
            }

            console.log("This.currentSong.title: ", this.currentSong.title, ", audioURL: ", audioUrl);

            if(!audioUrl.includes(this.currentSong.title.replace(/[^a-zA-Z0-9]/g, '_'))){

                await this.playCurrentSong();
                return;
            }

            if(audioUrl){
                console.log('Audio URL is not null. Playing: ', audioUrl)
                this.playLocalAudio(audioUrl);
            } else {
                console.log('Audio URL was null.')
                this.startNewRound();
            }
        } catch (e){
            console.log('Error: ', e);
            if (this.retryAttempts < this.maxRetryAttempts){
                this.retryAttempts++;
                await this.playCurrentSong();
                return
            } else {
                console.error('Failed to get audio: ', e);
                document.getElementById('dev-message').innerHTML = `Could not load audio: ${e}`;
            }
        }

    this.preloadNextSong()
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
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

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
        const fullAudioUrl = audioUrl.startsWith('http') ? audioUrl : `${this.website}/api/music/${encodeURIComponent(audioUrl)}`;
        audio.src = fullAudioUrl;
        audio.volume = 1.0;

        audio.onerror = (e) => {
            console.error('Audio error: ', e);
            document.getElementById('dev-message').innerHTML = 'Playback failed: ', e;
            document.getElementById('play-snippet').disabled = false;
        }

        this.showScreen('game-screen')
        if(this.pairedDevice){
            document.getElementById('playback-controls').style.display = 'none';
            document.getElementById('guess-area').style.display = 'none'
        } else {
            document.getElementById('playback-controls').style.display = 'block';
            document.getElementById('guess-area').style.display = 'block'
        }

        const playPromise = audio.play();

        if(playPromise !== undefined){
            playPromise.catch(error => {
                console.error('Playback failed: ', error);
                document.getElementById('dev-message').innerHTML = 'Playback failed: ', error;
                document.getElementById('play-snippet').disabled = false;
            });
        }
        
        this.currentAudio = audio;

        setTimeout(() => {
            document.getElementById('dev-message').innerHTML = 'Playback finished';
            if(this.replaysLeft > 0){
                document.getElementById('replay-snippet').disabled = false;
            }
            document.getElementById('submit-guess').disabled = false;
        }, this.snippetDuration * 1000);

        document.getElementById('dev-message').innerHTML = 'Playing...'

    }

    stopPlayback(){
        if(this.currentAudio){
            this.currentAudio.pause();
        }
    }

    generateSongId(song){
        return `${song.artist}_${song.title}`.replace(/[^a-zA-Z0-9]/g, '_');
    }

    getRandomStartTime() {
        return Math.floor(Math.random() * (45 - 15 + 1)) + 15;
    }

    prepareRounds(){
        let round = 1;
        const seenSongs = [];
        this.playlist = [];
        console.log("Total number of rounds needed: ", ((this.maxRounds * this.players.length) + 1))
        while(round < (this.maxRounds * this.players.length) + 1){
            let difficulty;
            const percentile = round / this.maxRounds
            let intensity;
            if(percentile > .75){
                intensity = 4
            } else if (percentile > .50){
                intensity = 3
            } else if (percentile > .25){
                intensity = 2
            } else {
                intensity = 1
            }
            if (this.difficulty === "progressive"){
                switch(intensity) {
                    case 1: difficulty = 'easy'; break;
                    case 2: difficulty = 'medium'; break;
                    case 3: difficulty = 'hard'; break;
                    case 4: difficulty = 'expert'; break;
                }
            } else if(this.difficulty === "progressive-e"){
                switch(intensity){
                    case 1: difficulty = 'easy'; break;
                    case 2: difficulty = 'easy'; break;
                    case 3: difficulty = 'medium'; break;
                    case 4: difficulty = 'medium'; break;
                }
            } else if(this.isCustomPlaylist) {
                difficulty = 'custom difficulty'
            } else {
                difficulty = this.difficulty
            }

            let availableSongs;

            if(this.isCustomPlaylist && this.customPlaylist){
                availableSongs = this.customPlaylist;
                document.getElementById('difficulty').textContent = 'Custom Playlist';
            }else{
                availableSongs = songDatabase[difficulty];
                availableSongs = availableSongs.filter(song => song.genre.toLowerCase() !== 'anime');
                availableSongs = availableSongs.filter(song => song.genre.toLowerCase() !== 'j-pop')

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

            let currentSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
            
            let artist = this.cleanArtist(currentSong.artist);
            let title = this.cleanTitle(currentSong.title);
            let seenSong = `${title}|${artist}`;

            while(seenSongs.includes(seenSong)){
                console.log('Song: ', seenSong, ' found in seenSongs. Rerandomizing.')
                currentSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];
                artist = this.cleanArtist(currentSong.artist);
                title = this.cleanTitle(currentSong.title);
                seenSong = `${title}|${artist}`;
                console.log('Current song in this.playlist. Choosing new song: ', currentSong)
            }

            seenSongs.push(seenSong);
            this.playlist.push(currentSong);
            console.log("Round: ", round, ", Current Song: ", currentSong);
            round++;
        }
        console.log("Playlist: ", this.playlist);
        console.log('Seen songs: ', seenSongs);
    }

    cleanTitle(title){
        return title.split('(')[0].split('-')[0].split('[')[0].trim()
    }

    cleanArtist(artist){
        return artist.split('&')[0].split(',')[0].split(' feat')[0].split(' Ft')[0].split('-')[0].trim()
    }

    startNewRound() {
        this.replaysLeft = 1;
        this.isPreloaded = false;

        this.showScreen('loading-screen');

        document.getElementById('replay-snippet').disabled = false;
        document.getElementById('play-snippet').disabled = false;
        document.getElementById('title-guess').value = '';
        if(this.isArtistPlaylist){
            document.getElementById('artist-guess').textContent = this.artistForArtistPlaylist;
            document.getElementById('artist-guess').value = this.artistForArtistPlaylist;
        } else {
            document.getElementById('artist-guess').value = '';
        }
        document.getElementById('dev-message').innerHTML = 'Loading song...';
        document.getElementById('voice-status').textContent = '🎤';

        document.getElementById('round-number').textContent = this.currentRound;
        document.getElementById('max-round-number').textContent = this.maxRounds;

        document.getElementById('current-player').innerHTML = `${this.players[this.currentPlayerIndex].name}'s Turn`;

        let difficulty;
        const percentile = this.currentRound / this.maxRounds
        let intensity;
        if(percentile > .75){
            intensity = 4
        } else if (percentile > .50){
            intensity = 3
        } else if (percentile > .25){
            intensity = 2
        } else {
            intensity = 1
        }
        if (this.difficulty === "progressive"){
            switch(intensity) {
                case 1: difficulty = 'easy'; break;
                case 2: difficulty = 'medium'; break;
                case 3: difficulty = 'hard'; break;
                case 4: difficulty = 'expert'; break;
            }
        } else if(this.difficulty === "progressive-e"){
            switch(intensity){
                case 1: difficulty = 'easy'; break;
                case 2: difficulty = 'easy'; break;
                case 3: difficulty = 'medium'; break;
                case 4: difficulty = 'medium'; break;
            }
        } else if(this.isCustomPlaylist) {
            difficulty = 'custom difficulty'
        } else {
            difficulty = this.difficulty
        }
        document.getElementById('difficulty').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

        this.currentSong = this.playlist[this.currentIndex];

        this.currentIndex++;

        document.getElementById('submit-guess').disabled = true;

        this.playCurrentSong();
    }

    processVoiceGuess(transcript) {
        console.log("Transcript: ", transcript);
        
        const cleanTranscript = transcript.toLowerCase().trim();
        
        const guessIndicators = [
            'this is', 'it\'s', 'its', 'that is', 'thats', 'i think it\'s',
            'i think its', 'maybe', 'perhaps', 'is it', 'could be'
        ];
        
        let processedTranscript = cleanTranscript;
        guessIndicators.forEach(indicator => {
            processedTranscript = processedTranscript.replace(indicator, '');
        });
        
        const currentArtists = this.currentSong.artist.split(/[&,]+|\sand\s|\sfeat\.?\s|\sft\.?\s/i).map(a => a.trim().toLowerCase());
        
        let titleGuess = processedTranscript;
        let artistGuess = '';
        
        const separators = [' by ', ' from ', ' - ', ' – ', ' — ', ' with ', ' and ', ' & '];
        for (const separator of separators) {
            if (processedTranscript.includes(separator)) {
                const parts = processedTranscript.split(separator);
                titleGuess = parts[0].trim();
                artistGuess = parts[1] ? parts[1].trim() : '';
                break;
            }
        }
        
        if (!artistGuess) {
            for (const artist of currentArtists) {
                const artistWords = artist.split(/\s+/);
                
                if (processedTranscript.includes(artist)) {
                    const artistIndex = processedTranscript.indexOf(artist);
                    titleGuess = processedTranscript.substring(0, artistIndex).trim();
                    artistGuess = artist;
                    break;
                }
                
                for (const word of artistWords) {
                    if (word.length > 3 && processedTranscript.includes(word)) {
                        const wordIndex = processedTranscript.indexOf(word);
                        titleGuess = processedTranscript.substring(0, wordIndex).trim();
                        artistGuess = processedTranscript.substring(wordIndex).trim();
                        break;
                    }
                }
                if (artistGuess) break;
            }
        }
        
        if (!artistGuess) {
            for (const artist of currentArtists) {
                if (this.checkPartialMatch(processedTranscript, artist) || 
                    this.checkNormalizedMatch(processedTranscript, artist)) {
                    // Assume everything is the artist guess
                    artistGuess = processedTranscript;
                    titleGuess = '';
                    break;
                }
            }
        }
        
        console.log('Parsed - Title:', titleGuess, 'Artist:', artistGuess);
        console.log('Current song artists:', currentArtists);
        
        this.processTextGuess(titleGuess, artistGuess);
    }

    findPossibleArtistInTranscript(transcript) {
        if (!this.currentSong) return null;
        
        const currentArtist = this.currentSong.artist.toLowerCase();
        const artistWords = currentArtist.split(/[&\s]+/);
        
        for (const word of artistWords) {
            if (word.length > 2 && transcript.includes(word)) {
                const wordIndex = transcript.indexOf(word);
                const titleGuess = transcript.substring(0, wordIndex).trim();
                const artistGuess = transcript.substring(wordIndex).trim();
                
                return { title: titleGuess, artist: artistGuess };
            }
        }
        
        return null;
    }

    processTextGuess(title, artist) {
        if(!this.currentSong) return;
        this.playedSongs.push(this.currentSong);
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
        
        this.nextTurn(message);
    }

    nextTurn(message) {

        this.stopPlayback();

        this.showScreen('loading-screen');
        document.getElementById('loading-message').textContent = message;

        this.currentPlayerIndex++;
        
        if (this.currentPlayerIndex >= this.players.length) {
            this.currentPlayerIndex = 0;
            this.currentRound++;
            
            if (this.currentRound > this.maxRounds) {
                setTimeout(() => {
                    document.getElementById('loading-screen').style.display = 'none';
                    this.endGame();
                }, 5000);
                return;
            }
        }
        
        setTimeout(() => this.startNewRound(), 2500);
    }   

    checkPartialMatch(guess, target) {
        const targetWords = target.toLowerCase().split(/[,\s]+/);
        const guessWords = guess.split(/[,\s]+/);
        
        let matchCount = 0;
        let significantWords = 0;
        
        targetWords.forEach(targetWord => {
            if (targetWord.length > 2) {
                significantWords++;
                guessWords.forEach(guessWord => {
                    if (guessWord.length > 2 && 
                        (guessWord.includes(targetWord) || targetWord.includes(guessWord))) {
                        matchCount++;
                    }
                });
            }
        });
        
        return significantWords > 0 && matchCount >= Math.ceil(significantWords / 2);
    }

    checkNormalizedMatch(guess, target) {
        const normalizedGuess = this.normalizeText(guess);
        const normalizedTarget = this.normalizeText(target.toLowerCase());
        
        return normalizedGuess.includes(normalizedTarget) || normalizedTarget.includes(normalizedGuess);
    }

    normalizeText(text){
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^(the|an|a)\s+/, '')
            .replace(/\s+(the|a|an)$/, '')
            .replace(/&/g, 'and')
            .replace(/[\.\-]/g, '')
            .trim();
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

    playVideoWithIframe(videoId, song) {
        const startTime = this.randomStartTime;
        const endTime = startTime + this.snippetDuration;
        
        // Using end parameter to stop automatically
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${endTime}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&showinfo=0&playsinline=1`;

        console.log(`Playing with iframe: ${startTime} to ${endTime}`);
        
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

    async loadCustomPlaylist(url){
        const playlistId = this.extractPlaylistId(url);

        if(!playlistId){
            document.getElementById('playlist-status').className = 'playlist-status error';
            document.getElementById('playlist-status').textContent = 'Invalid playlist URL';
            return;
        }

        const playlistSongs = await this.fetchPlaylistItems(playlistId, url);

        if(playlistSongs && playlistSongs.length > 0){
            this.customPlaylist = playlistSongs;
            this.isCustomPlaylist = true;
            document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
            document.getElementById('start-round').disabled = false;

            this.selectedPlaylist = 'custom'
        }
    }

    extractSpotifyPlaylistId(url){
        const patterns = [
            /spotify\.com\/playlist\/([a-zA-Z0-9]+)/i,
            /(?:open\.)?spotify\.com\/playlist\/([a-zA-Z0-9]+)/i,
            /spotify\.com\/playlist\/([a-zA-Z0-9]+)(?:\?[^#]*)?/i
        ]

        for (const pattern of patterns){
            const match = url.match(pattern);
            if(match){
                return match[1];
            }
        }

        return null;
    }

    extractYouTubePlaylistId(url){
        const patterns = [
            /[&?]list=([^&]+)/i,
            /youtube\.com\/playlist\?list=([^&]+)/i,
            /youtu\.be\/.*[&?]list=([^&]+)/i
        ];

        for (const pattern of patterns){
            const match = url.match(pattern)
            if (match){
                return match[1];
            }
        }
        return null;        
    }

    extractPlaylistId(url) {
        if(url.includes('spotify')){
            return this.extractSpotifyPlaylistId(url);
        } else if (url.includes('youtube') || url.includes('youtu.be')){
            return this.extractYouTubePlaylistId(url);
        } else {
            return url;
        }
    }

    async fetchSpotifyPlaylistItems(playlistId){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }     
        
        const statusDiv = document.getElementById('playlist-status');
        if (!statusDiv) return null;
        
        statusDiv.className = 'playlist-status loading';
        statusDiv.textContent = 'Loading playlist...';

        try{
            let allVideos = [];
            const response = await fetch(`${this.website}/api/music/spotify-api-call/${playlistId}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();
                if(data.length === 0){
                    throw new Error('No valid videos found in playlist');
                } 
                console.log('Data: ', data);
                allVideos = [...allVideos, ...data];
            }           

            statusDiv.className = 'playlist-status success';
            statusDiv.textContent = `Loaded ${allVideos.length} songs`;

            return allVideos;

        } catch (error) {
            console.log('Error fetching playlist: ', error);
            statusDiv.className = 'playlist-status error';
            statusDiv.textContent = 'Failed to load playlist. Please check the URL.';
            return null;
        }        
    }

    async fetchYouTubePlaylistItems(playlistId){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        const statusDiv = document.getElementById('playlist-status');
        if (!statusDiv) return null;
        
        statusDiv.className = 'playlist-status loading';
        statusDiv.textContent = 'Loading playlist...';

        try{            
            let allVideos = [];
            const response = await fetch(`${this.website}/api/music/youtube-api-call/${playlistId}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            })

            if(response.ok){
                const data = await response.json();
                console.log("Data: ", data);
                let videos = data.allVideos;

                videos = Object.keys(videos).map((key) => [key, videos[key]]);
                console.log('Array From Videos: ', videos)
                videos.forEach(video => {
                    console.log('Video: ', video[1]);
                    allVideos.push({
                        title: video[1].title,
                        artist: video[1].artist,
                        year: video[1].year,
                        genre: video[1].genre,
                        videoId: video[1].id
                    });
                });
            }
            if(allVideos.length === 0){
                throw new Error('No valid videos found in playlist');
            }

            statusDiv.className = 'playlist-status success';
            statusDiv.textContent = `Loaded ${allVideos.length} songs`;

            return allVideos;
        
        } catch (error) {
            console.log('Error fetching playlist: ', error);
            statusDiv.className = 'playlist-status error';
            statusDiv.textContent = 'Failed to load playlist. Please check the URL.';
            return null;
        }        
    }

    async fetchArtistPlaylistItems(artist){
        if (artist.toLowerCase().includes('.com') || artist.toLowerCase().includes('http') || artist.toLowerCase() === ''){
            return;
        }

        this.isArtistPlaylist = true;
        this.artistForArtistPlaylist = artist;

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }      
        
        const statusDiv = document.getElementById('playlist-status');
        if (!statusDiv) return null;
        
        statusDiv.className = 'playlist-status loading';
        statusDiv.textContent = 'Loading playlist...';
       
        try{
            let allVideos = [];
            const response = await fetch(`${this.website}/api/music/artist-playlist`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    artist: artist
                })
            });

            if(response.ok){
                const data = await response.json();
                let videos = data.allVideos;
                videos = Object.keys(videos).map((key) => [key, videos[key]]);
                console.log('Array From Videos: ', videos)
                videos.forEach(video => {
                    console.log('Video: ', video[1]);
                    allVideos.push({
                        title: video[1].title,
                        artist: video[1].artist,
                        year: video[1].year,
                        genre: video[1].genre,
                    });
                });

            }

            if(allVideos.length === 0){
                throw new Error('No valid videos found in playlist');
            }

            statusDiv.className = 'playlist-status success';
            statusDiv.textContent = `Loaded ${allVideos.length} songs`;

            return allVideos;
        } catch (error) {
            console.log('Error fetching playlist: ', error);
            statusDiv.className = 'playlist-status error';
            statusDiv.textContent = 'Failed to load playlist. Please check the URL.';
            return null;
        }        
    }

    async fetchPlaylistItems(playlistId, url){
        if(url.includes('spotify')){
            return await this.fetchSpotifyPlaylistItems(playlistId);
        } else if (url.includes('youtube') || url.includes('youtu.be')){
            return await this.fetchYouTubePlaylistItems(playlistId);
        } else {
            return await this.fetchArtistPlaylistItems(playlistId);
        }
    }

    cleanVideoTitle(title){
        return title
            .replace(/\s*\([^)]*official[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*official[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*video[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*video[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*audio[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*audio[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*lyrics?[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*lyrics?[^\]]*\]/gi, '')
            .replace(/\s*\|.*$/, '') 
            .replace(/\s*-\s*$/, '') 
            .trim(); 
    }

    cleanArtistName(title){
        return title
            .replace(/\s*\([^)]*topic[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*topic[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*vevo[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*vevo[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*official[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*official[^\]]*\]/gi, '')
            .replace(/\s*\([^)]*lyrics?[^)]*\)/gi, '')
            .replace(/\s*\[[^\]]*lyrics?[^\]]*\]/gi, '')
            .replace(/\s*-\s*(topic|vevo|official|lyrics?)(\s*|$)/gi, '')
            .replace(/\s*\|.*$/, '') 
            .replace(/\s*-\s*$/, '') 
            .trim(); 
    }

    extractArtistFromTitle(title){
        const patterns = [
            /^([^-]+)-\s*(.+)$/,
            /^(.+?)\s*[-–—]\s*(.+)$/,
            /(.+?)\s+by\s+(.+)$/i,
        ];
        
        for (const pattern of patterns) {
            const match = title.match(pattern);
            if (match) {
                if (pattern === patterns[0] || pattern === patterns[1]) {
                    return match[1].trim();
                }
                if (pattern === patterns[2]) {
                    return match[2].trim();
                }
            }
        }
        
        return null;        
    }

    async refreshToken() {
        try{
            const response = await fetch(`${this.website}/api/local/token`, {
                headers: {
                    'Referer': window.location.origin
                }
            });

            if(response.ok){
                const data = await response.json();
                this.token = data.token;
                this.tokenExpiry = Date.now() + (data.expires_in * 1000);
                return true;
            }
        } catch (error) {
            console.log('Server not available');
            return false;
        }
    }

}

const game = new MusicQuizGame();