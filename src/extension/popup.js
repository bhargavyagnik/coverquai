document.addEventListener('DOMContentLoaded', async function() {
    let resumeData = null;
    const statusDiv = document.getElementById('status');
    const previewDiv = document.getElementById('preview');
    
    // Check for default resume in storage
    try {
        const storage = await chrome.storage.sync.get(['resumeText', 'resumePath']);
        if (storage.resumeText) {
            resumeData = storage.resumeText;
            statusDiv.textContent = `Using default resume: ${storage.resumePath}`;
            
            // Optionally show a "Clear Default" button
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear Default Resume';
            clearButton.style.marginLeft = '10px';
            clearButton.onclick = async () => {
                await chrome.storage.sync.remove(['resumeText', 'resumePath']);
                resumeData = null;
                statusDiv.textContent = 'Default resume cleared';
                clearButton.remove();
            };
            statusDiv.appendChild(clearButton);
        }
    } catch (error) {
        console.error('Error loading default resume:', error);
    }
    
    // Handle resume upload
    document.getElementById('resumeUpload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
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
                resumeData = data.resume_text;
                // Store in local storage for temporary use
                chrome.storage.local.set({ 'resume': resumeData });
                statusDiv.textContent = 'Resume uploaded successfully!';
                
                // Ask user if they want to set this as default
                const setDefaultBtn = document.createElement('button');
                setDefaultBtn.textContent = 'Set as Default';
                setDefaultBtn.style.marginLeft = '10px';
                setDefaultBtn.onclick = async () => {
                    await chrome.storage.sync.set({
                        resumeText: resumeData,
                        resumePath: file.name
                    });
                    statusDiv.textContent = `Set as default resume: ${file.name}`;
                    setDefaultBtn.remove();
                };
                statusDiv.appendChild(setDefaultBtn);
            } catch (error) {
                statusDiv.textContent = 'Error uploading resume: ' + error.message;
            }
        }
    });

    // Handle generate button click
    document.getElementById('generateBtn').addEventListener('click', async () => {
        if (!resumeData) {
            statusDiv.textContent = 'Please upload a resume or set a default resume first';
            return;
        }

        const jobTitle = document.getElementById('jobTitle').value.trim();
        const companyName = document.getElementById('companyName').value.trim();
        const jobDescription = document.getElementById('jobDescription').value.trim();

        // if (!jobTitle || !companyName || !jobDescription) {
        //     statusDiv.textContent = 'Please fill in all job details';
        //     return;
        // }

        statusDiv.textContent = 'Generating cover letter...';
        
        try {
            const jobDetails = {
                title: jobTitle,
                company: companyName,
                description: jobDescription
            };

            const coverLetter = await generateCoverLetter(jobDetails, resumeData);
            previewDiv.textContent = coverLetter;
            statusDiv.textContent = 'Cover letter generated successfully!';
        } catch (error) {
            statusDiv.textContent = 'Error generating cover letter: ' + error.message;
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
    clearFormBtn.textContent = 'Clear Form';
    clearFormBtn.onclick = () => {
        document.getElementById('jobTitle').value = '';
        document.getElementById('companyName').value = '';
        document.getElementById('jobDescription').value = '';
        chrome.storage.local.remove(['jobTitle', 'companyName', 'jobDescription']);
    };
    document.querySelector('.container').insertBefore(clearFormBtn, document.getElementById('status'));

    // Handle download button click
    document.getElementById('downloadBtn').addEventListener('click', () => {
        const coverLetter = previewDiv.textContent;
        if (coverLetter) {
            downloadCoverLetter(coverLetter);
        } else {
            statusDiv.textContent = 'No cover letter to download';
        }
    });
  });
  
  async function generateCoverLetter(jobDetails, resumeData) {
    const previewDiv = document.getElementById('preview');
    previewDiv.textContent = ''; // Clear existing content
    
    // Style the preview div for better text formatting
    previewDiv.style.whiteSpace = 'pre-wrap'; // Preserves whitespace and line breaks
    previewDiv.style.wordWrap = 'break-word'; // Ensures long lines wrap
    previewDiv.style.fontFamily = 'Arial, sans-serif';
    previewDiv.style.lineHeight = '1.5';
    previewDiv.style.padding = '10px';
  
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'coverLetterStream' });
      let fullText = '';
      
      port.onMessage.addListener((message) => {
        if (message.type === 'stream') {
          // Accumulate the full text
          fullText += message.content;
          
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
      // Replace multiple newlines with proper paragraph breaks
      .replace(/\n{2,}/g, '</p><p>')
      // Replace single newlines with line breaks
      .replace(/\n/g, '<br>')
      // Wrap in paragraphs if not already wrapped
      .replace(/^(.+)$/, '<p>$1</p>')
      // Clean up any empty paragraphs
      .replace(/<p>\s*<\/p>/g, '')
      // Ensure consistent spacing around paragraphs
      .replace(/<\/p><p>/g, '</p>\n\n<p>');
  }


  function downloadCoverLetter(content) {
    // Create new jsPDF instance using the window.jspdf namespace
    const { jsPDF } = window.jspdf;
    
    const doc = new jsPDF({
      unit: 'pt',
      format: 'letter'
    });
  
    // Rest of your download function remains the same
    doc.setFont('helvetica');
    doc.setFontSize(12);
  
    const splitText = doc.splitTextToSize(
      content.replace(/\n{2,}/g, '\n\n').trim(),
      doc.internal.pageSize.width - 80
    );
  
    let yPosition = 60;
    const lineHeight = 14;
    const margin = 40;
  
    splitText.forEach(line => {
      if (yPosition > doc.internal.pageSize.height - margin) {
        doc.addPage();
        yPosition = margin + 20;
      }
      doc.text(margin, yPosition, line);
      yPosition += lineHeight;
    });
    const pathtosave = 'cover_letter.pdf'
    // Check storage for default cover letter name
    chrome.storage.sync.get(['coverLetterName'], function(result) {
        if (result.coverLetterName) {
            pathtosave = result.coverLetterName + '.pdf';
        }
    });
    doc.save(pathtosave);
  }