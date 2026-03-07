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
        this.currentRound = 0;
        this.hardMode = false;
        this.timeLimit = 0;

        this.playlist = [];
        this.currentSong = null;
        this.currentPlaylistIndex = 0;
        this.videoStartTime = null;
        this.hasAnswered = false;
        this.answerSubmitted = false;

        this.gameStatePollInterval = null;
        this.videoReady = false;

        this.setupEventListeners();
        this.loadGameData();
    }

    setupEventListeners(){
        
        document.addEventListener('DOMContentLoaded', async function() {
            document.querySelectorAll('.answer-btn').forEach(button => {
                button.addEventListener('click', (e) => this.handleAnswerClick(e));
            });

            document.getElementById('video-player').addEventListener('ended', () => {
                if(this.gameStatePollInterval && !this.answerSubmitted){
                    this.submitAnswer(null);
                }
            });

            document.getElementById('go-back-btn').addEventListener('click', () => {
                if(confirm('Leave the game?')){
                    this.leaveGame();
                }
            });

            document.getElementById('next-video').style.display = 'none';
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
                this.currentRound = 0;
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

        switch(state.phase){
            case 'loading':
                if(state.currentRound !== this.currentRound){
                    this.currentRound = state.currentRound;
                    this.currentSong = state.currentSong;
                    this.showLoadingScreen('Loading video...');
                }
                break;
            case 'playing':
                if(state.currentRound !== this.currentRound || !this.videoReady){
                    this.currentRound = state.currentRound;
                    this.currentSong = state.currentSong;
                    this.loadAndPlayVideo(state.currentSong);
                }

                if(state.timeRemaining){
                    this.updateTimer(state.timeRemaining);
                }
                break;
            case 'reveal':
                this.showAnswerReveal(state);
                break;
            case 'round_end':
                setTimeout(() => {
                    if(this.isHost){
                        this.nextRound();
                    }
                }, 3000);
                break;
            case 'game_end':
                this.showLeaderboard(state);
                break;
        }
    }

    async loadAndPlayVideo(songData){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        this.videoReady = false;
        this.hasAnswered = false;
        this.answerSubmitted = false;

        const loading_screen = document.getElementById('loading-screen');
        const game_screen = document.getElementById('game-screen');
        const videoPlayer = document.getElementById('video-player');

        loading_screen.style.display = 'block';
        game_screen.style.display = 'none';

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('answered', 'correct', 'incorrect');
        });

        this.fillButtons(songData.options);

        const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(songData.file_path)}?token=${encodeURIComponent(this.token)}`;

        videoPlayer.src = videoUrl;
        videoPlayer.preload = 'auto';

        await new Promise((resolve) => {
            const onCanPlay = () => {
                videoPlayer.removeEventListener('canplay', onCanPlay);
                resolve();
            };
            videoPlayer.addEventListener('canplay', onCanPlay);
            videoPlayer.load();
        });

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

        this.videoReady = true;
        this.videoStartTime = Date.now();

        loading_screen.style.display = 'none';
        game_screen.style.display = 'block';

        if(this.hardMode){
            videoPlayer.classList.add('video-hidden');
        } else {
            videoPlayer.classList.remove('video-hidden');
        }

        videoPlayer.play().catch(e => console.log('Autoplay prevented: ', e));

        this.startTimer(this.timeLimit);
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
            }
        }, 1000);
    }

    updateTimer(timeRemaining){
        let timerDisplay = document.getElementById('timer');
        if(!timerDisplay){
            timerDisplay = document.createElement('div');
            timerDisplay.id = 'timer';
            document.getElementById('video-screen').appendChild(timerDisplay);
        }
        timerDisplay.textContent = `Time left: ${Math.round(timeRemaining)}`;
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

    async getVideos() {
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        try{
            const response = await fetch(`${this.website}/api/local/videos`, {
                headers:{
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();

                let videos = [];
                if(data.videos && Array.isArray(data.videos)){
                    videos = data.videos;
                } else if (Array.isArray(data)){
                    videos = data;
                }

                videos.forEach(video => {
                    if(video.filename && video.codec) {
                        const isH264 = this.isH264Codec(video.codec);
                        this.codecCache.set(video.filename, isH264);
                    }
                });

                return videos;
            } else {
                console.error('Failed to fetch videos, status: ', response.status);
            }
        } catch (error){
            console.error('Failed to fetch videos: ', error);
        }

        return [];
    }

    async getFilterMetadata(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        try{
            const response = await fetch(`${this.website}/api/local/metadata/filters`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();
                return data;
            } else {
                console.error('Failed to fetch filter metadata, status: ', response.status);
            }
        } catch (error){
            console.error('Failed to fetch filter metadata: ', error);
        }
    }

    loadFilters(filterMetadata){
        const filterSelections = ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list', 'countries-list'];

        filterSelections.forEach(id => {
            document.getElementById(id).innerHTML = '';
        });

        const metadataMap = [
            {key: 'tags', section: 'tags-list'},
            { key: 'languages', section: 'languages-list' },
            { key: 'decades', section: 'decades-list' },
            { key: 'difficulties', section: 'difficulties-list' },
            { key: 'genres', section: 'genres-list' },
            { key: 'production_companies', section: 'production-companies-list' },
            { key: 'networks', section: 'networks-list' },
            { key: 'countries', section: 'countries-list' }           
        ]

        metadataMap.forEach(({key, section}) => {
            const container = document.getElementById(section);
            if(!container || !filterMetadata[key]) return;

            filterMetadata[key].forEach(item => {
                const div = document.createElement('div');
                div.className = 'tristate-item';

                const value = item.trim().toLowerCase();

                div.innerHTML = `
                    <label class="tristate-container">
                        <input type="checkbox" class="tristate-checkbox" value="${value}" data-tristate="null">
                        <span class="tristate-label">${item}</span>
                        <span class="tristate-state">(null)</span>
                    </label>
                `;

                container.appendChild(div);

                const checkbox = div.querySelector('.tristate-checkbox');
                const stateSpan = div.querySelector('.tristate-state');

                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.cycleTristate(checkbox);

                    const state = checkbox.dataset.tristate || 'null';
                    if (state === 'include'){
                        stateSpan.textContent = '(include)';
                    } else if (state === 'exclude'){
                        stateSpan.textContent = '(exclude)';
                    } else {
                        stateSpan.textContent = '(null)';
                    }
                });
            });
        });

        const specialCheckbox = document.getElementById('special-checkbox');
        if(specialCheckbox){
            specialCheckbox.dataset.tristate = 'null';
            specialCheckbox.addEventListener('click', (e) => {
                e.preventDefault();
                this.cycleTristate(specialCheckbox);

                const specialCheckboxState = document.getElementById('special-checkbox-state');

                const state = specialCheckbox.dataset.tristate || 'null';
                if (state === 'include'){
                    specialCheckboxState.textContent = '(include)';
                } else if (state === 'exclude'){
                    specialCheckboxState.textContent = '(exclude)';
                } else {
                    specialCheckboxState.textContent = '(null)';
                }
            });
        }
    }

    setTristateState(checkbox, state){
        checkbox.dataset.tristate = state;
        checkbox.classList.remove('indeterminate');
        checkbox.checked = false;

        if(state === 'include'){
            checkbox.classList.add('checked');
        } else if (state === 'exclude') {
            checkbox.classList.remove('checked');
            checkbox.classList.add('indeterminate');
        } else {
            checkbox.classList.remove('indeterminate');
        }
    }

    cycleTristate(checkbox){
        const currentState = checkbox.dataset.tristate || 'null';
        let newState;

        switch(currentState){
            case 'null':
                newState = 'include';
                break;
            case 'include':
                newState = 'exclude';
                break;
            case 'exclude':
                newState = 'null';
                break;
            default:
                newState = 'include';
        }

        this.setTristateState(checkbox, newState);
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

    async start_singleplayer_game(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        const input = document.getElementById('player-name-input');
        this.playerName = input.value; 

        if(this.playerName == '' || this.playerName == null){
            return
        }

        this.isGameActive = true;

        const selections = this.collectFilterSelections();

        const enableRandomStartTime = document.getElementById('enable-random-start').checked;
        const startMin = enableRandomStartTime ? (document.getElementById('start-min').value) || 0 : 0;
        const startMax = enableRandomStartTime ? (document.getElementById('start-max').value) || 90 : 0;
        const enableHintMode = document.getElementById('enable-hint-mode').checked;
        const hintPercent = enableHintMode ? (document.getElementById('hint-percent-field').value) || 25 : 0;
        this.totalRounds = parseInt(document.getElementById('rounds-input').value) || 10;
        this.hardMode = document.getElementById('hard-mode').checked;
        
        const response = await fetch(`${this.website}/api/local/game/single/start`, {
            method: "POST",
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                playerName: this.playerName,
                selections: selections,
                rounds: this.totalRounds,
                startRange: enableRandomStartTime ? [startMin, startMax] : [0, 0],
                hintPercent: enableHintMode ? hintPercent : 25,
                hardMode: this.hardMode
            })
        });

        if(response.ok){
            const landing_screen = document.getElementById('landing-screen');
            const loading_screen = document.getElementById('loading-screen');
            const game_screen = document.getElementById('game-screen');
            const filterOptions = document.getElementById('filter-options');

            const data = await response.json();

            this.playlist = data.playlist;

            this.shuffleArray(this.playlist);
            this.currentPlaylistIndex = 0;

            this.clearPreloadedVideos();

            landing_screen.style.display = 'none';
            loading_screen.style.display = 'block';
            filterOptions.style.display = 'none';

            landing_screen.classList.remove('active');
            loading_screen.classList.add('active');

            this.current_song = this.playlist[this.currentPlaylistIndex];

            const options = await this.getOptions();

            const videoPlayer = document.getElementById('video-player');

            let loadStartTime = Date.now();
            let progressInterval = setInterval(() => {
                if(videoPlayer.buffered.length > 0){
                    let bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
                    let duration = videoPlayer.duration;
                    if (duration > 0){
                        let percentLoaded = (bufferedEnd/duration * 100);
                        console.log(`Loading video: ${Math.round(percentLoaded)}`);

                        if(loading_screen.style.display === 'block'){
                            loading_screen.innerHTML = `<h3>Loading... ${Math.round(percentLoaded)}%</h3>`;
                        }
                    }
                }
            }, 100);

            await new Promise((resolve) => {
                const onCanPlay = () => {
                    clearInterval(progressInterval);
                    videoPlayer.removeEventListener('canplay', onCanPlay);
                    videoPlayer.removeEventListener('error', onError);

                    let loadTime = (Date.now() - loadStartTime) / 1000;
                    console.log(`Video loaded in ${loadTime}`);
                    resolve();
                }

                const onError = (e) => {
                    clearInterval(progressInterval);
                    videoPlayer.removeEventListener('canplay', onCanPlay);
                    videoPlayer.removeEventListener('error', onError);
                    console.error('Video failed to load: ', e);
                    resolve();
                }

                videoPlayer.addEventListener('canplay', onCanPlay);
                videoPlayer.addEventListener('error', onError);

                this.playVideo(this.hardMode);
            });

            loading_screen.innerHTML = '<h3>Loading...</h3>';

            loading_screen.style.display = 'none';
            game_screen.style.display = 'block';

            loading_screen.classList.remove('active');
            game_screen.classList.add('active');

            this.fillButtons(options);
            this.preloadNextVideos();

            this.currentPlaylistIndex++;
        }
    }

    clearPreloadedVideos() {
        this.preloadedVideos.clear();
        this.preloadedIndices.clear();
        this.preloadQueue = [];
        this.isPreloading = false;
        const preloadPlayer = document.getElementById('video-preload');
        preloadPlayer.src = '';
        preloadPlayer.load();
    }

    async startAggressivePreloading() {
        if(this.isPreloading || !this.isGameActive) return;
        this.isPreloading = true;

        const preloadPlayer = document.getElementById('video-preload');

        const videosToPreload = [];
        for (let i = 1; i <= this.maxPreloadCount; i++){
            let nextIndex = this.currentPlaylistIndex + i;
            
            if (nextIndex >= this.playlist.length) break;

            if(!this.preloadedIndices.has(nextIndex)){
                videosToPreload.push({
                    index: nextIndex,
                    video: this.playlist[nextIndex]
                });
            }
        }

        for(const item of videosToPreload){
            if(!this.isGameActive) break;

            try {
                if(this.mobileMode) {
                    const isCompatible = await this.checkVideoCompatibility(item.video.file_path);
                    if(!isCompatible){
                        console.log(`Video at index ${item.index} not compatible, skipping preload.`);
                        continue;
                    }
                }

                const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(item.video.file_path)}?token=${encodeURIComponent(this.token)}`;
            
                const tempVideo = document.createElement('video');
                tempVideo.preload = 'auto';
                tempVideo.src = videoUrl;

                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.log(`Preload timeout for video ${item.index + 1}`);
                        resolve();
                    }, 10000);

                    tempVideo.addEventListener('loadedmetadata', () => {
                        clearTimeout(timeout);
                        this.preloadedVideos.set(item.index, tempVideo);
                        this.preloadedIndices.add(item.index);
                        console.log(`Preloaded video ${item.index + 1}/${this.playlist.length}`);
                        resolve();
                    }, {once: true});

                    tempVideo.addEventListener('error', (e) => {
                        clearTimeout(timeout);
                        console.log(`Failed to preload video ${item.index + 1}: `, e);
                        resolve();
                    }, {once: true});

                    tempVideo.load();
                });

            } catch (error) {
                console.log('Error during preloading: ', error);
            }
        }

        this.isPreloading = false;
    }

    shuffleArray(array){
        for (let i = array.length - 1; i > 0; i--){
            const j = Math.floor(Math.random()*(i+1));
            [array[i], array[j]] = [array[j], array[i]]
        }
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
            this.preloadedIndices.delete(this.currentPlaylistIndex);
            await this.loadVideoWithFallback();
            this.current_song = this.playlist[this.currentPlaylistIndex];

            const options = await this.getOptions();
            this.fillButtons(options);

            this.startAggressivePreloading();

            this.currentRound++;
            this.currentPlaylistIndex++;
        } else {
            this.next_video();
        }
    }
    
    async loadVideoWithFallback() {
        const mainPlayer = document.getElementById('video-player');

        if(this.preloadedVideos.has(this.currentPlaylistIndex)){
            const preloadedVideo = this.preloadedVideos.get(this.currentPlaylistIndex);

            if(preloadedVideo.readyState >= 1){
                mainPlayer.src = preloadedVideo.src;
                this.preloadedVideos.delete(this.currentPlaylistIndex);
                console.log(`Using preloaded video for index ${this.currentPlaylistIndex}`);
            } else {
                console.log(`Preloaded video for index ${this.currentPlaylistIndex} not ready, falling back.`);
                this.preloadedVideos.delete(this.currentPlaylistIndex);
                await this.loadVideoNormally(mainPlayer);
            }
        } else {
            console.log(`No preloaded video for index ${this.currentPlaylistIndex}, loading normally.`);
            await this.loadVideoNormally(mainPlayer);
        }

        if(this.hardMode){
            mainPlayer.classList.add('video-hidden');
        } else {
            mainPlayer.classList.remove('video-hidden');
        }

        mainPlayer.currentTime = 0;
        this.videoStartTime = Date.now();

        try{
            await mainPlayer.play();
        } catch (e) {
            console.log('Autoplay prevented: ', e);
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
        document.getElementById('landing-screen').style.display = 'none';
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
            await fetch(`${this.website}/api/local/multiplayer/game/${this.gameCode}/next-round`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Failed to advance round: ', error);
        }
    }

    showLeaderboard(state){
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

    async submit_answer(selectedOption){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.website}/api/local/game/single/submit`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            }, 
            body: JSON.stringify({
                playerName: this.playerName,
                selectedOption: selectedOption,
                correctOption: this.current_song.game_name,
                answerTime: Date.now(),
                videoStartTime: this.videoStartTime
            })
        });

        if(response.ok){
            const data = await response.json();
            document.getElementById('scores').textContent = `${this.playerName}: ${data.scores[this.playerName]}, Streak: ${data.streaks[this.playerName]}`;
            document.querySelectorAll('.answer-btn').forEach(button => {
                button.disabled = true;
            });
            document.querySelectorAll('.answered').forEach(el => {
                el.classList.add(data.results[this.playerName] ? 'correct' : 'incorrect');
            });
            document.getElementById('correct-button').style.setProperty('background-color', '#4CAF50', 'important');
            document.getElementById('next-video').disabled = false;
        }
    }

    async next_video(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.website}/api/local/game/single/next`, {
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
    
            this.scores = data.scores;
            this.highest_streak = data.highest_streak

            if (data.ended === true || this.currentPlaylistIndex >= this.playlist.length){
                this.gameEnded(this.scores || document.getElementById('scores').textContent, this.highest_streak || 0);
                this.isGameActive = false;
                return;
            }

            this.current_song = this.playlist[this.currentPlaylistIndex];

            const options = await this.getOptions();

            this.usePreloadedVideo(options);

            this.startAggressivePreloading();

            this.currentRound++;
            this.currentPlaylistIndex++;
        }
    }

    async usePreloadedVideo(options){
        await this.loadVideoWithFallback();
        this.fillButtons(options);
    }

    async preloadNextVideos(){
        if(!this.isGameActive || this.currentRound >= this.totalRounds) return;
        this.startAggressivePreloading();
    }    

    gameEnded(scores, highest_streak){
        const main = document.getElementById('video-player');
        main.pause();
        this.isGameActive = false;
        const gameScreen = document.getElementById('game-screen');
        const landingScreen = document.getElementById('landing-screen');
        
        alert(`Game over!\nFinal score: ${scores}\nHighest Streak: ${highest_streak}`)

        gameScreen.style.display = 'none';
        landingScreen.style.display = 'block';
        landingScreen.classList.add('active');
        gameScreen.classList.remove('active');

        this.clearPreloadedVideos();
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