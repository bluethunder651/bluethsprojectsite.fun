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
            });
        }

        const goHome = document.getElementById('go-home');
        if(goHome){
            goHome.addEventListener('click', () => {
                window.location.href = `${self.website}`
            });
        }

        const tsViewer = document.getElementById('start-ts-viewer');
        if(tsViewer){
            tsViewer.addEventListener('click', () => {
                window.location.href = `${self.website}/tsviewer.html`
            });
        } 
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Controller();
});