import AuthService from './services/auth.js';

document.addEventListener('DOMContentLoaded', async function() {
    const isAuthenticated = await AuthService.getValidToken();
    if (isAuthenticated) {
        window.location.href = 'popup.html';
        return;
    }
});
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        await AuthService.login(email, password);
        await new Promise((resolve) => {
            chrome.action.setPopup({ popup: 'popup.html' }, resolve);
        });
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
        await new Promise((resolve) => {
            chrome.action.setPopup({ popup: 'popup.html' }, resolve);
        });
        window.location.href = 'popup.html';
    } catch (error) {
        errorMessage.textContent = error.message;
    }
}); 