class SignAndLogIn{
    constructor() {
        this.website = "https://bluethsprojectsite.fun";
        this.setupEventListeners();
    }

    setupEventListeners(){
        loginForm = document.getElementById('loginForm')
        if(loginForm){
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const errorEl = document.getElementById('errorMessage');
                const successEl = document.getElementById('successMessage');
                errorEl.style.display = 'none';
                successEl.style.display = 'none';

                const formData = {
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                    remember_me: document.getElementById('rememberMe').checked
                };

                try{
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });

                    const data = await response.json()
                    if (response.ok){
                        successEl.textContent = 'Login successful! Redirecting...'
                        successEl.style.display = 'block';

                        localStorage.setItem('user', JSON.stringify(data.user));

                        setTimeout(() => {
                            window.location.href = 'index.html';
                        }, 2000);
                    } else {
                        errorEl.textContent = data.error || 'Login Failed';
                        errorEl.style.display = 'block';
                    }
                } catch (error){
                    errorEl.textContent = 'Network Error. Please try again.'
                    errorEl.style.display = 'block';
                }
            });

            (async () => {
                try{
                    const response = await fetch('/api/auth/me');
                    const data = await response.json();
                    if(data.user){
                        window.location.href = 'index.html';
                    }
                } catch (error){
                    console.log('Not logged in')
                }
            })();
        }

        const passwordInput = document.getElementById('password');
        const confirmInput = document.getElementById('confirmPassword');
        const strengthBar = document.getElementById('passwordStrength');
        const matchDiv = document.getElementById('passwordMatch');

        if(passwordInput){
            passwordInput.addEventListener('input', () => {
                const password = passwordInput.value;
                let strength = 'weak';

                if(password.length >= 8){
                    const hasUpper = /[A-Z]/.test(password);
                    const hasLower = /[a-z]/.test(password);
                    const hasNumber = /[0-9]/.test(password);
                    const hasSpecial = /[^A-Za-z0-9]/.test(password);

                    const score = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
                    
                    if(score >= 3 && password.length >= 10) strength = 'strong';
                    else if (score >= 2) strength = 'medium';
                }

                strengthBar.className = 'password-strength-bar';
                if(strength === 'weak') strengthBar.classList.add('strength-weak');
                else if (strength === 'medium') strengthBar.classList.add('strength-medium');
                else if (strength === 'strong') strengthBar.classList.add('strength-strong');

                checkPasswordMatch();
            });
        }

        function checkPasswordMatch() {
            const password = passwordInput.value;
            const confirm = confirmInput.value;

            if(confirm){
                if(password === confirm){
                    matchDiv.textContent = 'Passwords match';
                    matchDiv.style.color = '#48bb78';
                } else {
                    matchDiv.textContent = 'Passwords do not match';
                    matchDiv.style.color = '#f56565'
                }
            } else {
                matchDiv.textContent = '';
            }
        }

        if(confirmInput){
            confirmInput.addEventListener('input', checkPasswordMatch);
        }

        registerForm = document.getElementById('registerForm');
        if(registerForm){
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const errorEl = document.getElementById('errorMessage');
                const successEl = document.getElementById('successMessage');
                const submitBtn = document.getElementById('submitBtn');

                errorEl.style.display = 'none';
                successEl.style.display = 'none';

                const password = passwordInput.value;
                const confirm = confirmInput.value;

                if(password !== confirm){
                    errorEl.textContent = 'Passwords do not match';
                    error.style.display = 'block';
                    return;
                }
                if (password < 8){
                    errorEl.textContent = 'Password must be at least 8 characters';
                    errorEl.style.display = 'block';
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Creating Account...';

                const formData = {
                    username: document.getElementById('username').value,
                    email: document.getElementById('email').value,
                    password: password,
                    confirm_password: confirm
                };

                try{
                    const response = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(formData)
                    });

                    const data = await response.json()

                    if (response.ok){
                        successEl.textContent = data.message;
                        successEl.style.display = 'block';

                        e.target.reset()

                        setTimeout(() => {
                            window.location.href = 'login.html';
                        }, 3000);
                    } else {
                        errorEl.textContent = data.error || 'Registration failed';
                        errorEl.style.display = 'block';
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Create Account';
                    }
                } catch (error) {
                    errorEl.textContent = 'Network error. Please try again.';
                    errorEl.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Account';
                }
            });
        }
    }
}