document.addEventListener('DOMContentLoaded', function() {
    let resumeData = null;
    const statusDiv = document.getElementById('status');
    const previewDiv = document.getElementById('preview');
    
    // Handle resume upload
    document.getElementById('resumeUpload').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          resumeData = await readFileContent(file);
          chrome.storage.local.set({ 'resume': resumeData });
          statusDiv.textContent = 'Resume uploaded successfully!';
        } catch (error) {
          statusDiv.textContent = 'Error uploading resume: ' + error.message;
        }
      }
    });
  
    // Handle generate button click
    document.getElementById('generateBtn').addEventListener('click', async () => {
      statusDiv.textContent = 'Generating cover letter...';
      
      try {
        // Get the current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Request job details from content script
        chrome.tabs.sendMessage(tab.id, { action: 'scrapeJobDetails' }, async (response) => {
          if (response.error) {
            throw new Error(response.error);
          }
          
          const coverLetter = await generateCoverLetter(response.jobDetails, resumeData);
          previewDiv.textContent = coverLetter;
          statusDiv.textContent = 'Cover letter generated successfully!';
        });
      } catch (error) {
        statusDiv.textContent = 'Error generating cover letter: ' + error.message;
      }
    });
  
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
  
  // Helper functions
  async function readFileContent(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Error reading file'));
      reader.readAsText(file);
    });
  }
  
  async function generateCoverLetter(jobDetails, resumeData) {
    // This is where you'll integrate with your LLM API
    // For now, returning a placeholder
    return `Dear Hiring Manager,\n\nI am writing to express my interest in the ${jobDetails.title} position at ${jobDetails.company}...\n\nBest regards,\nYour Name`;
  }
  
  function downloadCoverLetter(content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-letter.txt';
    a.click();
    URL.revokeObjectURL(url);
  }