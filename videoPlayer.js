class VideoPlayer{
    constructor(player){
        this.player = player;

        this.player.controls = false;
        this.player.autoplayer = false;
        this.player.preload = 'metadata';

        this.player.disablePictureInPicture = true;
        this.player.disableRemotePlayback = true;

        //this.player.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
        //this.player.style.pointerEvents = 'none';

        this.videoVolume = 100;
        this.playOnReady = true;
        this.startPoint;
        this.readyReported;
        this.bufferLength;
        this.reloadTried = false;
        this.currentVideoUrl;
        this.forcedMute = false;

        this.bufferMonitorInterval;
        this._TIME_TO_BUFFER_BEFORE_READY = 10;

        this.setupEventListeners();
    }

    setupEventListeners(){ 
        this.player.ready(() => {
            this.updateVolume(this.videoVolume);
        });

        this.player.on('canplay', () => {
            this.handleCanPlay();
        });

        this.player.on('playing', () => {
            if(!this.playOnReady){
                this.updateVolume(0);
                this.updateVolume(this.videoVolume);
            }
        });

        this.player.on('play', () => {
            this.handlePlay();
        });

        this.player.on('pause', () => {
            this.handlePause();
        });

        this.player.on('loadedmetadata', () => {
            this.handleLoadedMetadata();
        });

        this.player.on('error', () => {
            if(this.reloadTried){
                this.handleError();
            } else {
                this.reloadTried = true;

                setTimeout(() => {
                    this.player.src = this.currentVideoUrl;
                }, 100);
            }
        });

        this.player.on('stalled', () => {
            if(!this.reloadTried){
                this.reloadTried = true;

                setTimeout(() => {
                    this.player.src = this.currentVideoUrl;
                }, 100);
            }
        });

        this.player.on('timeupdate', () => {
            this.handleTimeUpdate(this.player.currentTime());
        });

        this.player.on('seeking', () => {
            this.handleSeeking(this.player.currentTime());
        });
    }

    get videoLength() {
        return this.player.duration();
    }

    get bufferMonitorTickRate() {
        return 333;
    }

    get isPlaying(){
        return !this.player.paused();
    }

    get currentTime() {
        return this.player.currentTime();
    }

    getBufferedPercent(){
        const video = this.player

        if(!video.duration || isNaN(video.duration) || video.duration === 0){
            return 0;
        }

        if (video.buffered.length === 0){
            return 0;
        }

        const bufferedEnd = video.buffered.end(video.buffered.length - 1);

        return bufferedEnd / video.duration;
    }

    getBufferedEnd(){
        const video = this.player;

        if(video.buffered.length === 0){
            return 0;
        }

        return video.buffered.end(video.buffered.length - 1);
    }

    isTimeBuffered(time){
        const video = this.player;

        for(let i = 0; i< video.buffered.length; i++){
            if(time >= video.buffered.start(i) && time <= video.buffered.end(i)){
                return true;
            }
        }
        return false;

    }

    getBufferedRanges(){
        const ranges = [];
        const video = this.player;

        for (let i = 0; i < video.buffered.length; i++){
            ranges.push({
                start: video.buffered.start(i),
                end: video.buffered.end(i)
            });
        }

        return ranges;
    }

    startBufferMonitor() {
        this.stopBufferMonitor();
        this.readyReported = false;
        this.player.addEventListener('progress', this.handleProgressEvent.bind(this));
        
        this.bufferMonitorInterval = setInterval(() => {
            this.checkBufferStatus();
        }, 333);
    }

    handleProgressEvent(){
        this.checkBufferStatus();
    }

    checkBufferStatus(){
        const bufferedPercent = this.getBufferedPercent();
        const bufferedEnd = this.getBufferedEnd();

        if (bufferedEnd > this.startPoint + this._TIME_TO_BUFFER_BEFORE_READY || bufferedPercent >= 0.99){
            if(!this.readyReported){
                this.handleVideoReady();
                this.readyReported = true;
            }

            if (this.isFinishedBuffering()){
                this.handleVideoFinishedBuffering();
                this.stopBufferMonitor();

                if(this.playOnReady){
                    this.pauseVideo();
                }
            }
        }
    }



    handleBuffMeasurement(bufferedPercent){
        if(this.player.bufferedEnd() > this.startPoint + this._TIME_TO_BUFFER_BEFORE_READY || bufferedPercent === 1){
            if(!this.readyReported){
                this.handleVideoReady();
                this.readyReported = true;
            }
            if (this.player.bufferedEnd() >= this.startPoint + this.bufferLength || bufferedPercent === 1){
                this.handleVideoFinishedBuffering();
                this.stopBufferMonitor();
                if(!this.playOnReady) {
                    this.pauseVideo();
                }
            }
        }
    }

    stopBufferMonitor(){
        if(this.bufferMonitorInterval){
            clearInterval(this.bufferMonitorInterval);
            this.bufferMonitorInterval = null;
        }

        this.video.removeEventListener('progress', this.handleProgressEvent);
    }

    isReadyToPlay(){
        const bufferedEnd = this.getBufferedEnd();
        return bufferedEnd > this.startPoint + this._TIME_TO_BUFFER_BEFORE_READY;
    }

    isFinishedBuffering(){
        const bufferedEnd = this.getBufferedEnd();
        const befferedPercent = this.getBufferedPercent();

        return (bufferedEnd >= this.startPoint + this.bufferLength || bufferedPercent >= 0.99);
    }

    handleCanPlay(){
        this.updateVolume(this.videoVolume);
        if(this.playOnReady){
            if(!this.forcedMute){
                this.player.muted(false);
            }
            this.player.play();
        } else {
            this.player.muted(true);
        }
    }

    handleLoadedMetadata(){

    }

    handleError(){

    }

	handleVideoReady() {

    }

	handleVideoFinishedBuffering() {

    }

	handleTimeUpdate() {

    }

	handlePlay() {

    }

	handlePause() {

    }

	handleSeeking() {

    }

    setVolume(newVolume){
        this.videoVolume = newVolume;
        this.updateVolume(newVolume);
    }

    updateVolume(baseVolume){
        this.player.volume = baseVolume;
    }

    hide(){
        this.player.hide();
    }

    show(){
        this.player.show();
    }

    setVideo(videoUrl){
        this.reloadTried = false;
        this.currentVideoUrl = videoUrl;
        this.player.src = videoUrl;
    }

    getVideoVolume(){
        return null
    }

    playVideo() {
        this.playOnReady = true;
        if(!this.forcedMute){
            this.player.muted(false);
        }
        this.replayVideo();
    }

    mute() {
        this.forcedMute = true;
        this.player.muted(true);
    }

    unmute(){
        this.forcedMute = false;
        this.player.muted(false);
    }

    replayVideo(){
        this.pauseVideo();
        this.player.currentTime(this.startPoint);
        this.player.play();
        this.updateVolume(this.videoVolume);
    }

    pauseVideo(){
        this.player.pause();
    }

    unpauseVideo(){
        this.player.play();
    }

    stopVideo(){
        this.playOnReady = false;
        this.pauseVideo();
        this.stopBufferMonitor();
    }

    getVideoUrl() {
        return this.currentVideoUrl;
    }

    seekTo(time) {
        this.player.currentTime(time);
    }

}