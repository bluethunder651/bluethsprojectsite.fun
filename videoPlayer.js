class VideoPlayer{
    constructor(player){
        this.player = player;

        this.player.controls = false;
        this.player.autoplayer = false;
        this.player.preload = 'auto';
        this.player.disablePictureInPicture = true;
        this.player.disableRemotePlayback = true;

        this.currentVideoUrl = null;
        this.reloadTried = false;

        this._monitorInterval = null;
        this._boundHandleProgress = null;
        this._readyFired = false;

        this._setupEventListeners();
    }

    _setupEventListeners(){ 

        this.player.addEventListener('error', () => {
            if(this.reloadTried){
                this.handleError();
            } else {
                this.reloadTried = true;
                setTimeout(() => {
                    this.player.src = this.currentVideoUrl;
                    this.player.load();
                }, 200)
            }
        });

        this.player.addEventListener('timeupdate', () => this.handleTimeUpdate(this.player.currentTime));
        this.player.addEventListener('play', () => this.handlePlay());
        this.player.addEventListener('pause', () => this.handlePause());
        this.player.addEventListener('seeking', () => this.handleSeeking(this.player.currentTime));

    }

    load(url){
        this._stopMonitor();
        this._readyFired = false;
        this.reloadTried = false;
        this.currentVideoUrl = url;

        this.player.preload = 'auto';
        this.player.src = url;
        this.player.load();

        this._startMonitor();
    }

    play(){
        this.player.play();
    }

    pause(){
        this.player.pause();
    }

    stop(){
        this.player.pause();
        this._stopMonitor();
    }

    hide(){
        this.player.classList.add('video-hidden');
    }

    show(){
        this.player.classList.remove('video-hidden');
    }

    get currentTime() {
        return this.player.currentTime;
    }

    get duration(){
        return this.player.duration;
    }

    get isPlaying(){
        return !this.player.paused;
    }

    handleVideoReady(){

    }

    handleError(){

    }

    handleTimeUpdate(time){

    }

    handlePlay(){

    }

    handlePause(){

    }

    handleSeeking(time){

    }

    _startMonitor(){
        this._boundHandleProgress = () => this._checkBuffer();
        this.player.addEventListener('progress', this._boundHandleProgress);
        this._monitorInterval = setInterval(() => this._checkBuffer(), 333);
    }

    _stopMonitor(){
        if(this._monitorInterval){
            clearInterval(this._monitorInterval);
            this._monitorInterval = null;
        }
        if(this._boundHandleProgress){
            this.player.removeEventListener('progress', this._boundHandleProgress);
            this._boundHandleProgress = null;
        }
    }

    _checkBuffer(){
        const v = this.player;
        if (this._readyFired) return;
        if(!v.duration || isNaN(v.duration) || v.duration === 0) return;
        if(v.buffered.length === 0) return;

        const bufferedEnd = v.buffered.end(v.buffered.length - 1);
        const bufferedPercent = bufferedEnd / v.duration;

        if(bufferedPercent >= 0.40){
            this._readyFired = true;
            this._stopMonitor();
            this.handleVideoReady();
        }
    }

}