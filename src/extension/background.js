chrome.runtime.onInstalled.addListener(() => {
    console.log('Cover Letter Generator Extension installed');
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
      // Use the FastAPI backend
      const response = await fetch('http://localhost:8000/generate-cover-letter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          job_details: data.jobDetails,
          resume_text: data.resumeData
        })
      });
  
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
  
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
  
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          port.postMessage({ type: 'done' });
          break;
        }
  
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              throw new Error(data.error);
            }
            if (data.content) {
              port.postMessage({ 
                type: 'stream',
                content: data.content
              });
            }
          } catch (e) {
            console.warn('Failed to parse line:', line, e);
          }
        }
      }
    } catch (error) {
      throw new Error('Failed to generate cover letter: ' + error.message);
    }
  }