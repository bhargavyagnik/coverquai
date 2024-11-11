document.addEventListener('DOMContentLoaded', function() {
    let resumeData = null;
    const statusDiv = document.getElementById('status');
    const previewDiv = document.getElementById('preview');
    
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
  
    doc.save('cover-letter.pdf');
  }