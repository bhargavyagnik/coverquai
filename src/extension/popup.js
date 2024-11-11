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
          alert(resumeData);
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
      if (file.type === 'application/pdf') {
        // Handle PDF files
        const reader = new FileReader();
        reader.onload = async function(event) {
          try {
            const typedArray = new Uint8Array(event.target.result);
            const pdf = await pdfjsLib.getDocument(typedArray).promise;
            let fullText = '';
            
            // Extract text from each page
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
              
              fullText += pageText + '\n';
            }
            
            resolve(fullText.trim());
          } catch (error) {
            reject(new Error('Error parsing PDF: ' + error.message));
          }
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsArrayBuffer(file);
        
      } else if (file.type === 'text/plain') {
        // Handle text files
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsText(file);
        
      } else {
        reject(new Error('Unsupported file type. Please upload a PDF or text file.'));
      }
    });
  }
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