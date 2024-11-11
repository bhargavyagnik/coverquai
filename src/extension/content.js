chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeJobDetails') {
      console.log("get job details");
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
    // const title = document.querySelector('h1')?.textContent || 'Job Title';
    const company = document.querySelector('')?.textContent || 'Company Name';
    const description = document.querySelector('#job-details > div > p')?.textContent || '';
    
    return {
      title: "Job",//title.trim(),
      company: "Company",//company.trim(),
      description: "Description",//description.trim(),
      url: window.location.href
    };
  }