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
  
  async function handleLLMRequest(data) {
    // Implement your LLM API integration here
    // Example structure:
    try {
      // const response = await fetch('YOUR_LLM_API_ENDPOINT', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': 'Bearer YOUR_API_KEY'
      //   },
      //   body: JSON.stringify(data)
      // });
      // return await response.json();
      return "Sample cover letter content";
    } catch (error) {
      throw new Error('Failed to generate cover letter');
    }
  }