const API_URL = 'https://cvwriter-bhargavyagniks-projects.vercel.app';

class AuthService {
    static async login(email, password) {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        await chrome.storage.local.set({ 
            'authToken': data.access_token,
            'user': data.user
        });
        return data;
    }

    static async signup(email, password) {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            throw new Error('Signup failed');
        }

        const data = await response.json();
        return data;
    }

    static async logout() {
        const token = await this.getToken();
        if (token) {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }
        await chrome.storage.local.remove(['authToken', 'user']);
    }

    static async getToken() {
        const data = await chrome.storage.local.get('authToken');
        return data.authToken;
    }

    static async isAuthenticated() {
        const token = await this.getToken();
        return !!token;
    }
}

export default AuthService; 