import { AuthService } from './services/auth.js';

const DEFAULT_SYSTEM_PROMPT = `Start with 'Dear Hiring Manager,' and end with 'Sincerely,' followed by just name. 
Paragraph 1: Introduction. Who you are, what you do, and what position you're applying for.
Paragraph 2: Summarize your experience.
Paragraph 3: How your experience translates to the job. 
Paragraph 4: Closing and contact information.`;

const API_URL = 'https://cvwriter-bhargavyagniks-projects.vercel.app';

chrome.runtime.onInstalled.addListener(() => {
    console.log('Coverquai Extension installed');
  });
  
  // Handle any background tasks, API calls, etc.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'generateCoverLetter') {
      // Handle LLM API calls here
      // This keeps API keys secure and handles heavy processing
      handleLLMRequest(request.data)
        .then(response => sendResponse({ success: true, data: response }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Required for async response
    }
    if (request.action === 'googleLogin') {
        handleGoogleLogin()
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Required to use sendResponse asynchronously
    }
  });
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'coverLetterStream') {
      port.onMessage.addListener(async (msg) => {
        if (msg.action === 'generateCoverLetter') {
          try {
            await handleLLMRequest(msg.data, port);
          } catch (error) {
            port.postMessage({ type: 'error', error: error.message });
          }
        }
      });
    }
  });

  async function handleLLMRequest(data, port) {
    try {
        const token = await AuthService.getValidToken();
        const settings = await chrome.storage.sync.get({
            defaultModel: 'llama-3.1-8b-instruct',
            resumeText: data.resumeData,
            systemPrompt: DEFAULT_SYSTEM_PROMPT
        });
        
        const response = await fetch(`${API_URL}/generate-cover-letter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                job_details: data.jobDetails,
                resume_text: settings.resumeText,
                model: settings.defaultModel,
                system_prompt: settings.systemPrompt
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Please logout and try logging in again');
            }
            throw new Error(`API request failed: ${response.statusText}`);
        }

        const reader = response.body
            .pipeThrough(new TextDecoderStream())
            .getReader();

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                port.postMessage({ type: 'done' });
                break;
            }

            buffer += value;
            console.log('Buffer content:', buffer);
            const messages = buffer.split('\n\n');
            console.log('Messages:', messages);
            buffer = messages.pop() || '';

            for (const message of messages) {
                if (!message.trim() || !message.startsWith('data: ')) continue;
                
                try {
                    const jsonStr = message.replace('data: ', '');
                    const parsedData = JSON.parse(jsonStr);
                    
                    if (parsedData.error) {
                        throw new Error(parsedData.error);
                    }
                    
                    if (parsedData.content) {
                        port.postMessage({
                            type: 'stream',
                            content: parsedData.content
                        });
                    }
                } catch (e) {
                    console.warn('Failed to parse message:', message, e);
                }
            }
        }
    } catch (error) {
        port.postMessage({
            type: 'error',
            error: 'Failed to generate cover letter: ' + error.message
        });
    } finally {
        port.postMessage({ type: 'done' });
    }
}

async function handleGoogleLogin() {
    const authParams = new URLSearchParams({
        client_id: '331738423824-jqcka65qqq8bp0c6dmi4q662s4f027v5.apps.googleusercontent.com',
        response_type: 'id_token',
        access_type: 'offline',
        redirect_uri: chrome.identity.getRedirectURL(),
        scope: 'openid email profile',
        prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/auth?${authParams.toString()}`;

    try {
        const responseUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });

        const hashFragment = responseUrl.split('#')[1];
        if (!hashFragment) {
            throw new Error('No token received from Google');
        }

        const urlParams = new URLSearchParams(hashFragment);
        const googleToken = urlParams.get('id_token');
        if (!googleToken) {
            throw new Error('No ID token found in response');
        }

        const response = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ credential: googleToken })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || 'Google login failed');
        }
        // Store auth data
        await chrome.storage.local.set({ 
            'authToken': data.session.access_token,
            'refreshToken': data.session.refresh_token,
            'user': data.user.id
        });
        
        // Reopen the extension popup
        const extensionId = chrome.runtime.id;
        await chrome.action.openPopup();
        
        // Return the data to the original request
        return data;
    } catch (error) {
        console.error('Google login error:', error);
        throw error;
    }
}

// Helper function to get the popup URL
function getPopupUrl() {
    return chrome.runtime.getURL('popup.html');
}