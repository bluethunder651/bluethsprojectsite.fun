class tsPlayer{
    constructor(){
        this.serverUrl = 'https://julia-server.duckdns.org:5000';
        this.token = null;
        this.tokenExpiry = null;
        this.enabled = false;
        this.statusCallbacks = [];
        this.healthCallbacks = [];
        this.monitoring = false;
        this.lastStatus = null;
        this.pingInterval = null;
        this.socket = null;
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

            if (response.ok) {
                const data = await response.json();
                return {
                    online: true,
                    latency: Date.now() - (data.timestamp * 1000),
                    data: data
                };
            }

            return { online: false, error: 'Bad response'}
        } catch (error) {
            return {
                online: false,
                error: error.name === 'AbortError' ? 'Timeout' : 'Connection Failed'
            }
        }
    }

    async checkStatus(token){
        try{
            const response = await fetch(`${this.serverUrl}/api/local/status/simple`, {
                headers: token ? {'X-Auth-Token': token} : {},
                cache: 'no-cache'
            });

            if (response.ok){
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

            if (response.ok) {
                const data = await response.json();
                this.healthCallbacks.forEach(cb => cb(data));
                return data;
            }
        } catch (error) {
            console.error('Health check failed: ', error)
        }
        return null;
    }

    startMonitoring(callback, interval = 10000){
        this.statusCallbacks.push(callback);

        if(!this.monitoring){
            this.monitoring = true;
            this.pingInterval = setInterval(async () => {
                const pingResult = await this.ping();
                callback({
                    type: 'ping',
                    ...pingResult
                });
            }, interval);
        }
    }

    stopMonitoring() {
        if(this.pingInterval){
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.monitoring = false;
        this.statusCallbacks = [];
    }

    connectSocketIO(socket){
        this.socket = socket;

        socket.on('connect', () => {
            console.log('Socket connected, requetsing status');
            socket.emit('request_server_status');
        });

        socket.on('server_status_update', (status) => {
            console.log('Server status update: ', status);
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                ...status
            }));
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.statusCallbacks.forEach(cb => cb({
                type: 'socket',
                online: false,
                error: 'Socket disconnected'
            }));
        });
    }

    async enable() {
        this.enabled = true;
        return await this.refreshToken();
    }

    disable(){
        this.enabled = false;
        this.token = null;
    }

    async refreshToken(){
        try{
            const response = await fetch(`${this.serverUrl}/api/local/token`, {
                headers: {
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();
                this.token = data.token;
                this.tokenExpiry = Date.now() + (data.expires_in * 1000);
                return true;
            }
        } catch (error){
            console.log('Server not available');
            return false;
        }
    }

    async getVideos() {
        if(!this.enabled || !this.token) return [];

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }

        try{
            const response = await fetch(`${this.serverUrl}/api/local/videos`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.videos;
            }
        } catch (error){
            console.log('Failed to fetch videos');
        }

        return [];
    }

    async playVideo(videoPath){
        if(!this.enabled || !this.token) return;

        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
        }

        const videoUrl = `${this.serverUrl}/api/local/videos/${encodeURIComponent(videoPath)}`

        const vide = document.createElement('video');
        videoPath.controls = true;
        videoPath.style.width = '100%'

        try{
            const response = await fetch(videoUrl, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if(response.ok){
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                video.src = url;
                document.body.appendChild(video);
                video.play();
            }
        } catch (error) {
            console.error('Failed to load video: ', error);
        }
    }

    async searchVideos(query){
        if(!this.enabled || !this.token || query.length < 3) return [];

        try{
            const response = await fetch(`${this.serverUrl}/api/local/search?q=${encodeURIComponent(query)}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();
                return data.results;
            }
        } catch (error){
            console.log("Search failed")
        }
        return [];
    }

}

const player = new tsPlayer();

function enableLocalAccess() {
    player.enable().then(success => {
        if (success){
            console.log('Local video access enabled');
            player.getVideos().then(videos => {
                console.log(`Found ${videos.length} videos`);
            });
        }
    });
}

function disableLocalAccess(){
    player.disable();
    console.log('Local video access disabled')
}

document.addEventListener('DOMContentLoaded', function() {
    player.startMonitoring(function(status) {
        const indicator = document.getElementById('server-status-indicator');
        const text = document.getElementById('server-status-text');
        const latencyRow = document.getElementById('latency-row');
        const latencyValue = document.getElementById('latency-value');

        if(status.online){
            indicator.className = 'status-badge status-online';
            indicator.textContent = '●';
            text.textContent = 'Online';

            if (status.latency){
                latencyRow.style.display = 'flex';
                latencyValue.textContent = `${Math.abs(status.latency)}ms`;
            }
        } else {
            indicator.className = 'status-badge status-offline';
            indicator.textContent = '●';
            text.textContent = 'Offline';
            latencyRow.style.display = 'none';
        }
    });

    document.getElementById('refresh-status').addEventListener('click', function() {
        const btn = this;
        btn.disabled = true;
        btn.textContent = 'Refreshing...'

        player.ping().then(result => {
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = "↻ Status";
            }, 1000);
        });
    });
});