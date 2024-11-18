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
      console.log("linkedin.com");
      const description = document.querySelector('#job-details > div > p')?.textContent || '';
      console.log(description);
      return {
        title: "-",//title.trim(),
        company: "-",//company.trim(),
        description: description,//description.trim(),
      };
    }
    if (window.location.href.includes('eightfold.ai')) {
      console.log("eightfold.ai");
      const title = document.querySelector('#pcs-body-container > div:nth-child(2) > div.search-results-main-container > div > div.inline-block.mobile-hide.position-top-container > div > div > div:nth-child(2) > div > h1')?.textContent || '';
      const description = document.querySelector('#pcs-body-container > div:nth-child(2) > div.search-results-main-container > div > div.inline-block.mobile-hide.position-top-container > div > div > div.position-details > div.row > div > div > div:nth-child(2) > div > div').textContent || '';
      console.log(title, description, company);
      return {
        title: title.trim(),
        company: window.location.hostname.split('.')[0],
        description: description.trim(),
      };
    }
    if (window.location.href.includes('glassdoor.com') || window.location.href.includes('glassdoor.ca')) {
      console.log("glassdoor.com");
      const company = document.evaluate('/html/body/div[3]/div[2]/div[4]/div/div[2]/div/div[1]/header/div[1]/a/div[2]/div[1]/h4',document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent || '';
      const title = document.evaluate('/html/body/div[3]/div[2]/div[4]/div/div[2]/div/div[1]/header/div[1]/h1',document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent || '';
      const description = document.evaluate('/html/body/div[3]/div[2]/div[4]/div/div[2]/div/div[1]/section/div[2]/div[1]',document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue?.textContent || '';
      console.log(title, description, company);
      return {
        title: title.trim(),
        company: company.trim(),
        description: description.trim(),
      };
    }
    if (window.location.href.includes('myworkdayjobs.com')) {
      const title = document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent || '';
      const description = document.querySelector('[data-automation-id="jobPostingDescription"]')?.textContent || '';
      const company = window.location.hostname.split('.')[0] || ''; // Gets 'fil' from fil.wd3.myworkdayjobs.com
      console.log("Workday scraping:", { title, description, company });
      return {
        title: title.trim(),
        company: company.trim(),
        description: description.trim(),
      };
    }
    return {
      title: "Job",//title.trim(),
      company: "Company",//company.trim(),
      description: "Description",//description.trim(),
    };
  }