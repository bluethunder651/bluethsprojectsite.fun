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
        this.isLoading = false;
        this.playbackStarted = false;
        this.leaderboardShown = false;

        this.buffer1Index = null;
        this.buffer2Index = null;

        this.gameStatePollInterval = null;
        this.videoReady = false;

        this.socket = io(this.website, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
        })

        this.loadGameData();
        this.initVideoPlayer();
        this.connectSocket();
        this.setupEventListeners();
    }

    generateSessionId(){
        const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('sessionId', sessionId);
        return sessionId;
    }

    connectSocket() {
        this.socket = io(this.website, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.socket.on('connect', () =>{
            console.log('Socket connected');
            if(this.gameCode && this.playerName && this.token){
                this.joinGameRoom();
                this.fetchInitialPlaylist();
            }
        });

        this.socket.on('disconnect', () => {
            console.log("Socket disconnected");
            this.showLoadingScreen('Connection lost. Reconnecting...');
        });

        this.socket.on('reconnect', () => {
            console.log('Socket reconnected.');
            if(this.gameCode && this.playerName && this.token){
                this.joinGameRoom();
            }
        })

        this.socket.on('player_joined', (data) => {
            this.players = data.players;
            this.updateScoreboard();
            this.addChatMessage('system', `${data.playerName} joined the game`);
        });

        this.socket.on('player_left', (data) => {
            this.players = data.players;
            if(data.newHost){
                this.isHost = (this.playerName === data.newHost);
                this.addChatMessage('system', `${data.playerName} left. New host: ${data.newHost}`);
            } else {
                this.addChatMessage('system', `${data.playerName} left the game.`);
            }
            this.updateScoreboard();
        });

        this.socket.on('game_starting', (data) => {
            console.log("Game starting.")
            this.players = data.players;
            this.hardMode = data.hardMode;
            this.timeLimit = data.timeLimit;
            this.playlist = data.playlist;
            this.showLoadingScreen('Game starting...');
        });

        this.socket.on('round_loading', (data) => {
            console.log("round loading...")
            this.currentRound = data.currentRound;
            this.currentSong = data.currentSong;
            this.videoReady = false;
            this.playbackStarted = false;
            this.hasAnswered = false;
            this.answerSubmitted = false;

            if(this.currentSong){
                this.fillButtons(this.currentSong.options);
                this.showLoadingScreen('Loading video...');
                this.loadVideo(this.currentSong.file_path);
            }
        });

        this.socket.on('round_start', (data) => {
            console.log("round starting.")
            this.startPlayback(data);
        });

        this.socket.on('round_reveal', (data) => {
            this.updatePlayerScore(this.playerName, data.scores, data.streaks);

            this.showAnswerReveal(data);
        })

        this.socket.on('next_round', (data) => {
            this.currentRound = data.currentRound;
            this.currentSong = data.currentSong;
            this.prepareNextRound();
        });

        this.socket.on('game_ended', (data) => {
            document.getElementById('video-player').pause();
            if(!this.leaderboardShown){
                this.showLeaderboard(data);
            }
        });

        this.socket.on('error', (data) => {
            console.error('Socket error: ', data.message);
            alert(data.message);
        });

        this.socket.on('game_state_sync', (data) => {
            console.log("Received game state sync: ", data);

            if(data.players){
                this.players = data.players;
            }
            if (data.scores) {
                this.players.forEach(player => {
                    player.score = data.scores[player.name] || 0;
                    player.streak = data.streaks?.[player.name] || 0;
                    player.highest_streak = data.highestStreaks?.[player.name] || 0;
                });
            }

            this.updateScoreboard();
        });
    }

    joinGameRoom() {
        if (!this.socket || !this.socket.connected){
            console.log("Socket not connected yet, will retry");
            setTimeout(() => this.joinGameRoom(), 500);
            return;
        }

        if(!this.gameCode || !this.playerName || !this.token){
            console.log('Missing fields for joining room.');
            return;
        } 

        console.log("Joining game room: ", this.gameCode);
        this.socket.emit('join_game_room', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            sessionId: this.sessionId
        });

        setTimeout(() => {
            this.requestCurrentGameState();
        }, 500);
    }

    requestCurrentGameState(){
        if(!this.socket || !this.socket.connected) return;

        console.log("Requesting current game state");
        this.socket.emit('request_game_state', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName
        });
    }

    setupEventListeners(){
        
        document.addEventListener('DOMContentLoaded', async function() {
    
            document.querySelectorAll('.answer-btn').forEach(button => {
                button.addEventListener('click', (e) => game.handleAnswerClick(e));
            });

            document.getElementById('go-back-btn').addEventListener('click', () => {
                if(confirm('Leave the game?')){
                    game.leaveGame();
                }
            });

            document.getElementById('next-video').addEventListener('click', () => {
                game.nextRound();
            });

            document.getElementById('end-game').addEventListener('click', () => {
                game.confirmEndGame();
            });

            document.getElementById('next-video').disabled = true;
    

        });
    }

    async loadVideo(filePath){
        if(this.videoReady || this.isLoading) return;
        this.isLoading = true;

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return;
        }

        const loadingScreen = document.getElementById('loading-screen');
        const gameScreen = document.getElementById('game-screen');

        loadingScreen.style.display = 'block';
        gameScreen.style.display = 'none';

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('answered', 'correct', 'incorrect');
            btn.style.removeProperty('background-color');
        });

        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2');

        const videoUrl =  `${this.website}/api/local/videos/${encodeURIComponent(filePath)}?token=${encodeURIComponent(this.token)}`;

        try{
            if(this.currentRound === 0){
                this.videoPlayer.setVideo(videoUrl);
            } else {
                if (buffer1 && buffer1.src){
                    this.videoPlayer.setVideo(buffer1.src);

                    if (buffer2 && this.buffer2Index !== null){
                        buffer1.src = buffer2.src;
                        buffer2.removeAttribute('src');
                        buffer2.load();

                        this.buffer1Index = this.buffer2Index;
                        this.buffer2Index = null;
                    }
                } else {
                    this.videoPlayer.setVideo(videoUrl);
                }
            }

            this.videoPlayer.startPoint = 0;
            this.videoPlayer.bufferLength = 15;

            this.videoPlayer.startBufferMonitor();

            console.log("Video loading initiated");
        } catch (error) {
            console.error("Failed to load video: ", error);
            this.isLoading = false;

            loadingScreen.innerHTML = `
                <h3>Failed to load video</h3>
                <p>${error.message}</p>
                <button onclick="location.reload()" class="btn btn-primary">Retry</button>
            `;            
        }
    }
    
    initVideoPlayer(){
        const videoElement = document.getElementById("video-player");

        if(videoElement && typeof VideoPlayer !== 'undefined'){
            if(videoElement.player){
                videoElement.player.dispose();
            }

            this.videoPlayer = new VideoPlayer(videoElement);

            this.videoPlayer.handleVideoReady = () => {
                console.log("Video ready in player");
                this.videoReady = true;
                this.isLoading = false;

                this.socket.emit('player_loaded', {
                    token: this.token,
                    gameCode: this.gameCode,
                    playerName: this.playerName
                });

                document.getElementById('loading-screen').innerHTML = '<h3>Waiting for other players...</h3>';

                this.preloadBuffers();
            }

            this.videoPlayer.handleVideoFinishedBuffering = () => {
                console.log("Video finished buffering...");
            }
        }
    }

    async loadGameData() {
        const urlParams = new URLSearchParams(window.location.search);
        this.gameCode = urlParams.get('code') || localStorage.getItem('multiplayerGameCode');
        this.playerName = localStorage.getItem('playerName');
        this.sessionId = localStorage.getItem('sessionId');

        const gameData = JSON.parse(localStorage.getItem('multiplayerGame') || '{}');
        this.totalRounds = gameData.rounds || 20;
        this.hardMode = gameData.hardMode || true;
        this.timeLimit = gameData.timeLimit || 20;
        this.players = gameData.players || [];
        this.isHost = (gameData.host === this.playerName);

        console.log('this.isHost: ', this.isHost, ", gameData.host: ", gameData.host, ", this.playerName: ", this.playerName);

        if(!this.gameCode || !this.playerName){
            alert('No game data found.');
            window.location.href = 'lobby.html';
            return;
        }

        await this.refreshToken();
        if(this.token){
            this.startHeartbeat();
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

    async startPlayback(game_settings) {
        if(this.playbackStarted) return;
        this.playbackStarted = true;

        const loading_screen = document.getElementById('loading-screen');
        const game_screen = document.getElementById('game-screen');
        
        loading_screen.style.display = 'none';  
        game_screen.style.display = 'block';

        if(this.hardMode){
            this.videoPlayer.hide();
        } else {
            this.videoPlayer.show();
        }

        this.videoStartTime = Date.now()

        const time_limit_check = game_settings.time_limit_check;

        this.videoPlayer.playOnReady = true;

        this.videoPlayer.playVideo();

        if(game_settings.time_limit_check){
            this.startTimer(this.timeLimit);
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

        this.socket.emit('submit_answer', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            selectedOption: selectedOption,
            correctOption: this.currentSong.game_name,
            answerTime: Date.now(),
            videoStartTime: this.videoStartTime
        });

    }

    showAnswerReveal(answer){
        const correctButton = Array.from(document.querySelectorAll('.answer-btn')).find(btn => btn.dataset.fullTitle === answer);
        if(correctButton){
            correctButton.style.backgroundColor = '#4CAF50';
        }
        this.players.forEach(player => {    
            const playerResult = answer.results[player.name];
            if(playerResult){
                const playerButton = Array.from(document.querySelectorAll('.answer-btn')).find(btn => btn.dataset.fullTitle === playerResult.selected);
                if (playerButton){
                    playerButton.classList.add(playerResult.correct ? 'correct' : 'incorrect');
                }
            }
        });

        this.updateScoreboard();

        document.getElementById('video-player').classList.remove('video-hidden')
        
        console.log('this.isHost: ', this.isHost);

        if(this.isHost){
            const nextBtn = document.getElementById('next-video');
            nextBtn.disabled = false;
        }

        const timer = document.getElementById('timer');
        if (timer) timer.remove();
    }

    updatePlayerScore(playerName, scores, streaks){
        this.players.forEach(p => {
            if (p.name){
                if (scores[p.name] !== undefined){
                    p.score = scores[p.name];
                }
                if (streaks[p.name] !== undefined){
                    p.streak = streaks[p.name];
                }
            }
        });

        this.updateScoreboard();
    }

    updateScoreboard(){
        const scoresDiv = document.getElementById('scores');
        let scoreText = '';

        this.players.forEach(player => {
            scoreText += `${player.name}: ${player.score || 0} (Streak: ${player.streak || 0}) `
        });

        scoresDiv.textContent = scoreText;
    }

    addChatMessage(sender, message, timestamp = null){
        const chatMessages = document.getElementById('chat-messages');
        if(!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        let timeString = '';
        if(timestamp){
            const date = new Date(timestamp * 1000);
            timeString = `<span class="chat-time">[${date.toLocaleTimeString()}]</span>`;
        }

        if(sender === 'system'){
            messageElement.classList.add('system');
            messageElement.innerHTML = message;
        } else {
            messageElement.innerHTML = `
                ${timeString}
                <span class="sender">${sender}:</span>
                <span class="text">${this.escapeHtml(message)}</span>
            `;
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    confirmEndGame(){
        if(this.isHost){
            if(confirm('End the game?')){
                document.getElementById('video-player').pause();
                this.socket.emit('end_game', {
                    token: this.token,
                    player_name: this.playerName,
                    game_code: this.gameCode,
                    sessionId: this.sessionId
                })
            }
        }
        else {
            console.log("this.isHost: ", this.isHost)
        }
    }

    escapeHtml(text){
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    sendChatMessage(){
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!messgae || !this.gameCode) return;

        this.socket.emit('multiplayer_chat_send', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            message: message
        });

        input.value = "";
    }

    prepareNextRound(){
        this.videoPlayer.stopVideo();
        this.videoPlayer.pauseVideo();

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('answered', 'correct', 'incorrect');
            btn.style.removeProperty('background-color');
        });
        
        const timer = document.getElementById('timer');
        if (timer) timer.remove();

        this.hasAnswered = false;
        this.answerSubmitted = false;
        this.playbackStarted = false;
        this.videoReady = false;

        this.fillButtons(this.currentSong.options);
        this.showLoadingScreen('Loading next video...');
        this.loadVideo(this.currentSong.file_path);
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

    async preloadBuffers(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2');

        const nextIndex = this.currentRound + 1;
        const nextNextIndex = this.currentRound + 2;

        if(nextIndex < this.playlist.length && this.buffer1Index !== nextIndex){
            const video = this.playlist[nextIndex];
            buffer1.src = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            buffer1.load();
            this.buffer1Index = nextIndex;
        }

        if(nextNextIndex < this.playlist.length && this.buffer2Index !== nextNextIndex){
            const video = this.playlist[nextNextIndex]
            buffer2.src = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${this.token}`;
            buffer2.load();
            this.buffer2Index = nextNextIndex;
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
        console.log("this.isHost: ", this.isHost);
        if(!this.isHost) return;

        this.socket.emit('host_next_round', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName
        });
        document.getElementById('next-video').disabled = true;
    }

    showLeaderboard(finalData = null){
        this.leaderboardShown = true;
        document.getElementById('game-screen').style.display = 'none';
        
        const scores = finalData.finalScores;
        const highest_streaks = finalData.highestStreaks; 

        this.players.forEach(p => {
            if (p.name){
                if (scores[p.name] !== undefined){
                    p.score = scores[p.name];
                }
                if (highest_streaks[p.name] !== undefined){
                    p.highest_streak = highest_streaks[p.name];
                }

            }
        });

        const leaderboardDiv = document.createElement('div');
        leaderboardDiv.className = 'leaderboard';
        leaderboardDiv.innerHTML = '<h2>Game Over!</h2>';

        const sortedPlayers = [...this.players].sort((a, b) => b.score - a.score);

        sortedPlayers.forEach((player, index) => {
            leaderboardDiv.innerHTML += `
                <div class="leaderboard-row ${index === 0 ? 'winner' : ''}">
                    <span>${index + 1}. ${player.name}:</span>
                    <span>${player.score} points,</span>
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

        if(this.videoPlayer){
            this.videoPlayer.stopVideo();
            this.videoPlayer.pauseVideo();
            this.videoPlayer.stopBufferMonitor();
        }
        
        this.socket.emit('leave_game', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            sessionId: this.sessionId
        })


        this.socket.disconnect();
        clearInterval(this.heartbeatInterval);
        localStorage.removeItem('multiplayerGame');
        localStorage.removeItem('mutliplayerGameCode');
        window.location.href = 'lobby.html';
    }

    startHeartbeat(){
        this.heartbeatInterval = setInterval(() => {
            if(this.socket && this.socket.connected){
                this.socket.emit('heartbeat', {
                    token: this.token,
                    sessionId: this.sessionId,
                    gameCode: this.gameCode,
                    playerName: this.playerName
                });
            }
        }, 30000);
    }
}

const game = new MultiplayerGame();