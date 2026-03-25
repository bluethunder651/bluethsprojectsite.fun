class SingleplayerGame{
    constructor(){
        this.website = 'https://julia.bluethsprojectsite.fun';
        this.token = null;
        this.tokenExpiry = null;
        this.mobileMode = false;
        this.codecCache = new Map();
        this.statusCallbacks = [];

        this.hardMode = true;
        this.time_limit_check = false;
        this.timeLimit = 0;

        this.playlist = [];
        this.currentSong = null;
        this.currentPlaylistIndex = 0;
        this.videoStartTime = null;
        this.isLoading = false;
        this.playbackStarted = false;
        this.hasAnswered = false;
        
        this.bufferQueue = [];
        this.nextBufferFillIndex = 1;

        this.videoReady = false;

        this.socket = io(this.website, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
        });

        this.initVideoPlayer();
        this.connectSocket();
        this.setupEventListeners();
    }

    initVideoPlayer(){
        const videoElement = document.getElementById('video-player');
        this.videoPlayer = new VideoPlayer(videoElement);

        this.videoPlayer.handleVideoReady = () => {
            console.log('Main video ready (>=40% buffered)');
            this.videoReady = true;
            this.isLoading = false;

            this.startPlayback();
        }

        this.videoPlayer.handleError = () => {
            console.error('Video player error - could not load video.');
            this.isLoading = false;
        }
    }

    connectSocket(){
        this.socket.on('connect', () => {
            this.socket.emit('request_server_status');
        });

        this.socket.on('server_status_update', (status) => {
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                ...status
            }));
        });

        this.socket.on('disconnect', () => {
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                online: false,
                error: 'Socket disconnected'
            }));
        });
    }

    async refreshToken(){
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
        } catch (error){
            console.log('Server not available.');
            return false;
        }
    }

    setupEventListeners(){
        document.addEventListener('DOMContentLoaded', async () => {
            const video = document.getElementById('video-player');

            let filterMetadata = await player.getFilterMetadata();

            document.getElementById('refresh-status').addEventListener('click', () => {
                const btn = this;
                btn.disabled = true;
                btn.textContent = 'Refreshing...';

                player.ping().then(result => {
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = '↻ Status';
                    }, 1000)
                });
            });

            document.querySelectorAll('.filter-header').forEach(id => {
                id.addEventListener('click', () => {
                    const header = this;
                    player.toggleSection(header);
                });
            });

            document.getElementById('options').addEventListener('click', async function() {
                const filters = document.getElementById('filter-options');

                if(filters.style.display === 'none' || !filters.style.display){
                    filters.style.display = 'block';
                    await player.loadFilters(filterMetadata);
                } else {
                    filters.style.display = 'none';
                }
            });

            document.getElementById('singleplayer').addEventListener('click', () => {
                this.currentPlaylistIndex = 0;
                player.start_singleplayer_game();
            });

            document.getElementById('multiplayer').addEventListener('click', () => {
                window.location.href = 'lobby.html';
            });

            document.querySelectorAll('.answer-btn').forEach(button => {
                let pressTimer;
                let isLongPress = false;

                button.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        alert(button.CDATA_SECTION_NODE.fullTitle);
                    }, 500);
                }, {passive: true});

                button.addEventListener('touchend', (e) => {
                    clearTimeout(pressTimer);
                    if(isLongPress){
                        e.preventDefault();
                    }
                });

                button.addEventListener('touchmove', () => {
                    clearTimeout(pressTimer);
                });

                button.addEventListener('click', function(e) {
                    if(isLongPress){
                        e.preventDefault();
                        return;
                    }

                    document.querySelectorAll('.answer-btn').forEach(btn => {
                        btn.disabled = true;
                        btn.classList.remove('answered');
                    });

                    this.classList.add('answered');

                    const selectedOption = this.dataset.fullTitle;

                    document.getElementById('video-player').classList.remove('video-hidden');
                    player.submitAnswer(selectedOption);
                });
            });

            document.getElementById('next-video').addEventListener('click', () => {
                player.next_video();
            });

            document.getElementById('go-back-btn').addEventListener('click', async () => {
                const response = await fetch(`${this.website}/api/local/single/next`, {
                    method: 'POST',
                    headers: {
                        'X-Auth-Token': this.token,
                        'Referer': window.location.origin,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playerName: player.playerName
                    })
                });

                if(response.ok){
                    const data = await response.json();
                    this.scores = data.scores;
                    this.highest_streak = data.highest_streak;
                    player.gameEnded(this.scores, this.highest_streak);
                }
            });
        });
    }

    async _fillBuffers(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return;
        }

        const bufferElements = [
            document.getElementById('video-buffer1'),
            document.getElementById('video-buffer2')
        ]

        if(this.nextBufferFillIndex <= this.currentRound){
            this.nextBufferFillIndex = this.currentRound + 1;
        }

        while(this.bufferQueue.length < 2 && this.nextBufferFillIndex < this.playlist.length){
            const slotIndex = this.bufferQueue.length;
            const video = this.playlist[this.nextBufferFillIndex];
            let videoUrl = '';
            if(video.compressed !== 0){
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
            } else {
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            }
            const el = bufferElements[slotIndex];
            el.preload = 'auto';
            el.src = videoUrl;
            el.load();

            this.bufferQueue.push({videoUrl, playlistIndex: this.nextBufferFillIndex});
            this.nextBufferFillIndex++;
        }
    }

    async loadVideo(compressed, compressed_file_path, file_path){
        if(this.videoReady || this.isLoading) return;
        this.isLoading = true;

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) {this.isLoading = false; return;}
        }

        let videoUrl = '';

        if(compressed !== 0 && compressed_file_path){
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
        } else {
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(file_path)}?token=${encodeURIComponent(this.token)}`;
        }
        this.videoPlayer.load(videoUrl);
    }

    async startPlayback(){
        if(this.playbackStarted) return;
        this.playbackStarted = true;

        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';

        if(this.hardMode){
            this.videoPlayer.hide();
        } else {
            this.videoPlayer.show();
        }

        this.videoStartTime = Date.now();

        this.videoPlayer.play();

        if(this.time_limit_check){
            this.startTimer(this.timeLimit);
        }
        this._fillBuffers();
    }

    startTimer(seconds){
        const timerDisplay = document.createElement('div');
        timerDisplay.id = 'timer';
        timerDisplay.className = 'timer';
        document.getElementById('video-screen').appendChild(timerDisplay);

        let timeLeft = seconds;
        timerDisplay.textContent = `Time left: ${timeLeft}s`;

        const timer = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = `Time left: ${timeLeft}s`;

            if(timeLeft <= 0){
                clearInterval(timer);
                timerDisplay.remove();
                this.submitAnswer(null);
            }
        }, 1000)
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
            if(!this.token) return [];
        }

        if(this.answerSubmitted) return;
        this.answerSubmitted = true;

        const response = await fetch(`${this.website}/api/local/single/submit`, {
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

    async prepareNextRound(){
        this.videoPlayer.stop();

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
        this.isLoading = false;

        const options = await this.getOptions();

        this.fillButtons(options);

        if(this.hardMode){
            this.videoPlayer.hide();
        } else {
            this.videoPlayer.show();
        }
        
        if(this.bufferQueue.length > 0){
            const next = this.bufferQueue.shift();

            const bufferElements = [document.getElementById('video-buffer1'),
                                    document.getElementById('video-buffer2')];

            if(this.bufferQueue.length > 0){
                const nextBuffer = this.bufferQueue[0];
                const nextSlot = this.bufferQueue.length % 2;
                bufferElements[nextSlot].src = nextBuffer.videoUrl;
                bufferElements[nextSlot].load()
            }

            this.isLoading = true;
            this.videoPlayer.load(next.videoUrl);
        } else {
            console.warn('Buffer queue empty - loading video directly.');
            this.loadVideo(this.currentSong.compressed, this.currentSong.compressed_file_path, this.currentSong.file_path);
        }
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
        } catch (error) {
            return {online: false, error: error.name === 'AbortError' ? 'Timeout' : 'Connection Failed'}
        }
    }

    async getOptions(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.website}/api/local/single/options`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentSong: this.currentSong['game_name']
            })
        });

        if(response.ok){
            return await response.json();
        }
    }

    fillButtons(options){
        const correctButton = document.getElementById('correct-button');
        if(correctButton) correctButton.id = '';

        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            const buttonText = options[index];
            button.textContent = buttonText.length > 27 ? buttonText.substring(0, 27) + '...' : buttonText;
            button.title = buttonText;
            button.dataset.fullTitle = buttonText;

            if(buttonText === this.currentSong.game_name){
                button.id = 'correct-button'
            }
        });
    }

    async getFilterMetadata(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        try{
            const response = await fetch(`${this.website}/api/local/metadata/filters`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if(response.ok){
                return await response.json();
            } else {
                console.error('Failed to fetch filter metadata, status: ', response.status);
            }
        } catch (error) {
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
                        <span class="tristate-state>(null)</span>
                    </label>
                `;

                container.appendChild(div);

                const checkbox = div.querySelector('.tristate-checkbox');
                const stateSpan = div.querySelector('.tristate-state');

                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.cycleTristate(checkbox);

                    const state = checkbox.dataset.tristate || 'null';

                    if(state === 'include'){
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
                if(state === 'include'){
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
        } else if (state === 'exclude'){
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
        const landing_screen = document.getElementById('landing-screen');
        const loading_screen = document.getElementById('loading-screen');
        const filterOptions = document.getElementById('filter-options');    

        landing_screen.style.display = 'none';
        loading_screen.style.display = 'block';
        filterOptions.style.display = 'none';

        landing_screen.classList.remove('active');
        loading_screen.classList.add('active');

        const response = await fetch(`${this.website}/api/local/single/start`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                playerName: this.playerName,
                selections: selections,
                rounds: this.totalRounds,
                startRange: enableRandomStartTime ? [startMin, startMax] : [0,0],
                hintPercent: enableHintMode ? hintPercent : 25,
                hardMode: this.hardMode
            })
        });

        if(response.ok){
            const game_screen = document.getElementById('game-screen');
            
            const data = await response.json();

            this.playlist = data.playlist;

            this.shuffleArray(this.playlist)

            this.currentPlaylistIndex = 0;
            this.currentRound = 0;

            const song = this.playlist[0];
            this.currentSong = song;

            const options = await this.getOptions();

            loading_screen.innerHTML = '<h3>Loading...</h3>'

            this.fillButtons(options);
            this.loadVideo(song.compressed, song.compressed_file_path, song.file_path);
        }
    }

    shuffleArray(array){
        for (let i = array.length - 1; i > 0; i--){
            const j = Math.floor(Math.random()*(i+1));
            [array[i], array[j]] = [array[j], array[i]]
        }
    }

    async next_video(){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }

        if(!this.token) return[];
        
        const response = await fetch(`${this.website}/api/local/single/next`, {
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
            this.highest_streak = data.highest_streak;

            if(data.ended === true || this.currentPlaylistIndex >= this.playlist.length){
                this.gameEnded(this.scores || document.getElementById('scores').textContent, this.highest_streak || 0);
                this.isGameActive = false;
                return;
            }

            this.currentRound++;
            this.currentPlaylistIndex++;

            const song = this.playlist[this.currentPlaylistIndex];
            this.currentSong = song;

            document.getElementById('game-screen').style.display = 'none';
            document.getElementById('loading-screen').style.display = 'block';

            await this.prepareNextRound().then(await this.startPlayback);
        }
    }

    gameEnded(scores, highest_streak){
        const main = document.getElementById('video-player');
        main.pause();
        this.isGameActive = false;
        const game_screen = document.getElementById('game-screen')
        const landing_screen = document.getElementById('landing-screen')

        alert(`Game over!\nFinal score: ${scores}\nHighest Streak: ${highest_streak}`)

        game_screen.style.display = 'none';
        landing_screen.style.display = 'block';
        landing_screen.classList.add('active');
        game_screen.classList.remove('active');
    }

}

const player = new SingleplayerGame();