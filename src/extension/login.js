import AuthService from './services/auth.js';

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        await AuthService.login(email, password);
        window.location.href = 'popup.html';
    } catch (error) {
        errorMessage.textContent = error.message;
    }
});

document.getElementById('signupBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        await AuthService.signup(email, password);
        await AuthService.login(email, password);
        window.location.href = 'popup.html';
    } catch (error) {
        errorMessage.textContent = error.message;
    }
}); 