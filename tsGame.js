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

            document.getElementById('filter-header').forEach(id => {
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

    isH264Codec(codec){
        if (!codec) return false;
        const codecLower= codec.toLowerCase();
        return codecLower.includes('h264') || codecLower.includes('avc') || codecLower.includes('h.264') || codecLower === 'avc1';
    }

    toggleSection(header){
        const content = header.nextElementSibling;
        console.log('Content: ', content);
        content.classList.toggle('active');
        const arrow = header.querySelector('.arrow');
        arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
    }


}

const player = new tsGame();