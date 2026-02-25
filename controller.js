class Controller {
    constructor(){
        this.website = "https://julia.bluethsprojectsite.fun"
        this.setupEventListeners();
        this.checkAuthStatus();
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

        const tsGame = document.getElementById('start-ts-game');
        if(tsGame){
            tsGame.addEventListener('click', () => {
                window.location.href = `${self.website}/tsPlayer.html`
            });
        }

        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }

        const registerBtn = document.getElementById('register-btn');
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                window.location.href = 'register.html';
            });
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await fetch(`${this.website}/api/auth/logout`, { method: 'POST' });
                localStorage.removeItem('user');
                window.location.reload();
            });
        }
    }

    checkAuthStatus(){
        fetch(`${this.website}/api/auth/me`)
            .then(response => response.json())
            .then(data => {
                const loginBtn = document.getElementById('login-btn');
                const registerBtn = document.getElementById('register-btn');
                const logoutBtn = document.getElementById('logout-btn');
                const usernameDisplay = document.getElementById('username-display');

                if(data.user){
                    loginBtn.style.display = 'none';
                    registerBtn.style.display = 'none';
                    logoutBtn.style.display = 'inline-block';
                    usernameDisplay.textContent = `Welcome, ${data.user.username}!`;
                } else {
                    loginBtn.style.display = 'inline-block';
                    registerBtn.style.display = 'inline-block';
                    logoutBtn.style.display = 'none';
                    usernameDisplay.textContent = "";
                }
            });
    }

}



document.addEventListener('DOMContentLoaded', () => {
    new Controller();
});