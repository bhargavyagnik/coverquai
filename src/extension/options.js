import { AuthService } from './services/auth.js';
const DEFAULT_SYSTEM_PROMPT = `Start with 'Dear Hiring Manager,' and end with 'Sincerely,' followed by just name. 
Paragraph 1: Introduction. Who you are, what you do, and what position you're applying for.
Paragraph 2: Summarize your experience.
Paragraph 3: How your experience translates to the job. 
Paragraph 4: Closing and contact information.`;

const API_URL = 'https://cvwriter-bhargavyagniks-projects.vercel.app';

document.addEventListener('DOMContentLoaded', async function() {
    const isAuthenticated = await AuthService.getValidToken();
    if (!isAuthenticated) {
        window.location.href = 'login.html';
    }
});

// Saves options to chrome.storage
function saveOptions() {
    const modelSelect = document.getElementById('modelSelect').value;
    const coverLetterName = document.getElementById('coverLetterName').value;
    const systemPrompt = document.getElementById('systemPrompt').value;
    const resumeInput = document.getElementById('defaultResume');
    const status = document.getElementById('status');

    const savePromise = new Promise(async (resolve) => {
        // Handle resume file if selected
        if (resumeInput.files.length > 0) {
            const file = resumeInput.files[0];
            try {
                const formData = new FormData();
                formData.append('file', file);
                const token = await AuthService.getValidToken();
                const response = await fetch(`${API_URL}/upload-resume`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        throw new Error('Please logout and try logging in again');
                    }
                    else if (response.status === 400) {
                        throw new Error('Unsupported file type');
                    }
                    throw new Error('Failed to upload resume');
                }

                const data = await response.json();
                
                chrome.storage.sync.set({
                    defaultModel: modelSelect,
                    coverLetterName: coverLetterName,
                    systemPrompt: systemPrompt,
                    resumePath: file.name,
                    resumeText: data.resume_text
                }, resolve);
            } catch (error) {
                status.textContent = 'Error uploading resume: ' + error.message;
                setTimeout(() => {
                    status.textContent = '';
                }, 3000);
                return;
            }
        } else {
            // Save without updating resume
            chrome.storage.sync.set({
                defaultModel: modelSelect,
                coverLetterName: coverLetterName,
                systemPrompt: systemPrompt
            }, resolve);
        }
    });

    savePromise.then(() => {
        // Update status to let user know options were saved.
        status.textContent = 'Options saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 3000);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restoreOptions() {
    chrome.storage.sync.get({
        defaultModel: 'llama-3.1-8b-instruct',
        coverLetterName: 'cover-letter-{company}',
        resumePath: '',
        systemPrompt: DEFAULT_SYSTEM_PROMPT
    }, (items) => {
        document.getElementById('modelSelect').value = items.defaultModel;
        document.getElementById('coverLetterName').value = items.coverLetterName;
        document.getElementById('systemPrompt').value = items.systemPrompt;
        document.getElementById('currentResumePath').textContent = 
            items.resumePath ? `Current resume: ${items.resumePath}` : 'No resume selected';
    });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// Add real-time validation and preview for cover letter name
document.getElementById('coverLetterName').addEventListener('input', function(e) {
    const preview = e.target.value.replace('{company}', 'Example Corp');
    const helpText = e.target.nextElementSibling;
    helpText.textContent = `Preview: ${preview}.pdf`;
});

// Add reset prompt handler
document.getElementById('resetPrompt').addEventListener('click', function() {
    document.getElementById('systemPrompt').value = DEFAULT_SYSTEM_PROMPT;
    saveOptions();
});

document.getElementById('home').addEventListener('click', () => {
    window.location.href = 'popup.html';
}); 