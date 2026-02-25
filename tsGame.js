class tsGame{
    constructor(){
        this.serverUrl = 'https://julia.bluethsprojectsite.fun';
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

        this.setupEventListeners();
    }

    setupEventListeners(){
        
        document.addEventListener('DOMContentLoaded', async function() {
            const videoScreen = document.getElementById('video-screen');
            const videoPlayer = document.getElementById('video-player');
            const preloader = document.getElementById('video-preload');
            const mobileCheckbox = document.getElementById('mobile-mode');

            let allVideos = await player.getVideos();
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
                player.start_game(true)
            });

            document.getElementById('multiplayer').addEventListener('click', () => {
                player.start_game(false)
            });

            document.querySelectorAll('.answer-btn').forEach(button => {
                button.addEventListener('click', function() {
                    document.querySelectorAll('answer-btn').forEach(button => {
                        button.disabled = true;
                        button.classList.remove('answered');
                    });
                    this.classList.add('answered');
                    const selectedOption = button.textContent;
                    player.submit_answer(selectedOption);
                });
            });

            document.getElementById('player-name-input').addEventListener('input', () => {
                input = document.getElementById('player-name-input');
                this.playerName = input.textContent; 
            });

        });
    }

    async ping(){
        try{
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.serverUrl}/api/local/ping`, {
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
            const response = await fetch(`${this.serverUrl}/api/local/status/simple`, {
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
            const response = await fetch(`${this.serverUrl}/api/local/health`, {
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
            const response = await fetch(`${this.serverUrl}/api/local/token`, {
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
            const response = await fetch(`${this.serverUrl}/api/local/videos`, {
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
            const response = await fetch(`${this.serverUrl}/api/local/metadata/filters`, {
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
        ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list'].forEach(id => {
            document.getElementById(id).innerHTML = '';
        });
        
        filterMetadata.tags.slice(0,50).forEach(tag => {
            const container = document.getElementById('tags-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${tag.trim().toLowerCase()}">
                    ${tag}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.languages.slice(0,50).forEach(language => {
            const container = document.getElementById('languages-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${language.trim().toLowerCase()}">
                    ${language}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.decades.slice(0,50).forEach(decade => {
            const container = document.getElementById('decades-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${decade.trim().toLowerCase()}">
                    ${decade}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.difficulties.slice(0,50).forEach(difficulty => {
            const container = document.getElementById('difficulties-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${difficulty.trim().toLowerCase()}">
                    ${difficulty}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.genres.slice(0,50).forEach(genre => {
            const container = document.getElementById('genres-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${genre.trim().toLowerCase()}">
                    ${genre}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.production_companies.slice(0,50).forEach(production_company => {
            const container = document.getElementById('production-companies-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${production_company.trim().toLowerCase()}">
                    ${production_company}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.networks.slice(0,50).forEach(network => {
            const container = document.getElementById('networks-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${network.trim().toLowerCase()}">
                    ${network}
                </label>
            `;
            container.appendChild(div);
        });
        filterMetadata.countries.slice(0,50).forEach(country => {
            const container = document.getElementById('countries-list');
            const div = document.createElement('div');
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${country.trim().toLowerCase()}">
                    ${country}
                </label>
            `;
            container.appendChild(div);
        });
    }

    async start_game(singleplayer){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return [];
        }
        if(!this.token) return [];

        if(this.playerName == ''){
            return
        }

        const selectedTags = Array.from(document.querySelectorAll('#tags-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedLanguages = Array.from(document.querySelectorAll('#languages-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedDecades = Array.from(document.querySelectorAll('#decades-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedDifficulties = Array.from(document.querySelectorAll('#difficulties-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedGenres = Array.from(document.querySelectorAll('#genres-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedProductionCompanies = Array.from(document.querySelectorAll('#production-companies-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedNetworks = Array.from(document.querySelectorAll('#networks-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const selectedCountries = Array.from(document.querySelectorAll('#countries-list input:checked')).map(checkbox => checkbox.value.toLowerCase().trim());
        const enableSpecialOpenings = document.getElementById('special-checkbox').checked;
        const enableRandomStartTime = document.getElementById('enable-random-start').checked;
        const startMin = enableRandomStartTime ? (document.getElementById('start-min').value) || 0 : 0;
        const startMax = enableRandomStartTime ? (document.getElementById('start-max').value) || 90 : 0;
        const sfwFilter = document.getElementById('sfw-filter').checked;
        const enableHintMode = document.getElementById('enable-hint-mode').checked;
        const hintPercent = enableHintMode ? (document.getElementById('hint-percent-field').value) || 25 : 0;
        const rounds = parseInt(document.getElementById('rounds-input').value) || 10;
        
        const response = await fetch(`${this.serverUrl}/api/local/game/start`, {
            method: "POST",
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tags: selectedTags,
                languages: selectedLanguages,
                decades: selectedDecades,
                difficulties: selectedDifficulties,
                genres: selectedGenres,
                production_companies: selectedProductionCompanies,
                networks: selectedNetworks,
                countries: selectedCountries,
                sfw: sfwFilter,
                rounds: rounds,
                startRange: enableRandomStartTime ? [startMin, startMax] : [0, 0],
                hintPercent: enableHintMode ? hintPercent : 25,
                specialOpenings: enableSpecialOpenings,
                singleplayer: singleplayer 
            })
        });

        if(response.ok){
            const landing_screen = document.getElementById('landing-screen');
            const game_screen = document.getElementById('game-screen');
            const filterOptions = document.getElementById('filter-options');

            const data = await response.json();

            landing_screen.style.display = 'none';
            game_screen.style.display = 'block';
            filterOptions.style.display = 'none';

            landing_screen.classList.remove('active');
            game_screen.classList.add('active');

            this.playVideo(data.extreme_mode, data.video_path)
            this.fillButtons(data.options)
        }
    }

    async playVideo(hidden, video_path){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const videoUrl = `${this.serverUrl}/api/local/videos/${encodeURIComponent(video_path)}`

        const videoPlayer = document.getElementById('video-player');
        if(hidden){
            videoPlayer.classList.add('video-hidden');
        } else {
            videoPlayer.classList.remove('video-hidden');
        }

        const response = await fetch(videoUrl, {
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin
            }
        })

        if(response.ok){
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            videoPlayer.src = url;
            videoPlayer.load();
            this.videoStartTime = Date.now();
            videoPlayer.play().catch(e => console.log('Autoplay prevented: ', e));
        } else {
            console.error('Failed to load video: ', error);
        }
    }

    fillButtons(options){
        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            button.textContent = options[index];
            button.disabled = false;
        });
    }

    async submit_answer(selectedOption){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        if(!this.token) return [];

        const response = await fetch(`${this.serverUrl}/api/local/game/submit_answer`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': this.token,
                'Referer': window.location.origin,
                'Content-Type': 'application/json'
            }, 
            body: JSON.stringify({
                playerName: this.playerName,
                selectedOption: selectedOption,
                answerTime: Date.now(),
                videoStartTime: this.videoStartTime
            })
        });

        if(response.ok){
            const data = await response.json();
            document.getElementById('scores').textContent = `${this.playerName}: ${data.scores[this.playerName]}, Streak: ${data.player_streaks[this.playerName]}`;
        }
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

const player = new tsGame();