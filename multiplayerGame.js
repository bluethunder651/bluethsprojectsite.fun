class MultiplayerGame{
    constructor(){
        this.website = 'https://julia.bluethsprojectsite.fun'
        this.token = null;
        this.tokenExpiry = null;
        this.mobileMode = false;
        this.codecCache = new Map();

        this.gameCode = null;
        this.playerName = null;
        this.players = [];
        this.isHost = false;
        this.currentRound = -1;
        this.hardMode = false;
        this.timeLimit = 0;

        this.playlist = [];
        this.currentSong = null;
        this.currentPlaylistIndex = 0;
        this.videoStartTime = null;
        this.hasAnswered = false;
        this.answerSubmitted = false;
        this.isLoading = false;
        this.playbackStarted = false;
        this.leaderboardShown = false;

        this.buffer1Index = null;
        this.buffer2Index = null;

        this.gameStatePollInterval = null;
        this.videoReady = false;

        this.setupEventListeners();
        this.loadGameData();
    }

    setupEventListeners(){
        
        document.addEventListener('DOMContentLoaded', async function() {
            document.querySelectorAll('.answer-btn').forEach(button => {
                button.addEventListener('click', (e) => game.handleAnswerClick(e));
            });

            document.getElementById('video-player').addEventListener('ended', () => {
                if(this.gameStatePollInterval && !this.answerSubmitted){
                    game.submitAnswer(null);
                }
            });

            document.getElementById('go-back-btn').addEventListener('click', () => {
                if(confirm('Leave the game?')){
                    game.leaveGame();
                }
            });

            document.getElementById('next-video').addEventListener('click', () => {
                game.nextRound();
            })

            document.getElementById('end-game').addEventListener('click', () => {
                if(confirm('End the game?')){
                    document.getElementById('video-player').pause();
                    game.showLeaderboard();
                }
            })

            document.getElementById('next-video').disabled = true;
        });
    }

    async loadGameData() {
        const urlParams = new URLSearchParams(window.location.search);
        this.gameCode = urlParams.get('code') || localStorage.getItem('multiplayerGameCode');
        this.playerName = localStorage.getItem('playerName');

        const gameData = JSON.parse(localStorage.getItem('multiplayerGame') || '{}');
        this.totalRounds = gameData.rounds || 20;
        this.hardMode = gameData.hardMode || true;
        this.timeLimit = gameData.timeLimit || 20;
        this.players = gameData.players || [];
        this.isHost = (gameData.host === this.playerName);

        if(!this.gameCode || !this.playerName){
            alert('No game data found.');
            window.location.href = 'lobby.html';
            return;
        }

        await this.refreshToken();
        if(this.token){
            this.startGamePolling();
            this.fetchInitialPlaylist();
        }
    }

    async fetchInitialPlaylist() {
        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/playlist`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });
            if(response.ok){
                const data = await response.json();
                this.playlist = data.playlist;
                this.currentRound = -1;
                this.showLoadingScreen('Waiting for host to start...');
            }
        } catch (error) {
            console.error('Failed to fetch playlist: ', error);
        }
    }

    startGamePolling() {
        this.gameStatePollInterval = setInterval(() => this.fetchGameState(), 1000);
    }

    async fetchGameState() {
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/state`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });
            if(response.ok){
                const state = await response.json();
                this.handleGameState(state);
            }
        } catch (error) {
            console.error('Failed to fetch game state: ', error);
        }
    }

    handleGameState(state){
        this.players = state.players
        this.updateScoreboard();

        console.log('State.Phase: ', state.phase)

        switch(state.phase){
            case 'loading':
                if(state.currentRound !== this.currentRound){
                    this.currentRound = state.currentRound;
                    this.currentSong = state.currentSong;
                    this.playbackStarted = false;
                    this.showLoadingScreen('Loading video...');
                    this.loadAndPlayVideo(state.currentSong);

                    if(this.currentRound >= 0){
                        console.log("Buffer.src", document.getElementById('video-buffer1').src);
                        this.preloadBuffers();
                        console.log("2 Buffer.src", document.getElementById('video-buffer1').src);
                    }
                } else {
                    console.log('state.currentRound === this.currentRound');
                }
                break;
            case 'playing':
                if(this.videoReady && !this.playbackStarted && !this.isLoading){
                    this.startPlayback(state.game_settings);
                }
                if(!this.isLoading && !this.videoReady){
                    this.currentRound = state.currentRound;
                    this.currentSong = state.currentSong;
                    this.loadAndPlayVideo(state.currentSong);
                }
                break;
            case 'reveal':
                this.showAnswerReveal(state);
                break;
            case 'round_end':
                setTimeout(() => {
                    const nextBtn = document.getElementById('next-video');
                    if(this.isHost){
                        nextBtn.disabled = false;
                    } else {
                        const loading_screen = document.getElementById('loading-screen');
                        loading_screen.style.display = 'block';
                        loading_screen.innerHTML = '<h3>Waiting for host to start new round...</h3>';
                        document.getElementById('game-screen').style.display = 'none';
                    }
                }, 3000);
                break;
            case 'game_end':
                if(!this.leaderboardShown){
                    this.showLeaderboard();
                    break;
                }
        }
    }

    async loadAndPlayVideo(songData){
        if(this.videoReady || this.isLoading) return;
        this.isLoading = true;

        this.videoReady = false;
        this.hasAnswered = false;
        this.playbackStarted = false;
        this.answerSubmitted = false;
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        console.log('loadandplay')

        await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/player-ready`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                playerName: this.playerName
            })
        });

        const loading_screen = document.getElementById('loading-screen');
        const game_screen = document.getElementById('game-screen');
        const videoPlayer = document.getElementById('video-player');

        loading_screen.style.display = 'block';
        game_screen.style.display = 'none';

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('answered', 'correct', 'incorrect');
            btn.style.removeProperty('background-color');
        });

        console.log('SongData.file_path: ', songData.file_path);

        this.fillButtons(songData.options);

        this.videoReady = true;
        this.isLoading = false;
        loading_screen.innerHTML = '<h3>Waiting for other players...</h3>';

        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2');

        console.log('buffer1.src: ', buffer1.src);

        if(buffer1.src !== null && this.currentRound !== 0){
            videoPlayer.src = buffer1.src;
            videoPlayer.preload = 'auto';

            console.log(`Video Src: ${videoPlayer.src}, this.currentRound: ${this.currentRound}`);

            buffer1.src = buffer2.src;
            buffer2.removeAttribute('src');
            buffer2.load();

            this.buffer1Index = this.buffer2Index;
            this.buffer2Index = null;

            this.preloadBuffers();
        } else {
            const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(songData.file_path)}?token=${encodeURIComponent(this.token)}`;

            videoPlayer.src = videoUrl;
            videoPlayer.preload = 'auto';

            console.log(`Video URL: ${videoUrl}, videoPlayer.src: ${videoPlayer.src}`);
        }
        try{
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Video loading timeout'));
                }, 60000);

                const onCanPlay = () => {
                    cleanup();
                    resolve();
                };

                const onError = (e) => {
                    cleanup();
                    reject(new Error(`Video error: ${e.target.error?.message || 'Unknown Error'}`));
                };

                const onStalled = () => {
                    console.log('Video stalled, trying to recover...');
                    videoPlayer.load();
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    videoPlayer.removeEventListener('canplay', onCanPlay);
                    videoPlayer.removeEventListener('error', onError);
                    videoPlayer.removeEventListener('stalled', onStalled);
                };

                videoPlayer.addEventListener('canplay', onCanPlay);
                videoPlayer.addEventListener('error', onError);
                videoPlayer.addEventListener('stalled', onStalled);

                videoPlayer.load();
            });

            console.log('Video loaded successfully');
            this.videoReady = true;
            this.isLoading = false;
            loading_screen.innerHTML = '<h3>Waiting for other players...</h3>';

        } catch (error) {
            console.error('Failed to load video: ', error);
            this.isLoading = false;

            loading_screen.innerHTML = `
                <h3>Failed to load video</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()" class="btn btn-primary">Retry</button>
            `;
        }

        console.log('resolved promise')

        this.videoReady = true;
        this.isLoading = false;

        loading_screen.innerHTML = '<h3>Waiting for other players...</h3>'       
    }


    async startPlayback(game_settings) {
        if(this.playbackStarted) return;
        this.playbackStarted = true;

        const loading_screen = document.getElementById('loading-screen');
        const game_screen = document.getElementById('game-screen');
        const videoPlayer = document.getElementById('video-player');
        
        loading_screen.style.display = 'none';  
        game_screen.style.display = 'block';

        if(this.hardMode){
            videoPlayer.classList.add('video-hidden');
        } else {
            videoPlayer.classList.remove('video-hidden');
        }

        this.videoStartTime = Date.now()

        const time_limit_check = game_settings.time_limit_check;

        try{
            await videoPlayer.play();
            console.log("Time Limit Check: ", time_limit_check)
            if(time_limit_check){
                this.startTimer(this.timeLimit);
            }
        } catch (error) {
            console.log("Autoplay prevented: ", error);
        }
    }


    startTimer(seconds){
        const timerDisplay = document.createElement('div');
        timerDisplay.id = 'timer';
        timerDisplay.className = 'timer';
        document.getElementById('video-screen').appendChild(timerDisplay);

        let timeLeft = seconds;
        timerDisplay.textContent = `Time left: ${timeLeft}s`

        const timer = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = `Time left: ${timeLeft}s`;

            if(timeLeft <= 0){
                clearInterval(timer);
                timerDisplay.remove();
                this.submitAnswer(null);
            }
        }, 1000);
    }

    handleAnswerClick(event){
        if(this.hasAnswered || this.answerSubmitted) return;

        const button = event.currentTarget;
        const selectedOption = button.dataset.fullTitle;

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = true;
        });

        button.classList.add('answered');
        this.hasAnswered = true;

        this.submitAnswer(selectedOption);
    }

    async submitAnswer(selectedOption){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }        
        
        if(this.answerSubmitted) return;
        this.answerSubmitted = true;

        try{
            await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/submit`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerName: this.playerName,
                    selectedOption: selectedOption,
                    correctOption: this.currentSong.game_name,
                    answerTime: Date.now(),
                    videoStartTime: this.videoStartTime
                })
            });
        } catch (error){
            console.error('Failed to submit answer: ', error);
        }
    }

    showAnswerReveal(state){
        const correctButton = Array.from(document.querySelectorAll('.answer-btn')).find(btn => btn.dataset.fullTitle === state.correctAnswer);
        if(correctButton){
            correctButton.style.backgroundColor = '#4CAF50';
        }
        this.players.forEach(player => {
            const playerResult = state.results[player.name];
            if(playerResult){
                const playerButton = Array.from(document.querySelectorAll('.answer-btn')).find(btn => btn.dataset.fullTitle === playerResult.selected);
                if (playerButton){
                    playerButton.classList.add(playerResult.correct ? 'correct' : 'incorrect');
                }
            }
        });

        this.updateScoreboard();

        document.getElementById('video-player').classList.remove('video-hidden')
        const next_btn = document.getElementById('next-video');
        next_btn.disabled = false;

        const timer = document.getElementById('timer');
        if (timer) timer.remove();

    }

    updateScoreboard(){
        const scoresDiv = document.getElementById('scores');
        let scoreText = '';

        this.players.forEach(player => {
            scoreText += `${player.name}: ${player.score || 0} (Streak: ${player.streak || 0}) `
        });

        scoresDiv.textContent = scoreText;
    }

    async ping(){
        try{
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.website}/api/local/ping`, {
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            if(response.ok){
                const data = await response.json();
                return {
                    online: true,
                    latency: Date.now() - (data.timestamp * 1000),
                    data: data
                };
            }

            return {online: false, error: 'Bad response'}
        } catch (error){
            return { online: false, error: error.name === 'AbortError' ? 'Timeout': 'Connection Failed'}
        }
    }

    async checkStatus(token){
        try{
            const response = await fetch(`${this.website}/api/local/status/simple`, {
                headers: token ? {'X-Auth-Token': token}: {},
                cache: 'no-cache'
            });

            if(response.ok){
                const data = await response.json();
                this.lastStatus = {
                    online: true,
                    authenticated: data.auth_status === 'authenticated',
                    timestamp: data.timestamp,
                    data: data
                };
            } else {
                this.lastStatus = {
                    online: true,
                    authenticated: false,
                    error: `HTTP ${response.status}`
                };
            }
        } catch (error) {
            this.lastStatus = {
                online: false,
                error: error.message
            };
        }

        this.statusCallbacks.forEach(cb => cb(this.lastStatus));
        return this.lastStatus;
    }

    async healthCheck(token){
        try{
            const response = await fetch(`${this.website}/api/local/health`, {
                headers: token ? {'X-Auth-Token': token} : {},
                cache: 'no-cache'
            });

            if(response.ok){
                const data = await response.json();
                this.healthCallbacks.forEach(cb => cb(data));
                return data;
            }
        } catch (error) {
            console.error('Health check failed: ', error);
        }
        return null;
    }

    connectSocketIO(socket){
        this.socket = socket;

        socket.on('connect', () => {
            console.log('Socket connected, requesting status');
            socket.emit('request_server_status');
        });

        socket.on('server_status_update', (status) => {
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                ...status
            }));
        });

        socket.on('disconnect', () => {
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                online: false,
                error: 'Socket disconnected'
            }));
        });
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

    collectFilterSelections(){
        const selections = {
            tags: {include: [], exclude: []},
            languages: { include: [], exclude: [] },
            decades: { include: [], exclude: [] },
            difficulties: { include: [], exclude: [] },
            genres: { include: [], exclude: [] },
            production_companies: { include: [], exclude: [] },
            networks: { include: [], exclude: [] },
            countries: { include: [], exclude: [] },
            special_openings: {include: [], exclude: []},            
        }

        const listIds = ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list', 'countries-list'];

        listIds.forEach(listId => {
            const section = listId.split('-')[0];
            let target;

            if(section === 'production') target = 'production_companies';
            else target = section

            const list = document.getElementById(listId);
            if (!list) return;

            list.querySelectorAll('.tristate-checkbox').forEach(checkbox => {
                const value = checkbox.value;
                const state = checkbox.dataset.tristate || 'null';

                if(state === 'include'){
                    selections[target].include.push(value);
                } else if (state === 'exclude'){
                    selections[target].exclude.push(value);
                }
            });
        });

        const special_openings = document.getElementById('special-checkbox');
        if(!special_openings) return;
        const value = special_openings.value;
        const state = special_openings.dataset.tristate || 'null';

        if(state === 'include') {
            selections['special_openings'].include.push(value);
        } else if (state === 'exclude'){
            selections['special_openings'].exclude.push(value);
        }

        return selections
    }

    async getOptions(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.website}/api/local/game/single/options`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentSong: this.current_song['game_name'],
            })
        });

        if(response.ok){
            return await response.json();
        }
    }

    async playVideo(hidden){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        if(!this.playlist || this.currentPlaylistIndex > this.playlist.length){
            console.log('No more videos in queue');
            this.gameEnded(this.scores, this.highest_streak);
        }

        const video = this.playlist[this.currentPlaylistIndex]

        if(this.mobileMode){
            const isCompatible = await this.checkVideoCompatibility(video.file_path);
            if(!isCompatible){
                console.log('Video not compatible with mobile mode, skipping...');
                this.handleVideoEnded();
                return;
            }
        }
        const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`

        const videoPlayer = document.getElementById('video-player');
        if(hidden){
            videoPlayer.classList.add('video-hidden');
        } else {
            videoPlayer.classList.remove('video-hidden');
        }
        
        videoPlayer.src = videoUrl;
        this.videoStartTime = Date.now();

        videoPlayer.preload = 'auto';

        return new Promise((resolve, reject) => {
            videoPlayer.play().then(() => resolve()).catch(e => {
                console.log('Autoplay prevented: ', e);
                resolve();
            });
        });
    }

    async handleVideoEnded(){
        if(this.currentPlaylistIndex < this.playlist.length){

            await this.loadVideoWithFallback();
            this.current_song = this.playlist[this.currentPlaylistIndex];

            const options = await this.getOptions();
            this.fillButtons(options);

            this.preloadBuffers();

            this.currentRound++;
            this.currentPlaylistIndex++;
        } else {
            this.next_video();
        }
    }
    
    async loadVideoWithFallback() {
        const mainPlayer = document.getElementById('video-player');
        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2');

        mainPlayer.src = buffer1.src;

        buffer1.src = buffer2.src;
        buffer2.removeAttribute('src');
        buffer2.load();

        this.buffer1Index = this.buffer2Index;
        this.buffer2Index = null;

        this.preloadBuffers();

        if(this.hardMode){
            mainPlayer.classList.add('video-hidden');
        } else {
            mainPlayer.classList.remove('video-hidden');
        }

        mainPlayer.currentTime = 0;
        this.videoStartTime = Date.now();

        try{
            const playPromise = mainPlayer.play();
            if(playPromise !== undefined){
                playPromise.catch(e => {
                    console.log('Play failed: ', e);
                    mainPlayer.load();
                    setTimeout(() => {
                        mainPlayer.play().catch(e2 => {
                            console.log('Retry play failed: ', e2);
                            this.handleVideoEnded();
                        })
                    }, 100)
                });
            }
        } catch (e) {
            console.log('Autoplay prevented: ', e);
        }
    }

    async preloadBuffers(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2')

        const nextIndex = this.currentRound + 1;
        const nextNextIndex = this.currentRound + 2;

        if(nextIndex < this.playlist.length && this.buffer1Index !== nextIndex){
            const video = this.playlist[nextIndex];
            buffer1.src = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            buffer1.load();
            this.buffer1Index = nextIndex;
            console.log('Buffered video: ', nextIndex);
        }

        if(nextNextIndex < this.playlist.length && this.buffer2Index !== nextNextIndex){
            const video = this.playlist[nextNextIndex]
            buffer2.src = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${this.token}`;
            buffer2.load();
            this.buffer2Index = nextNextIndex;
            console.log('Buffered video: ', nextNextIndex);
        }
    }

    async loadVideoNormally(videoPlayer){
        const video = this.playlist[this.currentPlaylistIndex];
        const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;

        return new Promise((resolve) => {
            videoPlayer.src = videoUrl;
            videoPlayer.preload = 'auto';

            const timeout = setTimeout(() => {
                console.log(`Loading timeout for video ${this.currentPlaylistIndex + 1}`);
                resolve();
            }, 15000);

            videoPlayer.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, {once: true});

            videoPlayer.addEventListener('error', () => {
                clearTimeout(timeout);
                console.log(`Error loading video ${this.currentPlaylistIndex + 1}`);
                resolve();
            }, {once: true});

            videoPlayer.load();
        });
    }

    async checkVideoCompatibility(video_path){
        if(this.codecCache.has(video_path)){
            return this.codecCache.get(video_path);
        }

        const h264Extensions = ['.mp4', '.m4v', '.mov']
        const isCompatible = h264Extensions.some(ext => video_path.toLowerCase().endsWith(ext));

        this.codecCache.set(video_path, isCompatible);
        return isCompatible;
    }

    async join(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.website}/api/local/game/join`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin
            },
            body: {
                playerName: this.playerName
            }
        });

        if(response.ok){
            const data = await response.json();
            if(data.error != null){
                const input = document.getElementById('player-name-input');
                input.textContent = '';
                alert('Name is already taken. Please choose a different name.');
            }
        }
    }

    fillButtons(options){
        const correctButton = document.getElementById('correct-button');
        if (correctButton) correctButton.id = '';

        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            const buttonText = options[index];
            button.textContent = buttonText.length > 27 ? buttonText.substring(0,27) + '...' : buttonText;
            button.title = buttonText;
            button.dataset.fullTitle = buttonText;

            if (buttonText === this.currentSong?.game_name) {
                button.id = 'correct_button';
            }
        });
    }

    showLoadingScreen(message){
        document.getElementById('loading-screen').style.display = 'block';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('loading-screen').innerHTML = `<h3>${message}</h3>`;
    }

    async nextRound() {
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }        
        
        try{
            const nextBtn = document.getElementById('next-video');
            nextBtn.disabled = true;

            const response = await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/next-round`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playerName: this.playerName
                })
            });
            if(response.ok){
                const data = await response.json();
                if (data.ended) {
                    return;
                }
                const videoPlayer = document.getElementById('video-player');
                videoPlayer.pause();
                videoPlayer.src = ''
                videoPlayer.classList.remove('video-hidden');

                document.querySelectorAll('.answer-btn').forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('answered', 'correct', 'incorrect');
                    btn.style.removeProperty('background-color');
                });

                const timer = document.getElementById('timer');
                if(timer) timer.remove();

                this.hasAnswered = false;
                this.answerSubmitted = false;
                this.playbackStarted = false;
                this.videoReady = false;

                this.showLoadingScreen('Loading next video...');
            } else {
                console.error('Failed to advance round');
                document.getElementById('next-video').disabled = false;
            }

        } catch (error) {
            console.error('Failed to advance round: ', error);
            document.getElementById('next-video').disabled = false;
        }
    }

    showLeaderboard(){
        this.leaderboardShown = true;
        document.getElementById('game-screen').style.display = 'none';

        const leaderboardDiv = document.createElement('div');
        leaderboardDiv.className = 'leaderboard';
        leaderboardDiv.innerHTML = '<h2>Game Over!</h2>';

        const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            leaderboardDiv.innerHTML += `
                <div class="leaderboard-row ${index === 0 ? 'winner' : ''}">
                    <span>${index + 1}. ${player.name}</span>
                    <span>${player.score} points</span>
                    <span>Highest Streak: ${player.highest_streak || 0}</span>
                </div>
            `;
        });

        leaderboardDiv.innerHTML += '<button onclick="window.location.href=\'lobby.html\'" class="btn btn-primary">Back to Lobby</button>';
        document.getElementById('app').appendChild(leaderboardDiv);
    }

    async leaveGame(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }   
        
        try{
            await fetch(`${this.website}/api/local/multiplayer/leave`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                }, 
                body: JSON.stringify({
                    gameCode: this.gameCode,
                    playerName: this.playerName
                })
            });
        } catch (error) {
            console.error('Failed to leave game: ', error);
        }

        clearInterval(this.gameStatePollInterval);
        localStorage.removeItem('multiplayerGame');
        localStorage.removeItem('mutliplayerGameCode');
        window.location.href = 'lobby.html';
    }
    
    gameEnded(scores, highest_streak){
        const main = document.getElementById('video-player');
        main.pause();
        this.isGameActive = false;
        const gameScreen = document.getElementById('game-screen');
        
        alert(`Game over!\nFinal score: ${scores}\nHighest Streak: ${highest_streak}`)

        gameScreen.style.display = 'none';
        gameScreen.classList.remove('active');

        window.location.href = "tsPlayer.html";
    }

    isH264Codec(codec){
        if (!codec) return false;
        const codecLower= codec.toLowerCase();
        return codecLower.includes('h264') || codecLower.includes('avc') || codecLower.includes('h.264') || codecLower === 'avc1';
    }

    toggleSection(header){
        const content = header.nextElementSibling;
        content.classList.toggle('active');
        const arrow = header.querySelector('.arrow');
        arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
    }


}

const game = new MultiplayerGame();