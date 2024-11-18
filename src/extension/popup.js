import AuthService from './services/auth.js';
const API_URL = 'https://cvwriter-bhargavyagniks-projects.vercel.app';

document.addEventListener('DOMContentLoaded', async function() {
    // Add a small delay to ensure storage is updated
    // await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check authentication
    const isAuthenticated = await AuthService.getValidToken();
    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }

    // Add logout button
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'logout-btn';
    logoutBtn.textContent = 'Logout';
    logoutBtn.onclick = async () => {
        await AuthService.logout();
        window.location.href = 'login.html';
    };
    document.querySelector('.container').appendChild(logoutBtn);

    let resumeData = null;
    const statusDiv = document.getElementById('status');
    const previewDiv = document.getElementById('preview');
    const resumeUploadInput = document.getElementById('resumeUpload');
    const resumeStatus = document.getElementById('resumeStatus');
    
    // Check for default resume in storage
    try {
        const storage = await chrome.storage.sync.get(['resumeText', 'resumePath']);
        if (storage.resumeText) {
            resumeData = storage.resumeText;
            
            // Show current resume status and clear button
            const statusContainer = document.createElement('div');
            statusContainer.style.display = 'flex';
            statusContainer.style.alignItems = 'center';
            statusContainer.style.gap = '10px';
            
            const statusText = document.createElement('span');
            statusText.textContent = `Current: ${storage.resumePath}`;
            
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear';
            clearButton.style.padding = '2px 8px';
            clearButton.onclick = async () => {
                await chrome.storage.sync.remove(['resumeText', 'resumePath']);
                resumeData = null;
                statusContainer.remove();
                resumeUploadInput.value = '';
            };
            
            statusContainer.appendChild(statusText);
            statusContainer.appendChild(clearButton);
            resumeStatus.appendChild(statusContainer);
        }
    } catch (error) {
        console.error('Error loading default resume:', error);
    }
    
    // Handle resume upload
    resumeUploadInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
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
                resumeData = data.resume_text;
                chrome.storage.local.set({ 'resume': resumeData });
                
                // Clear previous status
                resumeStatus.innerHTML = '';
                
                // Create status container
                const statusContainer = document.createElement('div');
                statusContainer.style.display = 'flex';
                statusContainer.style.alignItems = 'center';
                statusContainer.style.gap = '10px';
                
                const statusText = document.createElement('span');
                statusText.textContent = 'Resume uploaded!';
                
                const setDefaultBtn = document.createElement('button');
                setDefaultBtn.textContent = 'Set as Default';
                setDefaultBtn.style.padding = '2px 8px';
                setDefaultBtn.onclick = async () => {
                    await chrome.storage.sync.set({
                        resumeText: resumeData,
                        resumePath: file.name
                    });
                    statusText.textContent = `Default: ${file.name}`;
                    setDefaultBtn.remove();
                };
                
                statusContainer.appendChild(statusText);
                statusContainer.appendChild(setDefaultBtn);
                resumeStatus.appendChild(statusContainer);
            } catch (error) {
                resumeStatus.textContent = 'Error: ' + error.message;
            }
        }
    });

    // Add this near the top of your DOMContentLoaded event listener
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `
        <div class="overlay-content">
            <div class="spinner"></div>
            <div class="overlay-text">Generating cover letter...</div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Handle generate button click
    document.getElementById('generateBtn').addEventListener('click', async () => {
        if (!resumeData) {
            statusDiv.textContent = 'Please upload a resume or set a default resume first';
            return;
        }
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            const response = await chrome.tabs.sendMessage(tab.id, {action: 'scrapeJobDetails'});
            
            if (response?.jobDetails) {
                document.getElementById('jobTitle').value = response.jobDetails.title;
                document.getElementById('companyName').value = response.jobDetails.company;
                document.getElementById('jobDescription').value = response.jobDetails.description;
            }
        } catch (error) {
            console.log('Could not scrape job details:', error);
            statusDiv.textContent = 'Please fill in all job details';
            return;
        }
        
        const jobTitle = document.getElementById('jobTitle').value.trim();
        const companyName = document.getElementById('companyName').value.trim();
        const jobDescription = document.getElementById('jobDescription').value.trim();

            // Try to scrape job details from current tab first
        

        // Show overlay
        overlay.style.display = 'flex';
        
        try {
            const jobDetails = {
                title: jobTitle,
                company: companyName,
                description: jobDescription
            };

            const coverLetter = await generateCoverLetter(jobDetails, resumeData);
            previewDiv.textContent = coverLetter;

            const overlayText = overlay.querySelector('.overlay-text');
            overlayText.textContent = 'Cover letter generated successfully!';
            overlay.style.display = 'none';
            
            try {
                const token = await AuthService.getValidToken();
                const response = await fetch(`${API_URL}/countgenerations`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    document.getElementById('generationCount').textContent = data.count;
                } else {
                    document.getElementById('generationCount').textContent = '?';
                }
            } catch (error) {
                console.error('Error fetching generation count:', error);
                document.getElementById('generationCount').textContent = '?';
            }
            
        } catch (error) {
            // Update overlay text to show error
            const overlayText = overlay.querySelector('.overlay-text');
            overlayText.textContent = 'Error: ' + error.message;
            
            // Hide overlay after a short delay
            setTimeout(() => {
                overlay.style.display = 'none';
                statusDiv.textContent = 'Error generating cover letter: ' + error.message;
            }, 2000);
        }
    });

    // Add auto-save functionality for form fields
    ['jobTitle', 'companyName', 'jobDescription'].forEach(fieldId => {
        const element = document.getElementById(fieldId);
        
        // Load saved value
        chrome.storage.local.get(fieldId, (result) => {
            if (result[fieldId]) {
                element.value = result[fieldId];
            }
        });

        // Save on change
        element.addEventListener('input', (e) => {
            chrome.storage.local.set({ [fieldId]: e.target.value });
        });
    });

    // Optional: Add a clear form button
    const clearFormBtn = document.createElement('button');
    clearFormBtn.textContent = 'Clear Job Details';
    clearFormBtn.onclick = () => {
        document.getElementById('jobTitle').value = '';
        document.getElementById('companyName').value = '';
        document.getElementById('jobDescription').value = '';
        chrome.storage.local.remove(['jobTitle', 'companyName', 'jobDescription']);
    };
    document.getElementById('additionalDetails').appendChild(clearFormBtn);

    // Handle download button click
    document.getElementById('downloadBtn').addEventListener('click', () => {
        const coverLetter = previewDiv.textContent;
        if (coverLetter) {
            downloadCoverLetter(coverLetter);
        } else {
            statusDiv.textContent = 'No cover letter to download';
        }
    });

    

    // Set up toggle functionality
    document.getElementById('additionalDetailsBtn').addEventListener('click', function() {
        const dropdownContent = document.getElementById('additionalDetails');
        dropdownContent.classList.toggle('active');
        
        // Update button text
        this.textContent = dropdownContent.classList.contains('active') 
            ? '- Additional Details' 
            : '+ Additional Details';
    });

    // Add this at document load to ensure preview is hidden initially
    previewDiv.style.display = 'none';

    // Add this near the top of your DOMContentLoaded function
    try {
        const token = await AuthService.getValidToken();
        const response = await fetch(`${API_URL}/countgenerations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('generationCount').textContent = data.count;
        } else {
            document.getElementById('generationCount').textContent = '?';
        }
    } catch (error) {
        console.error('Error fetching generation count:', error);
        document.getElementById('generationCount').textContent = '?';
    }
  });
  
  async function generateCoverLetter(jobDetails, resumeData) {
    const previewDiv = document.getElementById('preview');
    previewDiv.textContent = ''; // Clear existing content
    previewDiv.style.display = 'none'; // Hide preview initially
    
    // Style the preview div for better text formatting
    previewDiv.style.whiteSpace = 'pre-wrap';
    previewDiv.style.wordWrap = 'break-word';
    previewDiv.style.fontFamily = 'Arial, sans-serif';
    previewDiv.style.lineHeight = '1.5';
    previewDiv.style.padding = '10px';
  
    return new Promise((resolve, reject) => {
        const port = chrome.runtime.connect({ name: 'coverLetterStream' });
        let fullText = '';
        
        port.onMessage.addListener((message) => {
            if (message.type === 'stream') {
                fullText += message.content;
                
                // Show preview div when content starts coming in
                previewDiv.style.display = 'block';
                
                // Format and display the text
                const formattedText = formatCoverLetter(fullText);
                previewDiv.innerHTML = formattedText;
            } else if (message.type === 'done') {
                resolve(fullText);
            } else if (message.type === 'error') {
                reject(new Error(message.error));
            }
        });
        
        port.postMessage({
            action: 'generateCoverLetter',
            data: { jobDetails, resumeData }
        });
    });
  }

  function formatCoverLetter(text) {
    return text
        // Ensure consistent paragraph breaks
        .replace(/([.!?])\s+([A-Z])/g, '$1</p><p>$2')
        // Handle the signature line
        .replace(/(Sincerely,.*?[A-Za-z]+)/, '</p><p>$1</p>')
        // Replace remaining newlines with line breaks
        .replace(/\n/g, '<br>')
        // Wrap in paragraphs if not already wrapped
        .replace(/^(.+)$/, '<p>$1</p>')
        // Clean up any empty paragraphs
        .replace(/<p>\s*<\/p>/g, '')
        // Ensure consistent spacing around paragraphs
        .replace(/<\/p><p>/g, '</p>\n\n<p>')
        // Clean up any duplicate breaks
        .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '<br>');
  }


  async function downloadCoverLetter(content) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'pt',
        format: 'letter'
    });

    doc.setFont('times', 'normal');
    doc.setFontSize(12);

    const pageWidth = doc.internal.pageSize.width;
    const margin = 40;
    const maxWidth = pageWidth - (margin * 2);
    let yPosition = 60;

    // Split content into paragraphs
    const paragraphs = content.split(/\n{2,}/g);

    paragraphs.forEach(paragraph => {
        // Add justified text with maximum width
        const textHeight = doc.getTextDimensions(paragraph, {
            maxWidth: maxWidth,
            align: 'justify'
        }).h;

        // Check if we need a new page
        if (yPosition + textHeight > doc.internal.pageSize.height - margin) {
            doc.addPage();
            yPosition = margin + 20;
        }

        doc.text(paragraph.trim(), margin, yPosition, {
            maxWidth: maxWidth,
            align: 'justify'
        });

        yPosition += textHeight + 20; // Add some spacing between paragraphs
    });

    // Get company name from form
    const companyName = document.getElementById('companyName').value.trim();
    
    // Get the cover letter name format from storage
    const storage = await chrome.storage.sync.get({
        coverLetterName: 'cover-letter-{company}' // default value if not set
    });
    
    // Replace {company} placeholder with actual company name
    let fileName = storage.coverLetterName.replace('{company}', companyName);
    
    // Add .pdf extension if not present
    if (!fileName.toLowerCase().endsWith('.pdf')) {
        fileName += '.pdf';
    }

    doc.save(fileName);
  }