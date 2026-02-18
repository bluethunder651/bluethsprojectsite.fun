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

                loadingIndicator.style.display = 'block';

                if (allVideos.length > 0){
                    const filteredVideos = await player.filterVideoForMobile(allVideos);
                    displayVideos(filteredVideos);

                    const nonH264Count = allVideos.length - filteredVideos.length;
                    if(nonH264Count > 0){
                        showWarning(`${nonH264Count} non-H.264 videos hidden (mobile mode)`);
                    }
                }
                loadingIndicator.style.display = 'none';
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

                    if(player.mobileMode){
                        videos = await player.filterVideoForMobile(videos);
                        if(videos.length === 0){
                            showError('No H.264 videos available for mobile.');
                            loadingIndicator.style.display = 'none';
                            return;
                        }
                    }
                    
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
                if(Date.now() > this.tokenExpiry){
                    await this.refreshToken();
                    if (!this.token) return [];
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

                // Clear previous preloaded video if it exists
                if (preloader.src) {
                    URL.revokeObjectURL(preloader.src);
                    preloader.src = '';
                }

                try {
                    // Check if current video is compatible (only if mobile mode is on)
                    if (player.mobileMode) {
                        const isCompatible = await player.getVideoCodec(video.filename);
                        if (!isCompatible) {
                            showError(`Video not H.264 compatible (mobile mode). Skipping...`);
                            // Skip to next video
                            setTimeout(() => playPlaylistVideo(index + 1), 1000);
                            return;
                        }
                    }

                    const videoUrl = `${player.serverUrl}/api/local/videos/${encodeURIComponent(video.filename)}`;
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

                if(player.mobileMode){
                    videos.forEach(video => {
                        const card = createVideoCard(video, true);
                        videoGrid.appendChild(card);
                    });
                    
                    videoStats.textContent = `${videos.length} videos (checking compatibility...)`;
                    
                    const firstBatch = videos.slice(0, 20);
                    firstBatch.forEach(async (video) => {
                        const filename = video.filename || video;
                        await player.getVideoCodec(filename); 
                        const cards = videoGrid.children;
                        for (let card of cards) {
                            const titleEl = card.querySelector('h3');
                            if (titleEl && titleEl.title === filename) {
                                const badge = card.querySelector('.codec-badge');
                                if (badge && player.codecCache.has(filename)) {
                                    const isCompatible = player.codecCache.get(filename);
                                    if (isCompatible) {
                                        badge.className = 'codec-badge compatible';
                                        badge.textContent = '✅ H.264';
                                    } else {
                                        badge.className = 'codec-badge incompatible';
                                        badge.textContent = '❌ Not H.264';
                                        card.classList.add('non-h264');
                                    }
                                }
                                break;
                            }
                        }
                    });
                } else {
                    videos.forEach(video => {
                        const card = createVideoCard(video, false);
                        videoGrid.appendChild(card);
                    });
                }
                updateStats(videos, statsMessage);
            }

        function createVideoCard(video, isMobileMode) {
            const card = document.createElement('div');
            card.className = 'video-card';
            
            const filename = video.filename || video;
            const displayName = filename.length > 50 ? filename.substring(0, 47) + '...' : filename;
            
            card.innerHTML = `
                <h3 title="${escapeHtml(filename)}">${escapeHtml(displayName)}</h3>
                <div class="video-card-footer">
                    ${isMobileMode ? '<span class="codec-badge">⟳ Check</span>' : ''}
                    ${video.size ? `<span class="file-size">${formatFileSize(video.size)}</span>` : ''}
                </div>
            `;
            
            if (isMobileMode) {
                // Check codec when user hovers over card (anticipating click)
                card.addEventListener('mouseenter', async () => {
                    const badge = card.querySelector('.codec-badge');
                    if (badge && badge.textContent === '⟳ Check') {
                        badge.textContent = 'Checking...';
                        const isCompatible = await player.getVideoCodec(filename);
                        if (isCompatible) {
                            badge.className = 'codec-badge compatible';
                            badge.textContent = '✅ H.264';
                        } else {
                            badge.className = 'codec-badge incompatible';
                            badge.textContent = '❌ Not H.264';
                            card.classList.add('non-h264');
                        }
                    }
                }, { once: true }); // Only check once
                
                // Also check when card becomes visible (if using Intersection Observer)
                if ('IntersectionObserver' in window) {
                    const observer = new IntersectionObserver((entries) => {
                        entries.forEach(entry => {
                            if (entry.isIntersecting) {
                                const badge = card.querySelector('.codec-badge');
                                if (badge && badge.textContent === '⟳ Check') {
                                    badge.textContent = 'Checking...';
                                    player.getVideoCodec(filename).then(isCompatible => {
                                        if (isCompatible) {
                                            badge.className = 'codec-badge compatible';
                                            badge.textContent = '✅ H.264';
                                        } else {
                                            badge.className = 'codec-badge incompatible';
                                            badge.textContent = '❌ Not H.264';
                                            card.classList.add('non-h264');
                                        }
                                    });
                                }
                                observer.unobserve(entry.target);
                            }
                        });
                    });
                    observer.observe(card);
                }
            }
            
            card.addEventListener('click', () => {
                if (player.mobileMode) {
                    // Check compatibility on click if not already checked
                    if (!player.codecCache.has(filename)) {
                        loadingIndicator.style.display = 'block';
                        player.getVideoCodec(filename).then(isCompatible => {
                            loadingIndicator.style.display = 'none';
                            if (isCompatible) {
                                playVideo(filename);
                            } else {
                                showError('This video cannot be played in mobile mode (not H.264 compatible)');
                            }
                        });
                    } else {
                        const isCompatible = player.codecCache.get(filename);
                        if (isCompatible) {
                            playVideo(filename);
                        } else {
                            showError('This video cannot be played in mobile mode (not H.264 compatible)');
                        }
                    }
                } else {
                    playVideo(filename);
                }
            });
            
            return card;
        }

        function updateStats(videos, statsMessage) {
            if(statsMessage){
                videoStats.textContent = statsMessage;
            } else{
                const compatibleCount = Array.from(document.querySelectorAll('.video-card:not(.non-h264)')).length;
                const totalCount = videos.length;

                if(player.mobileMode){
                    videoStats.textContent = `${compatibleCount}/${totalCount} H.264 compatible`;
                } else{
                    videoStats.textContent = `${totalCount} videos`;
                }
            }
        }
            
        async function playVideo(filename) {
            if (!player.token) {
                showError('Not authenticated. Please refresh the page.');
                return;
            }
            
            if(player.mobileMode){
                loadingIndicator.style.display = 'block';
                const isCompatible = await player.checkH264Compatability(filename);
                loadRandomVideo.style.display = 'none';

                if(!isCompatible){
                    showError('This video cannot be played in mobile mode.')
                    return;
                }
            }

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

        console.log("Token valid...")

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

    async getVideoCodec(filename){
        if(!this.token){
            await this.refreshToken();
            if (!this.token) return null;
        }

        try{
            const response = await fetch(`${this.serverUrl}/api/local/videos/codec/${encodeURIComponent(filename)}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const dat = await response.json();
                return data.codec;
            }
        
        } catch (error){
            console.log('Failed to get codec for: ', filename);
            return null;
        }
        return null;
    }

    async checkH264Compatability(video){
        const filename = video.filename || video;

        const codec = await this.getVideoCodec(filename);

        if (!codec) return false;

        const codecLower = codec.toLowerCase();
        return codecLower.includes('h264') || codecLower.includes('avc') || codecLower.includes('h.264');

    }

    async filterVideoForMobile(videos) {
        if (!this.mobileMode) return videos;
        
        const filtered = [];
        for (const video of videos) {
            const filename = video.filename || video;
            
            if (this.codecCache.has(filename)) {
                if (this.codecCache.get(filename)) {
                    filtered.push(video);
                }
                continue;
            }
            
            const isCompatible = await this.checkH264Compatability(video);
            this.codecCache.set(filename, isCompatible);
            
            if (isCompatible) {
                filtered.push(video);
            }
            
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        return filtered;
    }

    async batchCheckCodecs(videos, batchSize = 5) {
        const results = [];
        for (let i = 0; i < videos.length; i += batchSize) {
            const batch = videos.slice(i, i + batchSize);
            const batchPromises = batch.map(async (video) => {
                const filename = video.filename || video;
                if (!this.codecCache.has(filename)) {
                    await this.getVideoCodec(filename);
                }
                return {
                    video,
                    isCompatible: this.codecCache.get(filename) || false
                };
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Small delay between batches
            if (i + batchSize < videos.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }

    async getVideoCodec(filename){
        if(this.codecCache.has(filename)){
            return this.codecCache.get(filename);
        }

        if(this.pendingCodecChecks.has(filename)){
            return this.pendingCodecChecks.get(filename);
        }

        if(!this.token){
            await this.refreshToken();
            if(!this.token) return null;
        }

        const checkPromise = (async () => {
            try{
                const h264Extensions = ['.mp4', '.m4v', '.mov'];
                const hasH264Ext = h264Extensions.some(ext => filename.toLowerCase().endsWith(ext));
                
                if (!hasH264Ext) {
                    this.codecCache.set(filename, false);
                }

                const response = await fetch(`${this.serverUrl}/api/local/videos/codec/${encodeURIComponent(filename)}`, {
                    headers: {
                        'X-Auth-Token': this.token,
                        'Referer': window.location.origin
                    }
                });

                if(response.ok){
                    const data = await response.json();
                    const codec = data.codec || '';
                    const isH264 = data.is_h264 || false;

                    this.codecCache.set(filename, isH264);
                    return isH264;
                }
            } catch (error){
                console.log('Failed to get codec for: ', filename);
            }

            this.codecCache.set(filename, false);
            return false;
        })();

        this.pendingCodecChecks.set(filename, checkPromise);
        checkPromise.finally(() => {
            this.pendingCodecChecks.delete(filename);
        });
        return checkPromise;
    }

    async preloadVideo(filename){
        if(!this.token) return null;

        try{
            const videoUrl = `${this.serverUrl}/api/local/videos/${encodeURIComponent(filename)}`;
            const response = await fetch(videoUrl, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                return url;
            }
        } catch (error){
            console.log('Preload failed for: ', filename);
            return null;
        }
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