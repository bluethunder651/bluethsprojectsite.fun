class VideoPlayer{
    constructor(player){
        this.player = player;

        this.player.setAttribute("disablePictureInPicture");
        this.player.setAttribute("disablepictureinpicture", "");
        this.player.setAttribute("disableremoteplayback", "");
        this.player.setAttribute("noremoteplayback", "");
        this.player.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");

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
                    this.player.src({src: this.currentVideoUrl, type: 'video/mp4'})
                }, 100);
            }
        });

        this.player.on('stalled', () => {
            if(!this.reloadTried){
                this.reloadTried = true;

                setTimeout(() => {
                    this.player.src({src: this.currentVideoUrl, type: 'video/mp4'});
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

    startBufferMonitor() {
        this.stopBufferMonitor();
        this.readyReported = false;
        this.bufferMonitorInterval = setInterval(() => {
            let bufferedPercent = this.player.bufferedPercent();
            this.handleBuffMeasurement(bufferedPercent);
        }, this.bufferMonitorTickRate);
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
        clearInterval(this.bufferMonitorInterval);
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
        let videoVolume = this.getVideoVolume();
        this.player.volume(baseVolume);
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
        this.player.src({
            src: videoUrl,
            type: 'video/mp4'
        });
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