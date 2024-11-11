// Saves options to chrome.storage
function saveOptions() {
    const modelSelect = document.getElementById('modelSelect').value;
    const coverLetterName = document.getElementById('coverLetterName').value;
    const resumeInput = document.getElementById('defaultResume');
    const status = document.getElementById('status');

    const savePromise = new Promise(async (resolve) => {
        // Handle resume file if selected
        if (resumeInput.files.length > 0) {
            const file = resumeInput.files[0];
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('http://localhost:8000/upload-resume', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Failed to upload resume');
                }

                const data = await response.json();
                
                chrome.storage.sync.set({
                    defaultModel: modelSelect,
                    coverLetterName: coverLetterName,
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
                coverLetterName: coverLetterName
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
        resumePath: ''
    }, (items) => {
        document.getElementById('modelSelect').value = items.defaultModel;
        document.getElementById('coverLetterName').value = items.coverLetterName;
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