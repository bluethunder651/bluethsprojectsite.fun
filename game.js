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
        this.isLoading = false;
        this.randomStartTime = 15;
        this.snippetDuration = 10; // Play 10 seconds of the song
        this.hasSeekedThisPlay = false;
        
        this.YOUTUBE_API_KEY = 'AIzaSyDejNIPtcOOfuvrCNqorr2s1Yh_hEpFOc8'; 

        this.setupEventListeners();
        this.initVoiceRecognition();
        this.loadYouTubeAPI();
    }
    
    // Load YouTube IFrame API
    loadYouTubeAPI() {
        if (window.YT) {
            this.onYouTubeAPIReady();
            return;
        }
        
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        
        window.onYouTubeIframeAPIReady = () => {
            console.log('YouTube API loaded');
            this.onYouTubeAPIReady();
        };
    }
    
    onYouTubeAPIReady() {
        this.playerReady = true;
        console.log('YouTube player ready');
    }
    
    getRandomStartTime() {
        // Random time between 15 and 45 seconds
        return Math.floor(Math.random() * (45 - 15 + 1)) + 15; // 15-45
    }
    
    async preloadVideoForCurrentSong() {
        if (this.isLoading) {
            console.log('Already loading a song, please wait...');
            return false;
        }
        
        if (!this.currentSong) return false;
        
        if (this.isPreloaded && this.preloadedSong === this.currentSong) {
            console.log('Song already preloaded');
            return true;
        }
        
        this.isLoading = true;
        
        try {
            // Generate random start time for this song
            this.randomStartTime = this.getRandomStartTime();
            console.log(`Random start time: ${this.randomStartTime} seconds (playing until ${this.randomStartTime + this.snippetDuration})`);
            
            document.getElementById('dev-message').innerHTML = '🔍 Loading song...';
            
            const searchQuery = encodeURIComponent(`${this.currentSong.title} ${this.currentSong.artist} audio`);
            const response = await fetch(
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${this.YOUTUBE_API_KEY}&maxResults=1`
            );
            
            if (!response.ok) {
                throw new Error('YouTube API error');
            }
            
            const data = await response.json();
            
            if (!data.items || data.items.length === 0) {
                document.getElementById('dev-message').innerHTML = '❌ No videos found for this song';
                this.isLoading = false;
                return false;
            }

            this.preloadedVideoId = data.items[0].id.videoId;
            this.preloadedSong = this.currentSong;
            
            console.log(`Preloaded: ${this.currentSong.title} - Video ID: ${this.preloadedVideoId}`);
            
            await this.createHiddenPlayer(this.preloadedVideoId);
            
            this.isPreloaded = true;
            document.getElementById('dev-message').innerHTML = '✅ Song loaded! Press Play to listen';
            document.getElementById('play-snippet').disabled = false;
            document.getElementById('replay-snippet').disabled = false;
            this.isLoading = false;
            return true;
            
        } catch (e) {
            console.error('Preload failed:', e);
            document.getElementById('dev-message').innerHTML = '⚠️ Could not load song';
            this.isLoading = false;
            return false;
        }
    }
    
    async createHiddenPlayer(videoId) {
        return new Promise((resolve) => {
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
            
            playerContainer.innerHTML = '';
            
            const playerDiv = document.createElement('div');
            playerDiv.id = 'youtube-player';
            playerContainer.appendChild(playerDiv);
            
            if (window.YT && window.YT.Player) {
                this.createPlayerInstance(playerDiv, videoId, resolve);
            } else {
                const checkAPI = setInterval(() => {
                    if (window.YT && window.YT.Player) {
                        clearInterval(checkAPI);
                        this.createPlayerInstance(playerDiv, videoId, resolve);
                    }
                }, 100);
            }
        });
    }
    
    createPlayerInstance(playerDiv, videoId, resolve) {
        if (this.youtubePlayer && this.youtubePlayer.destroy) {
            this.youtubePlayer.destroy();
        }
        
        // Create new player
        this.youtubePlayer = new YT.Player(playerDiv.id, {
            height: '0',
            width: '0',
            videoId: videoId,
            playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                rel: 0,
                showinfo: 0
            },
            events: {
                'onReady': (event) => {
                    console.log('Player ready');
                    // Just cue the video at the random start time
                    event.target.cueVideoById(videoId);
                    resolve(true);
                },
                'onStateChange': (event) => {
                    if(event.data === YT.PlayerState.PLAYING) {
                        if(!this.hasSeekedThisPlay) {
                            this.hasSeekedThisPlay = true;
                            this.youtubePlayer.seekTo(this.randomStartTime, true);
                            console.log(`Seeking to ${this.randomStartTime}`);
                            
                            setTimeout(() => {
                                if(this.youtubePlayer && this.youtubePlayer.pauseVideo) {
                                    this.youtubePlayer.pauseVideo();
                                    console.log(`Playback stopped after ${this.snippetDuration} seconds`);
                                    document.getElementById('dev-message').innerHTML = 'Playback finished';
                                    console.log(this.replaysLeft)
                                    if (this.replaysLeft === 0) {
                                        document.getElementById('replay-snippet').disabled = true;
                                    } else {
                                        document.getElementById('replay-snippet').disabled = false;
                                    }
                                }
                            }, this.snippetDuration * 1000);
                        }
                    }
                },
                'onError': (event) => {
                    console.error('Player error:', event.data);
                    document.getElementById('dev-message').innerHTML = '⚠️ Playback error occurred';
                    this.isPreloaded = false;
                    resolve(false);
                }
            }
        });
    }
    
    playPreloadedVideo() {
        this.hasSeekedThisPlay = false;
        if (!this.youtubePlayer || !this.preloadedVideoId) {
            console.log('No preloaded video, loading now...');
            this.playCurrentSong();
            return;
        }
        
        try {
            console.log(`Playing from ${this.randomStartTime} to ${this.randomStartTime + this.snippetDuration}`);
            
            // Make sure we're at the right position before playing
            this.youtubePlayer.seekTo(this.randomStartTime, true);
            
            // Small delay to ensure seek completes
            setTimeout(() => {
                this.youtubePlayer.playVideo();
                document.getElementById('dev-message').innerHTML = '🔊 Playing...';
            }, 100);
            
        } catch (e) {
            console.error('Playback failed:', e);
            document.getElementById('dev-message').innerHTML = '⚠️ Playback failed, retrying...';
            
            this.isPreloaded = false;
            this.preloadVideoForCurrentSong().then(() => {
                setTimeout(() => this.playPreloadedVideo(), 1000);
            });
        }
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
    
    playVideoWithIframe(videoId, song) {
        const startTime = this.randomStartTime;
        const endTime = startTime + this.snippetDuration;
        
        // Using end parameter to stop automatically
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${endTime}&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0&showinfo=0`;

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
    
    stopPlayback() {
        if (this.youtubePlayer) {
            if (this.youtubePlayer.pauseVideo) {
                this.youtubePlayer.pauseVideo();
            }
            if (this.youtubePlayer.stopVideo) {
                this.youtubePlayer.stopVideo();
            }
        }
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

        let availableSongs = songDatabase[difficulty];

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

        if (availableSongs.length === 0){ 
            console.warn(`No songs found for ${this.selectedPlaylist} playlist in ${difficulty} difficulty`);
            document.getElementById('dev-message').innerHTML = 'No songs available for this selection. Using all songs.';
            availableSongs = songDatabase[difficulty]
        }
        this.currentSong = availableSongs[Math.floor(Math.random() * availableSongs.length)];

        document.getElementById('current-player').innerHTML = `${this.players[this.currentPlayerIndex].name}'s Turn`;
        
        this.preloadVideoForCurrentSong();
    }
    
    async playCurrentSong() {
        if(!this.currentSong) return;

        this.stopPlayback();

        if (this.isLoading) {
            document.getElementById('dev-message').innerHTML = '⏳ Still loading, please wait...';
            
            const checkLoading = setInterval(() => {
                if (!this.isLoading) {
                    clearInterval(checkLoading);
                    this.playCurrentSong();
                }
            }, 500);
            return;
        }

        if (this.isPreloaded && this.preloadedVideoId && this.youtubePlayer) {
            this.playPreloadedVideo();
        } else {
            document.getElementById('dev-message').innerHTML = 'Loading song...';
            const success = await this.playYouTube(this.currentSong);
            if(!success) { 
                document.getElementById('dev-message').innerHTML = 'Could not play this song. Try another!';
            }
        }

        document.getElementById('replay-snippet').disabled = true;
        
    }
    
    handleReplay() {
        if (this.replaysLeft > 0) {
            this.replaysLeft--;
            if (this.replaysLeft === 0) {
                document.getElementById('replay-snippet').disabled = true;
            }
            this.playCurrentSong(); 
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
                
                // Optional: Show what's selected
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
    }
    
    processTextGuess(title, artist) {
        if(!this.currentSong) return;

        this.stopPlayback();

        let points = 0;
        let message = '';
        
        // Configure Fuse options for fuzzy matching
        const fuseOptions = {
            includeScore: true,
            threshold: 0.4,
            ignoreLocation: true,
            ignoreFieldNorm: true,
            shouldSort: true,
            minMatchCharLength: 2
        };
        
        // Handle multiple artists - split by common separators
        const currentArtists = this.currentSong.artist.split(/[&,]+|\sand\s|\sfeat\.?\s|\sft\.?\s/i).map(a => a.trim());
        console.log('Current artists:', currentArtists);
        
        // Clean up the guesses
        const cleanTitleGuess = title.trim().toLowerCase();
        const cleanArtistGuess = artist.trim().toLowerCase();
        
        // Check title match
        let titleMatch = false;
        let titleScore = 1;
        
        if (cleanTitleGuess) {
            // Try direct fuzzy match first
            const titleFuse = new Fuse([this.currentSong.title], fuseOptions);
            const titleResults = titleFuse.search(cleanTitleGuess);
            if (titleResults.length > 0) {
                titleMatch = true;
                titleScore = titleResults[0].score;
                console.log(`Title fuzzy match score: ${titleScore}`);
            }
            
            // Also check if the guess contains significant parts of the title
            if (!titleMatch) {
                titleMatch = this.checkPartialMatch(cleanTitleGuess, this.currentSong.title);
            }
            
            // Check for normalized match
            if (!titleMatch) {
                titleMatch = this.checkNormalizedMatch(cleanTitleGuess, this.currentSong.title);
            }
        }
        
        // Check artist match - now handles multiple artists
        let artistMatch = false;
        let artistScore = 1;
        let matchedArtist = '';
        
        if (cleanArtistGuess) {
            // Check each artist in the list
            for (const currentArtist of currentArtists) {
                // Try direct fuzzy match
                const artistFuse = new Fuse([currentArtist], fuseOptions);
                const artistResults = artistFuse.search(cleanArtistGuess);
                
                if (artistResults.length > 0) {
                    artistMatch = true;
                    artistScore = artistResults[0].score;
                    matchedArtist = currentArtist;
                    console.log(`Artist fuzzy match for "${currentArtist}" with score: ${artistScore}`);
                    break;
                }
                
                // Check partial match
                if (!artistMatch) {
                    if (this.checkPartialMatch(cleanArtistGuess, currentArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist partial match for "${currentArtist}"`);
                        break;
                    }
                }
                
                // Check normalized match
                if (!artistMatch) {
                    if (this.checkNormalizedMatch(cleanArtistGuess, currentArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist normalized match for "${currentArtist}"`);
                        break;
                    }
                }
            }
            
            // Also check if the guess contains ANY of the artist names
            if (!artistMatch) {
                for (const currentArtist of currentArtists) {
                    const normalizedArtist = this.normalizeText(currentArtist);
                    const normalizedGuess = this.normalizeText(cleanArtistGuess);
                    
                    // Check if the guess contains this artist name
                    if (normalizedGuess.includes(normalizedArtist)) {
                        artistMatch = true;
                        matchedArtist = currentArtist;
                        console.log(`Artist contained in guess for "${currentArtist}"`);
                        break;
                    }
                    
                    // Or if this artist name is a single word and appears in the guess
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
        
        // Calculate points based on match quality
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
        
        setTimeout(() => this.nextTurn(), 3000);
    }

    // Helper method for partial matching
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

    // Helper method for normalized matching
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

    processVoiceGuess(transcript) {
        console.log("Transcript: ", transcript);
        
        // Clean up the transcript
        const cleanTranscript = transcript.toLowerCase().trim();
        
        // Common phrases that indicate a guess
        const guessIndicators = [
            'this is', 'it\'s', 'its', 'that is', 'thats', 'i think it\'s',
            'i think its', 'maybe', 'perhaps', 'is it', 'could be'
        ];
        
        // Remove guess indicators from the transcript
        let processedTranscript = cleanTranscript;
        guessIndicators.forEach(indicator => {
            processedTranscript = processedTranscript.replace(indicator, '');
        });
        
        // Handle multiple artists in the current song
        const currentArtists = this.currentSong.artist.split(/[&,]+|\sand\s|\sfeat\.?\s|\sft\.?\s/i).map(a => a.trim().toLowerCase());
        
        // Try to find artist mentions in the transcript
        let titleGuess = processedTranscript;
        let artistGuess = '';
        
        // First, try to split by common separators
        const separators = [' by ', ' from ', ' - ', ' – ', ' — ', ' with ', ' and ', ' & '];
        for (const separator of separators) {
            if (processedTranscript.includes(separator)) {
                const parts = processedTranscript.split(separator);
                titleGuess = parts[0].trim();
                artistGuess = parts[1] ? parts[1].trim() : '';
                break;
            }
        }
        
        // If no separator found, try to find any artist name in the transcript
        if (!artistGuess) {
            // Check each artist from the current song
            for (const artist of currentArtists) {
                const artistWords = artist.split(/\s+/);
                
                // Check if the full artist name appears
                if (processedTranscript.includes(artist)) {
                    const artistIndex = processedTranscript.indexOf(artist);
                    titleGuess = processedTranscript.substring(0, artistIndex).trim();
                    artistGuess = artist;
                    break;
                }
                
                // Check if any significant word from the artist name appears
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
        
        // If we still don't have an artist guess, but the transcript contains
        // any artist name from the song, consider that as the artist guess
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
