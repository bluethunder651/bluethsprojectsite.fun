class tsPlayer{
    constructor(){
        this.serverUrl = '';
        this.token = null;
        this.tokenExpiry = null;
        this.enabled = false;
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
            const response = await fetch(`${this.serverUrl}/api/token`, {
                headers: {
                    'Referer': 'https://bluethsprojectsite.fun'
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
                    'Referer': 'https://bluethsprojectsite.fun'
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
                    'Referer': 'https://bluethsprojectsite.fun'
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
                    'Referer': 'https://bluethsprojectsite.fun'
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
