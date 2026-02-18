class tsPlayer{
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

    setupEventListeners(){

        let selectedTags = new Set();
        let allTags = [];
        let playlist = [];
        let currentPlaylistIndex = 0;
        let isPlayingPlaylist = false;

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
            const preloader = document.getElementById('video-preload');
            const currentVideoTitle = document.getElementById('current-video-title');
            const progressFill = document.getElementById('progress-fill');
            const currentTimeSpan = document.getElementById('current-time');
            const durationSpan = document.getElementById('duration');
            const mobileCheckbox = document.getElementById('mobile-mode');
            const mobileIndicator = document.createElement('div');

            mobileIndicator.id = 'mobile-indicator';
            mobileIndicator.style.display = 'none';
            document.querySelector('.nav-bar').appendChild(mobileIndicator);

            let allVideos = [];


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
            
            // Browse videos
            document.getElementById('browse-videos').addEventListener('click', () => {
                videoBrowser.style.display = 'block';
                loadVideos();
            });

            document.getElementById('random-video').addEventListener('click', () => {
                videoBrowser.style.display = 'block';
                loadRandomVideo();
            })
            
            // Back to browser
            document.getElementById('back-to-browser').addEventListener('click', () => {
                playerScreen.style.display = 'none';
                videoBrowser.style.display = 'block';
                videoPlayer.pause();
                isPlayingPlaylist = false;
                playlist = [];
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
            
        document.getElementById('tag-select').addEventListener('click', async () => {
            const tagSelector = document.getElementById('tag-selector');
            const videoBrowser = document.getElementById('video-browser');
            
            if (tagSelector.style.display === 'none' || !tagSelector.style.display) {
                // Show tag selector and load tags
                tagSelector.style.display = 'block';
                videoBrowser.style.display = 'block';
                await loadTags();
            } else {
                // Hide tag selector
                tagSelector.style.display = 'none';
            }
        });

        async function loadTags() {
            await player.refreshToken();
            
            try {
                const response = await fetch(`${player.serverUrl}/api/local/tags`, {
                    headers: {
                        'X-Auth-Token': player.token,
                        'Referer': window.location.origin
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    allTags = data.tags;
                    displayTags();
                }
            } catch (error) {
                console.error('Failed to load tags:', error);
            }
        }

        function displayTags() {
            const tagList = document.getElementById('tag-list');
            tagList.innerHTML = '';
            
            allTags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'tag-item' + (selectedTags.has(tag) ? ' selected' : '');
                tagEl.textContent = tag;
                
                tagEl.addEventListener('click', () => {
                    if (selectedTags.has(tag)) {
                        selectedTags.delete(tag);
                        tagEl.classList.remove('selected');
                    } else {
                        selectedTags.add(tag);
                        tagEl.classList.add('selected');
                    }
                });
                
                tagList.appendChild(tagEl);
            });
        }

        // Apply tags filter
        document.getElementById('apply-tags').addEventListener('click', async () => {
            if (selectedTags.size === 0) {
                loadVideos(); // Just load all videos if no tags selected
                return;
            }
            
            loadingIndicator.style.display = 'block';
            
            try {
                const response = await fetch(`${player.serverUrl}/api/local/videos/filter`, {
                    method: 'POST',
                    headers: {
                        'X-Auth-Token': player.token,
                        'Referer': window.location.origin,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        tag: Array.from(selectedTags) // Send selected tags
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    displayVideos(data.videos, `Found ${data.total} videos with selected tags`);
                }
            } catch (error) {
                showError('Failed to filter videos: ' + error.message);
            } finally {
                loadingIndicator.style.display = 'none';
            }
        });

        mobileCheckbox.addEventListener('change', async (e) => {
            player.mobileMode = e.target.checked;

            if(player.mobileMode){
                document.body.classList.add('mobile-mode-active');
                mobileIndicator.style.display = 'inline-block';
                mobileIndicator.textContent = 'Mobile Mode Active';
                mobileIndicator.style.cssText = `
                    background: #4CAF50;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 5px;
                    margin-left: 10px;
                    font-size: 12px;    
                `;

                // Just show a message, don't filter the display
                showInfo('Mobile mode enabled - videos will be checked for compatibility when played');
                
                // Refresh the current view (but don't filter)
                if (allVideos.length > 0) {
                    displayVideos(allVideos);
                }
            } else {
                document.body.classList.remove('mobile-mode-active');
                mobileIndicator.style.display = 'none';

                if(allVideos.length > 0){
                    displayVideos(allVideos);
                }
            }
        });

        // Clear tags
        document.getElementById('clear-tags').addEventListener('click', () => {
            selectedTags.clear();
            displayTags(); // Refresh tag display to remove selected state
            loadVideos(); // Reload all videos
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

            document.getElementById('shuffle').addEventListener('click', async () => {
                await player.refreshToken();
                loadingIndicator.style.display = 'block';
                
                try {
                    // Get all videos first
                    let videos = await player.getVideos();
                    
                    if (videos && videos.length > 0) {
                        // Shuffle the array
                        playlist = [...videos];
                        shuffleArray(playlist);
                        currentPlaylistIndex = 0;
                        isPlayingPlaylist = true;

                        videoBrowser.style.display = 'none';
                        playerScreen.style.display = 'block';

                        playPlaylistVideo(currentPlaylistIndex);
                        
                    } else {
                        showError('No videos to shuffle');
                    }
                } catch (error) {
                    showError('Failed to shuffle videos: ' + error.message);
                } finally {
                    loadingIndicator.style.display = 'none';
                }
            });

            function shuffleArray(array){
                for (let i = array.length - 1; i> 0; i--){
                    const j = Math.floor(Math.random()* (i + 1));
                    [array[i], array[j]] = [array[j], array[i]];
                }
            }
            
            async function playPlaylistVideo(index) {
                if(Date.now() > player.tokenExpiry){
                    await player.refreshToken();
                    if (!player.token) return [];
                }

                if(!playlist || index >= playlist.length) {
                    console.log("Playlist ended");
                    isPlayingPlaylist = false;
                    
                    if(confirm('Playlist ended! Shuffle again?')) { 
                        document.getElementById('shuffle').click();
                    } else {
                        playerScreen.style.display = 'none';
                        videoBrowser.style.display = 'block';
                    }
                    return;
                }
                
                const video = playlist[index];
                currentPlaylistIndex = index;

                const progressText = `(${index + 1}/${playlist.length}) `;
                currentVideoTitle.textContent = progressText + (video.opening_name || video.filename);

                if (preloader.src) {
                    URL.revokeObjectURL(preloader.src);
                    preloader.src = '';
                }

                try {
                    if (player.mobileMode) {
                        const isCompatible = await player.getVideoCodec(video.filename);
                        if (!isCompatible) {
                            showError(`Video not H.264 compatible (mobile mode). Skipping...`);
                            setTimeout(() => playPlaylistVideo(index + 1), 500);
                            return;
                        }
                    }

                    const filename = encodeURIComponent(video.filename)
                    const videoUrl = `${player.serverUrl}/api/local/videos/${filename}`;
                    console.log("Video URL: " + videoUrl);
                    
                    const response = await fetch(videoUrl, {
                        headers: {
                            'X-Auth-Token': player.token,
                            'Referer': window.location.origin
                        }
                    });

                    if (response.ok){
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);

                        videoPlayer.removeEventListener('ended', handleVideoEnded);
                        videoPlayer.src = url;
                        videoPlayer.load();
                        videoPlayer.addEventListener('ended', handleVideoEnded);
                        
                        // Start preloading and checking next videos
                        preloadNextVideos(index);
                        
                        videoPlayer.play().catch(e => console.log('Autoplay prevented: ', e));
                    } else{
                        showError('Failed to load video: '+ response.status);
                        setTimeout(() => handleVideoEnded(), 1000);
                    } 
                } catch (error) {
                    showError('Failed to load video: ' + error.message);
                    setTimeout(() => handleVideoEnded(), 1000);
                }
            }

            async function preloadNextVideos(currentIndex) {
                if (!player.mobileMode) {
                    // If not in mobile mode, just preload the next video without checking
                    if (currentIndex + 1 < playlist.length) {
                        const nextVideo = playlist[currentIndex + 1];
                        try {
                            const response = await fetch(`${player.serverUrl}/api/local/videos/${encodeURIComponent(nextVideo.filename)}`, {
                                headers: {
                                    'X-Auth-Token': player.token,
                                    'Referer': window.location.origin
                                }
                            });
                            
                            if (response.ok) {
                                const blob = await response.blob();
                                const url = URL.createObjectURL(blob);
                                preloader.src = url;
                                preloader.load();
                                console.log('Preloaded next video:', nextVideo.filename);
                            }
                        } catch (error) {
                            console.log('Failed to preload next video:', error);
                        }
                    }
                    return;
                }
                
                // Mobile mode: check and preload next compatible video
                let nextIndex = currentIndex + 1;
                let checkedCount = 0;
                const maxChecks = 5; // Don't check too far ahead to avoid performance issues
                
                while (nextIndex < playlist.length && checkedCount < maxChecks) {
                    const nextVideo = playlist[nextIndex];
                    
                    // Check if we already know this video's compatibility
                    let isCompatible = player.codecCache.get(nextVideo.filename);
                    
                    if (isCompatible === undefined) {
                        // Not in cache, need to check
                        console.log(`Checking compatibility for next video: ${nextVideo.filename}`);
                        isCompatible = await player.getVideoCodec(nextVideo.filename);
                    }
                    
                    if (isCompatible) {
                        // Found a compatible video, preload it
                        console.log(`Found compatible next video at index ${nextIndex}: ${nextVideo.filename}`);
                        try {
                            const response = await fetch(`${player.serverUrl}/api/local/videos/${encodeURIComponent(nextVideo.filename)}`, {
                                headers: {
                                    'X-Auth-Token': player.token,
                                    'Referer': window.location.origin
                                }
                            });
                            
                            if (response.ok) {
                                const blob = await response.blob();
                                const url = URL.createObjectURL(blob);
                                preloader.src = url;
                                preloader.load();
                                
                                // Store which video we preloaded
                                preloader.dataset.preloadedIndex = nextIndex;
                                console.log(`Preloaded video ${nextIndex + 1}/${playlist.length}: ${nextVideo.filename}`);
                            }
                            break; // Stop after preloading one video
                        } catch (error) {
                            console.log('Failed to preload next video:', error);
                        }
                    } else {
                        console.log(`Video at index ${nextIndex} not H.264 compatible, checking next...`);
                    }
                    
                    nextIndex++;
                    checkedCount++;
                }
                
                if (checkedCount >= maxChecks) {
                    console.log('Reached maximum lookahead, no compatible video found nearby');
                }
            }

            function handleVideoEnded() {
                if (isPlayingPlaylist) {
                    const nextIndex = currentPlaylistIndex + 1;
                    
                    // Check if we have a preloaded video and it's the correct one
                    if (preloader.src && preloader.dataset.preloadedIndex == nextIndex) {
                        // Use the preloaded video
                        videoPlayer.src = preloader.src;
                        preloader.src = '';
                        
                        // Update title
                        const nextVideo = playlist[nextIndex];
                        const progressText = `(${nextIndex + 1}/${playlist.length}) `;
                        currentVideoTitle.textContent = progressText + (nextVideo.opening_name || nextVideo.filename);
                        
                        // Start preloading the next one
                        preloadNextVideos(nextIndex);
                        
                        videoPlayer.play().catch(e => console.log('Autoplay prevented:', e));
                        currentPlaylistIndex = nextIndex;
                    } else {
                        // Fall back to normal playback (will check compatibility)
                        playPlaylistVideo(nextIndex);
                    }
                }
            }

            function addPlaylistControls(){
                const videoContainer = document.querySelector('.video-container');

                const navDiv = document.createElement('div');
                navDiv.className = 'playlist-nav';
                navDiv.style.cssText = `
                    display: flex;
                    justify-content: center;
                    gap: 10px;
                    margin-top: 10px;
                `;

                const prevBtn = document.createElement('button');
                prevBtn.className = 'nav-btn';
                prevBtn.textContent = '⏮ Previous';
                prevBtn.onclick = () => {
                    if (isPlayingPlaylist && currentPlaylistIndex > 0) {
                        playPlaylistVideo(currentPlaylistIndex - 1);
                    }
                };
                
                const nextBtn = document.createElement('button');
                nextBtn.className = 'nav-btn';
                nextBtn.textContent = 'Next ⏭';
                nextBtn.onclick = () => {
                    if (isPlayingPlaylist) {
                        playPlaylistVideo(currentPlaylistIndex + 1);
                    }
                };
                
                const shuffleAgainBtn = document.createElement('button');
                shuffleAgainBtn.className = 'nav-btn';
                shuffleAgainBtn.textContent = '🔄 Reshuffle';
                shuffleAgainBtn.onclick = () => {
                    if (playlist.length > 0) {
                        shuffleArray(playlist);
                        currentPlaylistIndex = 0;
                        playPlaylistVideo(0);
                    }
                };
                
                navDiv.appendChild(prevBtn);
                navDiv.appendChild(nextBtn);
                navDiv.appendChild(shuffleAgainBtn);
                
                // Insert after video container
                videoContainer.parentNode.insertBefore(navDiv, videoContainer.nextSibling);
            }

            // Call this when setting up
            addPlaylistControls();

            searchBtn.addEventListener('click', performSearch);
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') performSearch();
            });
            
            // Load videos
            async function loadVideos() {
                await player.refreshToken();
                console.log("Loading videos...")
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

            async function loadRandomVideo() {
                await player.refreshToken();
                loadingIndicator.style.display = 'block';
                errorMessage.style.display = 'none';
                try{
                    // Changed to POST and added count parameter in body
                    const response = await fetch(`${player.serverUrl}/api/local/videos/random?count=1`, {
                        method: 'POST',  // Specify POST method
                        headers: {
                            'X-Auth-Token': player.token,
                            'Referer': window.location.origin,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        console.log("Random video data: ", data.videos);
                        
                        if (data.videos && data.videos.length > 0) {
                            const randomVideo = data.videos[0];
                            // Play the video using filename
                            console.log("random video filename: "+randomVideo.filename);
                            playVideo(randomVideo.filename);
                        } else {
                            showError('No videos available');
                        }
                    } else {
                        showError('Failed to load random video: ' + response.status);
                    }
                } catch (error){
                    showError('Failed to load random video: ' + error.message);
                } finally {
                    loadingIndicator.style.display = 'none';
                }
            }
            
        function displayVideos(videos, statsMessage = null) {
            videoGrid.innerHTML = '';
            
            if (!videos || videos.length === 0) {
                videoGrid.innerHTML = '<div class="error-message">No videos found</div>';
                videoStats.textContent = '0 videos';
                return;
            }

            // Simply display all videos regardless of mobile mode
            videos.forEach(video => {
                const card = createVideoCard(video);
                videoGrid.appendChild(card);
            });
            
            updateStats(videos, statsMessage);
        }

        function createVideoCard(video) {
            const card = document.createElement('div');
            card.className = 'video-card';
            
            const filename = video.filename || video;
            const displayName = filename.length > 50 ? filename.substring(0, 47) + '...' : filename;
            
            card.innerHTML = `
                <h3 title="${escapeHtml(filename)}">${escapeHtml(displayName)}</h3>
                <div class="video-card-footer">
                    ${video.size ? `<span class="file-size">${formatFileSize(video.size)}</span>` : ''}
                </div>
            `;
            
            card.addEventListener('click', () => {
                if (player.mobileMode) {
                    // Check compatibility using cache (fast, no API call)
                    const isCompatible = player.codecCache.get(filename);
                    
                    if (isCompatible === undefined) {
                        // If not in cache, do quick extension check
                        const h264Extensions = ['.mp4', '.m4v', '.mov'];
                        const isCompatible = h264Extensions.some(ext => filename.toLowerCase().endsWith(ext));
                        player.codecCache.set(filename, isCompatible);
                    }
                    
                    if (isCompatible) {
                        playVideo(filename);
                    } else {
                        showError('This video cannot be played in mobile mode (not H.264 compatible)');
                    }
                } else {
                    playVideo(filename);
                }
            });
            
            return card;
        }
            
        async function playVideo(filename) {
            if (!player.token) {
                showError('Not authenticated. Please refresh the page.');
                return;
            }
            
            // Remove the check here since we already checked in the click handler
            videoBrowser.style.display = 'none';
            playerScreen.style.display = 'block';
            currentVideoTitle.textContent = filename;
            
            try {
                const videoUrl = `${player.serverUrl}/api/local/videos/${encodeURIComponent(filename)}`;
                console.log('Loading video from:', videoUrl);
                
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
                    videoPlayer.play().catch(e => console.log('Autoplay prevented:', e));
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

    }

    async getVideos() {
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        if(!this.token) return [];

        console.log("Token valid, fetching videos...")

        try{
            const response = await fetch(`${this.serverUrl}/api/local/videos`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log("Videos received:", data.count || (data.videos ? data.videos.length : 0));
                
                let videos = [];
                if (data.videos && Array.isArray(data.videos)) {
                    videos = data.videos;
                } else if (Array.isArray(data)) {
                    videos = data;
                }
                
                videos.forEach(video => {
                    if (video.filename && video.codec) {
                        const isH264 = this.isH264Codec(video.codec);
                        this.codecCache.set(video.filename, isH264);
                    }
                });
                
                return videos;
            } else {
                console.error("Failed to fetch videos, status:", response.status);
            }
        } catch (error){
            console.error('Failed to fetch videos:', error);
        }

        return [];
    }

    isH264Codec(codec) {
        if (!codec) return false;
        const codecLower = codec.toLowerCase();
        return codecLower.includes('h264') || 
            codecLower.includes('avc') || 
            codecLower.includes('h.264') ||
            codecLower === 'avc1';
    }

    showInfo(message) {
        const infoEl = document.createElement('div');
        infoEl.className = 'info-message';
        infoEl.textContent = message;
        infoEl.style.cssText = `
            background-color: #2196F3;
            color: white;
            padding: 10px;
            margin: 10px 0;
            border-radius: 5px;
            text-align: center;
        `;
        
        videoBrowser.insertBefore(infoEl, videoBrowser.firstChild);
        
        setTimeout(() => {
            if (infoEl.parentNode) {
                infoEl.parentNode.removeChild(infoEl);
            }
        }, 3000);
    }

    async getVideoCodec(filename){
        if (this.codecCache.has(filename)) {
            return this.codecCache.get(filename);
        }
        
        const h264Extensions = ['.mp4', '.m4v', '.mov'];
        const hasH264Ext = h264Extensions.some(ext => filename.toLowerCase().endsWith(ext));
        
        this.codecCache.set(filename, hasH264Ext);
        return hasH264Ext;
    }

    async playVideo(videoPath){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
        }

        if(!this.token) return;


        const videoUrl = `${this.serverUrl}/api/local/videos/${encodeURIComponent(videoPath)}`

        const video = document.createElement('video');
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
        if(!this.token || query.length < 3) return [];

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