chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeJobDetails') {
      try {
        const jobDetails = scrapeCurrentPage();
        sendResponse({ jobDetails });
      } catch (error) {
        sendResponse({ error: error.message });
      }
    }
    return true; // Required for async response
  });
  
  function scrapeCurrentPage() {
    // This is a basic example - you'll need to customize based on specific job sites
    const title = document.querySelector('h1')?.textContent || 'Job Title';
    const company = document.querySelector('.company-name')?.textContent || 'Company Name';
    const description = document.querySelector('.job-description')?.textContent || '';
    
    return {
      title: title.trim(),
      company: company.trim(),
      description: description.trim(),
      url: window.location.href
    };
  }