class tsPlayer{
    constructor(){
        this.serverUrl = 'https://bluethsprojectsite.fun';
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

        this.setupEventListeners();
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
            const response = await fetch(`${this.website}/api/local/status/simple`, {
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
            const response = await fetch(`${this.website}/api/local/health`, {
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
            const response = await fetch(`${this.website}/api/local/token`, {
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

        let allTags = [];
        let playlist = [];
        let currentPlaylistIndex = 0;
        let isPlayingPlaylist = false;
        let retryCount = 0;
        const maxRetries = 3;

        document.addEventListener('DOMContentLoaded', async function() {

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
            const filters = document.getElementById('filter-options');
            const currentTimeSpan = document.getElementById('current-time');
            const durationSpan = document.getElementById('duration');
            const mobileCheckbox = document.getElementById('mobile-mode');
            const mobileIndicator = document.createElement('div');
            const pipBtn = document.getElementById('pip-btn');

            mobileIndicator.id = 'mobile-indicator';
            mobileIndicator.style.display = 'none';
            document.querySelector('.nav-bar').appendChild(mobileIndicator);

            let allVideos = [];
            let filterMetadata = await player.getFilterMetadata();


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
            });

            if(document.pictureInPictureEnabled){
                pipBtn.style.display = 'inline-block';

                pipBtn.addEventListener('click', async () => {
                    try{
                        if(document.pictureInPictureElement){
                            await document.exitPictureInPicture();
                        }
                        else if (videoPlayer.readyState > 0){
                            await videoPlayer.requestPictureInPicture();
                        } 
                        else {
                            player.showInfo('Play a video first before entering PIP mode');
                        }
                    } catch (error) {
                        console.error('PiP failed, ', error);
                        player.mobileLog('PiP error: ' + error.message);
                    }
                });
                
                videoPlayer.addEventListener('enterpictureinpicture', () => {
                    pipBtn.textContent = 'Exit PiP';
                    pipBtn.style.background = '#4CAF50'
                });

                videoPlayer.addEventListener('leavepictureinpicture', () => {
                    pipBtn.textContent = '◳ PiP Mode';
                    pipBtn.style.background = '';
                });          
            } else {
                console.log('Picture-in-Picture not supported in this browser.');
            }

            document.querySelectorAll('.filter-header').forEach(id => {
                id.addEventListener('click', function() {
                    const header = this;
                    player.toggleSection(header);
                });
            });               
            
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
            if(filters.style.display === 'none' || !filters.style.display){
                filters.style.display = 'block';
                await player.loadFilters(filterMetadata);
            } else {
                filters.style.display = 'none';
            }
        });

        // Apply tags filter
        document.getElementById('apply-filters').addEventListener('click', async () => {
            await player.refreshToken();
            loadingIndicator.style.display = 'block';
            
            const selections = player.collectFilterSelections();

            try {
                // Get all videos first
                let videos = await player.getFilteredVideos(selections);
                                
                if (videos && videos.length > 0) {
                    // Shuffle the array
                    playlist = [...videos];
                    shuffleArray(playlist);
                    currentPlaylistIndex = 0;
                    isPlayingPlaylist = true;

                    videoBrowser.style.display = 'none';
                    playerScreen.style.display = 'block';
                    filters.style.display = 'none';

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

                player.showInfo('Mobile mode enabled - videos will be checked for compatibility when played');
                
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
                if(!player.token || Date.now() > player.tokenExpiry){
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
                    const videoUrl = `${player.website}/api/local/videos/${filename}?token=${encodeURIComponent(player.token)}`;
                    console.log("Video URL: " + videoUrl);
                    
                    videoPlayer.removeEventListener('ended', handleVideoEnded);
                    videoPlayer.src = videoUrl;
                    videoPlayer.load();
                    videoPlayer.addEventListener('ended', handleVideoEnded);

                    preloadNextVideos(index)

                    if('mediaSession' in navigator){
                        navigator.mediaSession.metadata = new MediaMetadata({
                            title: video.opening_name || video.filename,
                            artist: 'Theme Song Player',
                            album: 'Playlist Mode'
                        });

                        navigator.mediaSession.setActionHandler('play', () => videoPlayer.play());
                        navigator.mediaSession.setActionHandler('pause', () => videoPlayer.pause());

                        navigator.mediaSession.setActionHandler('previoustrack', () => {
                            if(currentPlaylistIndex > 0) playPlaylistVideo(currentPlaylistIndex-1);
                        });
                        navigator.mediaSession.setActionHandler('nexttrack', () => {
                            handleVideoEnded();
                        });
                    }

                    videoPlayer.play()
                        .then(() => {
                            if('mediaSession' in navigator){
                                 navigator.mediaSession.playbackState = 'playing';

                                 navigator.mediaSession.metadata = new MediaMetadata({
                                    title: video.opening_name || video.filename,
                                    artist: 'Theme Song Player',
                                    album: 'Playlist Mode'
                                 });

                                 navigator.mediaSession.setActionHandler('play', () => videoPlayer.play());
                                 navigator.mediaSession.setActionHandler('pause', () => videoPlayer.pause());
                                 navigator.mediaSession.setActionHandler('previoustrack', () => {
                                    if(currentPlaylistIndex > 0) playPlaylistVideo(currentPlaylistIndex - 1);
                                 });
                                 navigator.mediaSession.setActionHandler('nexttrack', () => {
                                    handleVideoEnded();
                                 });
                            }
                        })
                        .catch(e => {console.log('Autoplay prevented: ', e); if('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'});
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
                            
                            const videoUrl = `${player.website}/api/local/videos/${encodeURIComponent(nextVideo.filename)}?token=${encodeURIComponent(player.token)}`;
                            preloader.src = videoUrl;
                            preloader.load();
                            console.log('Preloaded next video:', nextVideo.filename);

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

                            const videoUrl = `${player.website}/api/local/videos/${encodeURIComponent(nextVideo.filename)}?token=${encodeURIComponent(player.token)}`;
                            preloader.src = videoUrl;
                            preloader.load();
                            preloader.dataset.preloadedIndex = nextIndex;
                            console.log(`Preloaded video ${nextIndex + 1}/${playlist.length}: ${nextVideo.filename}`);

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
                        
                        videoPlayer.currentTime = 0;

                        // Start preloading the next one
                        preloadNextVideos(nextIndex);

                        if('mediaSession' in navigator){
                            navigator.mediaSession.metadata = new MediaMetadata({
                                title: nextVideo.opening_name || nextVideo.filename,
                                artist: 'Theme Song Player',
                                album: 'Playlist Mode'
                            });
                        }

                        videoPlayer.play()
                            .then(() => {
                                if('mediaSession' in navigator){
                                    navigator.mediaSession.playbackState = 'playing';

                                    navigator.mediaSession.metadata = new MediaMetadata({
                                        title: nextVideo.opening_name || nextVideo.filename,
                                        artist: 'Theme Song Player',
                                        album: 'Playlist Mode'
                                    });

                                    navigator.mediaSession.setActionHandler('play', () => videoPlayer.play());
                                    navigator.mediaSession.setActionHandler('pause', () => videoPlayer.pause());
                                    navigator.mediaSession.setActionHandler('previoustrack', () => {
                                        if(currentPlaylistIndex > 0) playPlaylistVideo(currentPlaylistIndex - 1);
                                    });
                                    navigator.mediaSession.setActionHandler('nexttrack', () => {
                                        handleVideoEnded();
                                    });
                                }
                            })
                            .catch(e => {console.log('Autoplay prevented: ', e); if('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'});                        currentPlaylistIndex = nextIndex;
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
                    const response = await fetch(`${player.website}/api/local/videos/random?count=1`, {
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
                const videoUrl = `${player.website}/api/local/videos/${encodeURIComponent(filename)}?token=${encodeURIComponent(player.token)}`;
                console.log('Loading video from:', videoUrl);
                
                videoPlayer.src = videoUrl;
                videoPlayer.load();
                videoPlayer.play().catch(e => console.log('Autoplay prevented: ', e));

            } catch (error) {
                showError('Failed to load video: ' + error.message);
            }
        }

            // Video player event listeners
            videoPlayer.addEventListener('timeupdate', updateProgress);
            videoPlayer.addEventListener('loadedmetadata', updateDuration);

            videoPlayer.addEventListener('error', () => {
                const err = videoPlayer.error;

                //player.mobileLog(err);
                //player.mobileLog(err.code);

                if(!err) return;

                if(err.code === 4){
                    console.log("Unsupported video format detected. Auto-skipping.");
                    //player.mobileLog('Unsupported video format.')
                    handleVideoEnded();
                }

                if (err && (err.code === 2 || err.code === 3) && retryCount < maxRetries){
                    retryCount++;
                    console.log('Stream interrupted. Retrying video...');

                    const currentSrc = videoPlayer.src;
                    const currentTime = videoPlayer.currentTime;

                    videoPlayer.src = currentSrc;
                    videoPlayer.load();

                    videoPlayer.addEventListener('loadedmetadata', function resumePlayback(){
                        videoPlayer.currentTime = currentTime;
                        videoPlayer.play().catch(e => 'Autoplay prevented on retry: ', e);
                        videoPlayer.removeEventListener('loadedmetadata', resumePlayback);
                    }); 
                } else if(retryCount >= maxRetries){
                    console.log('Max retries hit. The video stream has failed.');
                    //player.mobileLog('Max retries hit.')
                    handleVideoEnded();
                }
            });
            
            function updateProgress() {
                if (videoPlayer.duration) {
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
            const response = await fetch(`${this.website}/api/local/videos`, {
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

    async getFilteredVideos(selections){
        if(Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        if(!this.token) return [];
        try{
            const response = await fetch(`${this.website}/api/local/videos/filter`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter_rules: selections
                })
            });

            if(response.ok){
                const data = await response.json();
                let videos = [];

                if(data.videos && Array.isArray(data.videos)){
                    videos = data.videos;
                } else if (Array.isArray(data)){
                    videos = data;
                }
                videos.forEach(video => {
                    if(video.filename && video.codec){
                        const isH264 = this.isH264Codec(video.codec);
                        this.codecCache.set(video.filename, isH264);
                    }
                });
                console.log(videos);
                return videos;
            } else {
                console.error('Failed to fetch videos, status: ', response.status);
            }
        } catch (error) {
            console.error('Failed to fetch videos: ', error);
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
        const videoBrowser = document.getElementById('video-browser')
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


        const videoUrl = `${this.website}/api/local/videos/${encodeURIComponent(videoPath)}?token=${encodeURIComponent(this.token)}`

        const video = document.createElement('video');
        videoPath.controls = true;
        videoPath.style.width = '100%'

        video.src = videoUrl;
        document.body.appendChild(video);
        video.play();
    }

    mobileLog(message){
        console.log(message);

        let debugDiv = document.getElementById('mobile-debug-log');
        if (!debugDiv) {
            debugDiv = document.createElement('div');
            debugDiv.id = 'mobile-debug-log';
            debugDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:120px;background:rgba(0,0,0,0.7);color:lime;overflow-y:scroll;font-family:monospace;z-index:9999;font-size:12px;padding:5px;pointer-events:none;';        }
            document.body.appendChild(debugDiv);

        const time = new Date().toLocaleTimeString();
        debugDiv.innerHTML = `<div>[${time}] ${message}</div>`
        debugDiv.scrollTop = debugDiv.scrollHeight;
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
                const data = await response.json();
                return data;
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
            specialCheckbox.dataset.tristate = 'include';
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
        };

        const listIds = ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list', 'countries-list'];
        
        listIds.forEach(listId => {
            const section = listId.split('-')[0]
            let target;

            if(section === 'production') target = 'production_companies'
            else target = section

            const list = document.getElementById(listId);
            if (!list) return;

            list.querySelectorAll('.tristate-checkbox').forEach(checkbox => {
                const value = checkbox.value;
                const state = checkbox.dataset.tristate || 'null';

                if (state === 'include'){
                    selections[target].include.push(value);
                } else if (state === 'exclude') {
                    selections[target].exclude.push(value);
                }
            });
        });

        const special_openings = document.getElementById('special-checkbox');
        if(!special_openings) return;
        
        const value = special_openings.value;
        const state = special_openings.dataset.tristate || 'null';

        if (state === 'include'){
            selections['special_openings'].include.push(value);
        } else if (state === 'exclude'){
            selections['special_openings'].exclude.push(value);
        }

        return selections
    }

    toggleSection(header){
        const content = header.nextElementSibling;
        content.classList.toggle('active');
        const arrow = header.querySelector('.arrow');
        arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
    }

    async searchVideos(query){
        if(!this.token || query.length < 3) return [];

        try{
            const response = await fetch(`${this.website}/api/local/search?q=${encodeURIComponent(query)}`, {
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