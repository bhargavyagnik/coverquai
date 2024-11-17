const API_URL = 'https://cvwriter-git-dev-bhargavyagniks-projects.vercel.app';

export class AuthService {
    static async signup(email, password) {
        const response = await fetch(`${API_URL}/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: email,
                password: password 
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Signup failed');
        }

        return data;
    }

    static async login(email, password) {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: email,
                password: password 
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Login failed');
        }

        await chrome.storage.local.set({ 
            'authToken': data.session.access_token,
            'refreshToken': data.session.refresh_token,
            'user': data.user.id
        });

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
        await chrome.storage.local.remove(['authToken', 'user', 'refreshToken']);
        window.location.href = 'login.html';
        return;
    }
    static async getToken() {
        const data = await chrome.storage.local.get('authToken');
        return data.authToken;
    }

    static async verifyToken() {
        const token = await this.getToken();
        if (!token) return false;
        
        try {
            const response = await fetch(`${API_URL}/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            return response.ok;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }

    static async refreshToken() {
        const data = await chrome.storage.local.get('refreshToken');
        const refreshToken = data.refreshToken;
        
        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await fetch(`${API_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || 'Token refresh failed');
            }

            // Save new tokens
            await chrome.storage.local.set({
                'authToken': data.access_token,
                'refreshToken': data.refresh_token
            });

            return data.access_token;
        } catch (error) {
            console.error('Token refresh failed:', error);
            // If refresh fails, logout the user
            await this.logout();
            throw error;
        }
    }

    // Helper method to get a valid token, refreshing if necessary
    static async getValidToken() {
        const isValid = await this.verifyToken();
        
        if (!isValid) {
            try {
                return await this.refreshToken();
            } catch (error) {
                return false;
            }
        }
        
        return await this.getToken();
    }
}

export default AuthService; 