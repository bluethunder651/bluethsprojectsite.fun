class tsGame{
    constructor(){
        this.website = 'https://julia.bluethsprojectsite.fun';
        this.token = null;
        this.tokenExpiry = null;
        this.statusCallbacks = [];
        this.healthCallbacks = [];
        this.monitoring = false;
        this.lastStatus = null;
        this.pingInterval = null;
        this.socket = null;
        this.mobileMode = false;
        this.codecCache = new Map();
        this.pendingCodecChecks = new Map();
        this.videoStartTime = Date.now()
        this.playerName = null;
        this.current_song = null;
        this.nextVideoUrl = null;
        this.nextVideoBlob = null;
        this.preloadingNextVideo = null;
        this.isGameActive = false;
        this.currentRound = 1;
        this.totalRounds = 10;
        this.playlist = [];
        this.currentPlaylistIndex = 0;
        this.hardMode = true;
        this.scores = 0;
        this.highest_streak = 0;
        this.preloadQueue = [];
        this.preloadedVideos = new Map();
        this.maxPreloadCount = 2;
        this.bufferSize = 2;
        this.isPreloading = false;
        this.preloadedIndices = new Set();
        this.buffer1Index = null;
        this.buffer2Index = null;

        this.bufferQueue = [];
        this.nextBufferFillIndex = 1;

        this.initVideoPlayer();
        this.setupEventListeners();
    }

    setupEventListeners(){
        
        document.addEventListener('DOMContentLoaded', async function() {
            const videoScreen = document.getElementById('video-screen');
            const videoPlayer = document.getElementById('video-player');
            const preloader = document.getElementById('video-preload');
            const mobileCheckbox = document.getElementById('mobile-mode');

            let filterMetadata = await player.getFilterMetadata();

            document.getElementById('refresh-status').addEventListener('click', function() {
                const btn = this;
                btn.disabled = true;
                btn.textContent = 'Refreshing...';

                player.ping().then(result => {
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = '↻ Status';
                    }, 1000);
                });
            });

            document.querySelectorAll('.filter-header').forEach(id => {
                id.addEventListener('click', function() {
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
                window.location.href = 'lobby.html'
            });

            document.querySelectorAll('.answer-btn').forEach(button => {
                let pressTimer;
                let isLongPress = false;

                button.addEventListener('touchstart', (e) => {
                    isLongPress = false;
                    pressTimer = setTimeout(() => {
                        isLongPress = true;
                        alert(button.dataset.fullTitle);
                    }, 500);
                }, {passive: true});

                button.addEventListener('touchend', (e) => {
                    clearTimeout(pressTimer);
                    if (isLongPress){
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
                    player.submit_answer(selectedOption);
                });
            });

            document.getElementById('next-video').addEventListener('click', () => {
                player.next_video();
            });

            videoPlayer.addEventListener('ended', () => {
                if (this.isGameActive) {
                    this.handleVideoEnded();
                }
            });

            preloader.addEventListener('ended', () => {
                if(this.isGameActive) {
                    this.handleVideoEnded();
                }
            });

            document.getElementById('go-back-btn').addEventListener('click', async () => {
                const response = await fetch(`${player.website}/api/local/single/next`, {
                    method: 'POST',
                    headers: {
                        'X-Auth-Token': player.token,
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
            })
        });
    }

    initVideoPlayer(){
        const videoElement = document.getElementById('video-player');
        this.videoPlayer = new VideoPlayer(videoElement);

        this.videoPlayer.handleVideoEnded = () => {
            this.videoReady = true;
            this.isLoading = false;
        
            this._fillBuffers();
        };

        this.videoPlayer.handleError = () => {
            console.error('Video player error - could not load video.');
            this.isLoading = false;
        }
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
            const video = this.playlist[this.nextBufferFillIndex]
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

    prepareNextRound(){
        this.videoPlayer.stop();

        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('answered', 'correct', 'incorrect');
            btn.style.removeProperty('background-color');
        });

        this.hasAnswered = false;
        this.answerSubmitted = false;
        this.playbackStarted = false;
        this.videoReady = false;
        this.isLoading = false;

        this.fillButtons(this.current_song.options);

        if(this.bufferQueue.length > 0){
            const next = this.bufferQueue.shift();

            const buffer1 = document.getElementById('video-buffer1');
            const buffer2 = document.getElementById('video-buffer2');

            if(this.bufferQueue.length > 0){
                buffer1.preload = 'auto';
                buffer1.src = this.bufferQueue[0].videoUrl;
                buffer1.load();
            } else {
                buffer1.removeAttribute('src');
                buffer1.load();
            }
            buffer2.removeAttribute('src');
            buffer2.load();

            this.isLoading = true;
            this.videoPlayer.load(next.videoUrl);
        } else {
            console.warn('Buffer queue empty - loading video directly.');
            this.loadVideo(this.current_song.file_path);
        }
        this.startPlayback();

    }

    async loadVideo(filePath){
        if(this.videoReady || this.isLoading) return;
        this.isLoading = true;

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) {this.isLoading = false; return;}
        }

        let videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(filePath)}?token=${encodeURIComponent(this.token)}`
        this.videoPlayer.load(videoUrl);
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
                    if(video.file_path && video.codec) {
                        const isH264 = this.isH264Codec(video.codec);
                        this.codecCache.set(video.file_path, isH264);
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
        const landing_screen = document.getElementById('landing-screen');
        const loading_screen = document.getElementById('loading-screen');
        const filterOptions = document.getElementById('filter-options');    

        landing_screen.style.display = 'none';
        loading_screen.style.display = 'block';
        filterOptions.style.display = 'none';

        landing_screen.classList.remove('active');
        loading_screen.classList.add('active');

        const response = await fetch(`${this.website}/api/local/single/start`, {
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
            const loading_screen = document.getElementById('loading-screen');
            const game_screen = document.getElementById('game-screen');

            const data = await response.json();

            this.playlist = data.playlist;

            this.shuffleArray(this.playlist);

            this.currentPlaylistIndex = 0;

            this.clearPreloadedVideos();

            const song = this.playlist[0];
            this.current_song = song;

            const options = await this.getOptions(song.game_name);

            //await this.playVideo(this.hardMode);

            loading_screen.innerHTML = '<h3>Loading...</h3>';

            loading_screen.style.display = 'none';
            game_screen.style.display = 'block';

            loading_screen.classList.remove('active');
            game_screen.classList.add('active');

            this.fillButtons(options);
            this.loadVideo(song.file_path);
            this.startPlayback();
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

    async preloadBuffers() {
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        const buffer1 = document.getElementById('video-buffer1');
        const buffer2 = document.getElementById('video-buffer2');

        const nextIndex = this.currentPlaylistIndex + 1;
        const nextNextIndex = this.currentPlaylistIndex + 2;
    
        if(nextIndex < this.playlist.length && this.buffer1Index !== nextIndex) {
            const video = this.playlist[nextIndex];
            let videoUrl = '';
            if (video.compressed !== 0){
                console.log("Using compressed version.")
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
            } else{
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            }
            buffer1.src = videoUrl;
            buffer1.load();
            this.buffer1Index = nextIndex;
            console.log("Buffered video: ", nextIndex);
        }

        if(nextNextIndex < this.playlist.length && this.buffer2Index !== nextNextIndex){
            const video = this.playlist[nextNextIndex];
            let videoUrl = '';
            if (video.compressed !== 0){
                console.log("Using compressed version.")
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
            } else{
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            }
            buffer2.src = videoUrl;            
            buffer2.load();
            this.buffer2Index = nextNextIndex;
            console.log("Buffered video: ", nextNextIndex);
        }
    }

    shuffleArray(array){
        for (let i = array.length - 1; i > 0; i--){
            const j = Math.floor(Math.random()*(i+1));
            [array[i], array[j]] = [array[j], array[i]]
        }
    }

    async getOptions(gameName){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
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
                currentSong: gameName,
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

        if(!this.playlist || this.currentPlaylistIndex >= this.playlist.length){
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

        let videoUrl = "";
        if (video.compressed !== 0){
            console.log("Using compressed version.")
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
        } else{
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
        }

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
            this.currentPlaylistIndex++;
            this.currentRound++;

            this.preloadedIndices.delete(this.currentPlaylistIndex);

            //await this.loadVideoWithFallback();

            const song = this.playlist[this.currentPlaylistIndex];
            this.current_song = song;

            const options = await this.getOptions(song.game_name);
            this.fillButtons(options);
            this.loadVideo(song.file_path);
            this.startPlayback();

        } else {
            this.gameEnded(this.scores, this.highest_streak);
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
                    }, 100);
                }); 
            }
        } catch (e) {
            console.log('Autoplay prevented: ', e);
        }
    }

    async checkVideoPlayability(videoPath){
        const video = document.createElement('video');
        const extension = videoPath.split('.').pop().toLowerCase();

        const canPlayMap = {
            'mp4': video.canPlayType('video/mp4'),
            'webm': video.canPlayType('video/webm'),
            'ogg': video.canPlayType('video/ogg'),
            'mov': video.canPlayType('video/quicktime'),
            'avi': video.canPlayType('video/x-msvideo'),
            'mkv': video.canPlayType('video/x-matroska')            
        }

        const canPlay = canPlayMap[extension];

        if(canPlay === 'probably' || canPlay === 'maybe'){
            return true;
        }

        if(extension === 'mp4' || extension === 'm4v'){
            return true;
        }

        return false;
    }

    async startPlayback(){
        if(this.playbackStarted) return;
        this.playbackStarted = true;

        if(this.hardMode){
            this.videoPlayer.hide();
        } else {
            this.videoPlayer.show();
        }

        this.videoStartTime = Date.now();

        this.videoPlayer.play();
    }

    async loadVideoNormally(videoPlayer){
        const video = this.playlist[this.currentPlaylistIndex];
        let videoUrl = '';
        if (video.compressed !== 0){
            console.log("Using compressed version.")
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
        } else{
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
        }
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

        const response = await fetch(`${this.website}/api/local/single/join`, {
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
        const correct_button = document.getElementById('correct-button');
        if(correct_button){
            correct_button.id = '';
        }
        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            const buttonText = options[index];
            if(buttonText.length > 27){
                button.textContent = buttonText.substring(0,27) + '...'
            } else {
                button.textContent = buttonText;
            }

            button.title = buttonText;

            button.dataset.fullTitle = buttonText;

            if (options[index] === this.current_song.game_name){
                button.id = 'correct-button';
            }
            button.disabled = false;
            button.classList.remove('answered', 'correct', 'incorrect');
            button.style.removeProperty('background-color');
        });
    }

    async submit_answer(selectedOption){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

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
            this.highest_streak = data.highest_streak

            if (data.ended === true || this.currentPlaylistIndex >= this.playlist.length){
                this.gameEnded(this.scores || document.getElementById('scores').textContent, this.highest_streak || 0);
                this.isGameActive = false;
                return;
            }

            this.currentRound++;
            this.currentPlaylistIndex++;

            this.preloadedVideos.delete(this.currentPlaylistIndex - 1);

            const song = this.playlist[this.currentPlaylistIndex];
            this.current_song = song;

            const options = await this.getOptions(song.game_name);

            //this.usePreloadedVideo(options);
            this.prepareNextRound();
        }
    }

    async preloadNextVideo() {
        if(this.currentPlaylistIndex + 1 >= this.playlist.length) return;
        let videoUrl = '';
        const nextVideo = this.playlist[this.currentPlaylistIndex + 1];
        if (nextVideo.compressed !== 0){
            console.log("Using compressed version.")
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(nextVideo.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
        } else{
            videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(nextVideo.file_path)}?token=${encodeURIComponent(this.token)}`;
        }
        const preloader = document.getElementById('video-preload');

        return new Promise((resolve) => {
            const onReady = () => {
                preloader.removeEventListener('loadedmetadata', onReady);
                resolve();
            }
            const onError = () => {
                preloader.removeEventListener('error', onError);
                resolve();
            }

            preloader.addEventListener('loadedmetadata', onReady, {once:true});
            preloader.addEventListener('error', onError, {once: true});

            preloader.src = videoUrl;
            preloader.preload = 'auto';
            preloader.load();
            console.log('Preloaded next Video')      
        });


    }

    async loadVideoWithRetry(mainPlayer, video, retryCount = 0){
        const maxRetries = 2;

        return new Promise((resolve) => {
            let videoUrl = '';
            if(video.compressed !== 0){
                console.log("Using compressed version.")
                videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(video.compressed_file_path)}?token=${encodeURIComponent(this.token)}`;
            } else {
                videoUrl =  `${this.website}/api/local/videos/${encodeURIComponent(video.file_path)}?token=${encodeURIComponent(this.token)}`;
            }
            mainPlayer.removeAttribute('src');
            mainPlayer.load();

            const errorHandler = (e) => {
                console.log(`Error loading video (attempt ${retryCount + 1}): `, e);

                if(retryCount < maxRetries){
                    setTimeout(() => {
                        this.loadVideoWithRetry(mainPlayer, video, retryCount + 1).then(resolve);
                    }, 500);
                } else {
                    console.log('Max retries reached, skipping video.');
                    mainPlayer.removeEventListener('error', errorHandler);
                    mainPlayer.removeEventListener('loadedmetadata', metadataHandler);
                    this.handleVideoEnded();
                    resolve();
                }
            };

            const metadataHandler = () => {
                mainPlayer.removeEventListener('error', errorHandler);
                resolve();
            }

            mainPlayer.addEventListener('error', errorHandler, {once:true});
            mainPlayer.addEventListener('loadedmetadata', metadataHandler, {once: true});

            const timeout = setTimeout(() => {
                mainPlayer.removeEventListener('error', errorHandler);
                mainPlayer.removeEventListener('loadedmetadata', metadataHandler);

                if(retryCount < maxRetries){
                    console.log('Loading timeout, retrying...');
                    this.loadVideoWithRetry(mainPlayer, video, retryCount + 1).then(resolve);
                } else {
                    console.log('Loading timeout, max retries reached.');
                    this.handleVideoEnded();
                    resolve();
                }
            }, 15000);

            mainPlayer.src = videoUrl;
            mainPlayer.load();
        });
    }

    async usePreloadedVideo(options){
        //await this.loadVideoWithFallback();
        this.fillButtons(options);
        this.loadVideo(this.current_song.file_path);
        this.startPlayback();
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

    showLoadingScreen(message){
        document.getElementById('loading-screen').style.display = 'block';
        document.getElementById('game-screen').style.display = 'none';
        document.getElementById('loading-screen').innerHTML = `<h3>${message}</h3>`;
    }

    toggleSection(header){
        const content = header.nextElementSibling;
        content.classList.toggle('active');
        const arrow = header.querySelector('.arrow');
        arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
    }


}

const player = new tsGame();