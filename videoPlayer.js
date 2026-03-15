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

        this.player.addEventListener('canplay', () => {
            this.handleCanPlay();
        });

        this.player.addEventListener('play', () => {
            this.handlePlay();
        });

        this.player.addEventListener('pause', () => {
            this.handlePause();
        });

        this.player.addEventListener('loadedmetadata', () => {
            this.handleLoadedMetadata();
        });

        this.player.addEventListener('error', () => {
            if(this.reloadTried){
                this.handleError();
            } else {
                this.reloadTried = true;

                setTimeout(() => {
                    this.player.src = this.currentVideoUrl;
                }, 100);
            }
        });

        this.player.addEventListener('stalled', () => {
            if(!this.reloadTried){
                this.reloadTried = true;

                setTimeout(() => {
                    this.player.src = this.currentVideoUrl;
                }, 100);
            }
        });

        this.player.addEventListener('timeupdate', () => {
            this.handleTimeUpdate(this.player.currentTime);
        });

        this.player.addEventListener('seeking', () => {
            this.handleSeeking(this.player.currentTime);
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
        return this.player.currentTime;
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

        this.player.removeEventListener('progress', this.handleProgressEvent);
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
        if(this.playOnReady){
            this.player.play();
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
        this.replayVideo();
    }

    replayVideo(){
        this.pauseVideo();
        this.player.play();
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

}