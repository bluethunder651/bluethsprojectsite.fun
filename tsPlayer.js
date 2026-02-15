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
                console.log("Data: ", data.videos)
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

    const videoBrowser = document.getElementById('video-browser');
    const playerScreen = document.getElementById('player-screen');
    const videoGrid = document.getElementById('video-grid');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');
    const videoStats = document.getElementById('video-stats');
    const videoPlayer = document.getElementById('video-player');
    const currentVideoTitle = document.getElementById('current-video-title');
    const progressFill = document.getElementById('progress-fill');
    const currentTimeSpan = document.getElementById('current-time');
    const durationSpan = document.getElementById('duration');

    let allVideos = [];
    let currentVideoPath = '';


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
      
      // Disable server
      document.getElementById('disable-server').addEventListener('click', () => {
        player.disable();
        console.log('Server disabled');
        videoBrowser.style.display = 'none';
      });
      
      // Browse videos
      document.getElementById('browse-videos').addEventListener('click', () => {
        videoBrowser.style.display = 'block';
        loadVideos();
      });
      
      // Back to browser
      document.getElementById('back-to-browser').addEventListener('click', () => {
        playerScreen.style.display = 'none';
        videoBrowser.style.display = 'block';
        videoPlayer.pause();
      });
      
      // Refresh status
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
      
      // Search functionality
      async function performSearch() {
        const query = searchInput.value.trim();
        if (query.length < 3) {
          displayVideos(allVideos);
          return;
        }
        
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        
        try {
          const results = await player.searchVideos(query);
          displayVideos(results, `Found ${results.length} videos for "${query}"`);
        } catch (error) {
          showError('Search failed: ' + error.message);
        } finally {
          loadingIndicator.style.display = 'none';
        }
      }
      
      searchBtn.addEventListener('click', performSearch);
      searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') performSearch();
      });
      
      // Load videos
      async function loadVideos() {
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        videoGrid.innerHTML = '';
        
        try {
          allVideos = await player.getVideos();
          displayVideos(allVideos);
        } catch (error) {
          showError('Failed to load videos: ' + error.message);
        } finally {
          loadingIndicator.style.display = 'none';
        }
      }
      
      // Display videos in grid
      function displayVideos(videos, statsMessage = null) {
        videoGrid.innerHTML = '';
        
        if (!videos || videos.length === 0) {
          videoGrid.innerHTML = '<div class="error-message">No videos found</div>';
          videoStats.textContent = '0 videos';
          return;
        }
        
        videos.forEach(video => {
          const card = document.createElement('div');
          card.className = 'video-card';
          card.innerHTML = `
            <h3>${escapeHtml(video.filename)}</h3>
            <p>${formatFileSize(video.size)}</p>
            <p>${escapeHtml(video.path)}</p>
          `;
          
          card.addEventListener('click', () => {
            playVideo(video.path, video.filename);
          });
          
          videoGrid.appendChild(card);
        });
        
        if (statsMessage) {
          videoStats.textContent = statsMessage;
        } else {
          videoStats.textContent = `${videos.length} videos • ${formatTotalSize(videos)}`;
        }
      }
      
      // Play video
      async function playVideo(videoPath, filename) {
        if (!player.enabled || !player.token) {
          showError('Please enable server first');
          return;
        }
        
        videoBrowser.style.display = 'none';
        playerScreen.style.display = 'block';
        currentVideoTitle.textContent = filename;
        currentVideoPath = videoPath;
        
        try {
          const videoUrl = `${player.serverUrl}/api/local/videos/${encodeURIComponent(videoPath)}`;
          
          // Fetch with authentication
          const response = await fetch(videoUrl, {
            headers: {
              'X-Auth-Token': player.token,
              'Referer': window.location.origin
            }
          });
          
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            videoPlayer.src = url;
            videoPlayer.load();
            videoPlayer.play();
          } else {
            showError('Failed to load video: ' + response.status);
          }
        } catch (error) {
          showError('Failed to load video: ' + error.message);
        }
      }
      
      // Video player event listeners
      videoPlayer.addEventListener('timeupdate', updateProgress);
      videoPlayer.addEventListener('loadedmetadata', updateDuration);
      
      function updateProgress() {
        if (videoPlayer.duration) {
          const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
          progressFill.style.width = percent + '%';
          currentTimeSpan.textContent = formatTime(videoPlayer.currentTime);
        }
      }
      
      function updateDuration() {
        durationSpan.textContent = formatTime(videoPlayer.duration);
      }
      
      // Progress bar click seeking
      document.getElementById('progress-bar').addEventListener('click', (e) => {
        const rect = e.target.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        videoPlayer.currentTime = percent * videoPlayer.duration;
      });
      
      // Utility functions
      function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }
      
      function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }
      
      function formatTotalSize(videos) {
        const total = videos.reduce((sum, v) => sum + v.size, 0);
        if (total < 1024 * 1024 * 1024) {
          return (total / (1024 * 1024)).toFixed(1) + ' MB total';
        }
        return (total / (1024 * 1024 * 1024)).toFixed(2) + ' GB total';
      }
      
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
      
      function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
      }
});