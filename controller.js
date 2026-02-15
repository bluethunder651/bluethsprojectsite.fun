class Controller {
    constructor(){
        this.website = "https://bluethsprojectsite.fun"
        this.setupEventListeners();
    }

    setupEventListeners() {
        const self = this;

        const startSongQuiz = document.getElementById('start-music-game');
        if(startSongQuiz){
            startSongQuiz.addEventListener('click', () => {
                window.location.href= `${self.website}/musicGame.html`
            })
        }
    }
}