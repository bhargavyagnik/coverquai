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
    if (window.location.href.includes('linkedin.com')) {
      const description = document.querySelector('#job-details > div > p')?.textContent || '';
      return {
        title: "-",//title.trim(),
        company: "-",//company.trim(),
        description: description,//description.trim(),
      };
    }

    return {
      title: "Job",//title.trim(),
      company: "Company",//company.trim(),
      description: "Description",//description.trim(),
    };
  }