class FileTransfer{
    constructor(){
        this.website = 'https://julia.bluethsprojectsite.fun';
        this.token = null;

        this.verifyAdmin();
        this.setupEventListeners();
    }

    setupEventListeners() {
    }

    async verifyAdmin(){
        const adminResponse = await fetch(`${this.website}/api/auth/verify-admin`);

        if (adminResponse.ok){
            const data = await adminResponse.json();
            console.log('Admin: ', data.admin);

            if (data.admin){
                this.showScreen('upload-screen');
            }
        }
    }

    showScreen(screenId) {
        console.log("Showing screen:", screenId);
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        } else {
            console.error("Screen not found:", screenId);
        }
    }
}