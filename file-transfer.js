class FileTransfer{
    constructor(){
        this.website = 'https://julia.bluethsprojectsite.fun';
        this.token = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', async function() {
            const adminResponse = await fetch(`${this.website}/api/auth/verify-admin`);

            if (adminResponse.ok){
                const data = await adminResponse.json();
                console.log('Admin: ', data.admin);
            }
        });
    }
}