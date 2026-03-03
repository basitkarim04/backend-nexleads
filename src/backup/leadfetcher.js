const axios = require('axios');
const { Builder, By, until, Key } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { fetchGPTLeads } = require('../controllers/gptContoroller');

class FacebookLeadFetcher {
  constructor() {
    this.driver = null;
    this.isLoggedIn = false;
  }

  /**
   * Initialize Chrome driver with stealth settings
   */
  async initialize() {
    try {
      const options = new chrome.Options();

      // Stealth settings to avoid detection
      options.addArguments('--disable-blink-features=AutomationControlled');
      options.addArguments('--disable-dev-shm-usage');
      options.addArguments('--no-sandbox');
      options.addArguments('--disable-gpu');
      options.addArguments('--window-size=1920,1080');
      options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

      // Optional: Run in headless mode (comment out to see browser)
      // options.addArguments('--headless=new');

      this.driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      console.log('Chrome driver initialized successfully');
      return true;
    } catch (error) {
      console.error('Error initializing driver:', error);
      throw error;
    }
  }

  /**
   * Login to Facebook
   */
  async login(email, password) {
    try {
      console.log('Navigating to Facebook login page...');
      await this.driver.get('https://www.facebook.com/');

      // Wait for page to load
      await this.driver.sleep(2000);

      // Find and fill email
      const emailField = await this.driver.wait(
        until.elementLocated(By.id('email')),
        10000
      );
      await emailField.clear();
      await emailField.sendKeys(email);

      // Find and fill password
      const passwordField = await this.driver.findElement(By.id('pass'));
      await passwordField.clear();
      await passwordField.sendKeys(password);

      // Click login button
      const loginButton = await this.driver.findElement(
        By.name('login')
      );
      await loginButton.click();

      console.log('Login credentials submitted, waiting for redirect...');

      // Wait for successful login (check for homepage elements)
      await this.driver.sleep(5000);

      // Check if login was successful by looking for home page elements
      try {
        await this.driver.wait(
          until.elementLocated(By.css('[aria-label="Home"]')),
          15000
        );
        console.log('Login successful!');
        this.isLoggedIn = true;
        return true;
      } catch (error) {
        console.log('Checking for 2FA or security check...');
        // Handle 2FA if present
        const currentUrl = await this.driver.getCurrentUrl();
        if (currentUrl.includes('checkpoint') || currentUrl.includes('two_factor')) {
          console.log('⚠️  Two-factor authentication required. Please complete it manually in the browser.');
          console.log('Waiting 60 seconds for manual 2FA completion...');
          await this.driver.sleep(60000);

          // Check again after 2FA wait
          try {
            await this.driver.wait(
              until.elementLocated(By.css('[aria-label="Home"]')),
              5000
            );
            console.log('Login successful after 2FA!');
            this.isLoggedIn = true;
            return true;
          } catch (err) {
            throw new Error('Login failed even after 2FA wait');
          }
        }
        throw new Error('Login failed - could not find home page elements');
      }
    } catch (error) {
      console.error('Error during login:', error);
      throw error;
    }
  }

  /**
   * Search for leads on Facebook
   */
  async searchLeads(keyword, options = {}) {
    try {
      if (!this.isLoggedIn) {
        throw new Error('Not logged in. Please login first.');
      }

      const {
        searchType = 'people', // 'people', 'pages', 'groups', 'posts'
        location = '',
        limit = 10
      } = options;

      console.log(`Searching for: ${keyword} (Type: ${searchType})`);

      // Navigate to Facebook search
      const searchUrl = `https://www.facebook.com/search/top/?q=${encodeURIComponent(keyword)}`;
      await this.driver.get(searchUrl);
      await this.driver.sleep(3000);

      // Click on specific search filter (People, Pages, etc.)
      try {
        let filterSelector;
        switch (searchType) {
          case 'people':
            filterSelector = '//span[text()="People"]';
            break;
          case 'pages':
            filterSelector = '//span[text()="Pages"]';
            break;
          case 'groups':
            filterSelector = '//span[text()="Groups"]';
            break;
          case 'posts':
            filterSelector = '//span[text()="Posts"]';
            break;
          default:
            filterSelector = '//span[text()="People"]';
        }

        const filterButton = await this.driver.wait(
          until.elementLocated(By.xpath(filterSelector)),
          10000
        );
        await filterButton.click();
        await this.driver.sleep(3000);
      } catch (error) {
        console.log('Could not click filter, continuing with top results...');
      }

      // Scroll to load more results
      console.log('Scrolling to load results...');
      await this.scrollPage(3);

      // Extract lead data based on search type
      let leads = [];
      if (searchType === 'people') {
        leads = await this.extractPeopleLeads(keyword, limit);
      } else if (searchType === 'pages') {
        leads = await this.extractPageLeads(keyword, limit);
      } else if (searchType === 'groups') {
        leads = await this.extractGroupLeads(keyword, limit);
      }

      console.log(`Found ${leads.length} leads`);
      return leads;

    } catch (error) {
      console.error('Error searching leads:', error);
      throw error;
    }
  }

  /**
   * Extract people leads from search results
   */
  async extractPeopleLeads(keyword, limit) {
    const leads = [];

    try {
      // Find all people result cards
      const resultCards = await this.driver.findElements(
        By.css('div[role="article"]')
      );

      console.log(`Found ${resultCards.length} result cards`);

      for (let i = 0; i < Math.min(resultCards.length, limit); i++) {
        try {
          const card = resultCards[i];

          // Extract name
          let name = 'N/A';
          try {
            const nameElement = await card.findElement(
              By.css('a[role="link"] span')
            );
            name = await nameElement.getText();
          } catch (err) {
            console.log('Could not extract name from card');
          }

          // Extract profile URL
          let profileUrl = '';
          try {
            const linkElement = await card.findElement(
              By.css('a[role="link"]')
            );
            profileUrl = await linkElement.getAttribute('href');
            // Clean URL
            profileUrl = profileUrl.split('?')[0];
          } catch (err) {
            console.log('Could not extract profile URL');
          }

          // Extract additional info (headline, mutual friends, etc.)
          let headline = '';
          let mutualFriends = '';
          try {
            const infoElements = await card.findElements(By.css('span'));
            for (let elem of infoElements) {
              const text = await elem.getText();
              if (text && text.length > 0 && text.length < 200) {
                if (!headline && text !== name) {
                  headline = text;
                } else if (text.includes('mutual friend')) {
                  mutualFriends = text;
                }
              }
            }
          } catch (err) {
            console.log('Could not extract additional info');
          }

          if (name !== 'N/A' && profileUrl) {
            leads.push({
              name,
              platform: 'Facebook',
              jobField: keyword,
              jobTitle: headline || 'N/A',
              company: 'N/A',
              location: 'N/A',
              profileUrl,
              mutualFriends,
              email: '', // Facebook doesn't show emails in search
              additionalInfo: headline
            });

            console.log(`Extracted lead ${i + 1}: ${name}`);
          }

        } catch (error) {
          console.log(`Error extracting data from card ${i}:`, error.message);
          continue;
        }
      }

    } catch (error) {
      console.error('Error extracting people leads:', error);
    }

    return leads;
  }

  /**
   * Extract page leads from search results
   */
  async extractPageLeads(keyword, limit) {
    const leads = [];

    try {
      const resultCards = await this.driver.findElements(
        By.css('div[role="article"]')
      );

      for (let i = 0; i < Math.min(resultCards.length, limit); i++) {
        try {
          const card = resultCards[i];

          let name = 'N/A';
          let profileUrl = '';
          let category = '';
          let followers = '';

          try {
            const nameElement = await card.findElement(By.css('a span'));
            name = await nameElement.getText();

            const linkElement = await card.findElement(By.css('a'));
            profileUrl = await linkElement.getAttribute('href');
            profileUrl = profileUrl.split('?')[0];

            const infoElements = await card.findElements(By.css('span'));
            for (let elem of infoElements) {
              const text = await elem.getText();
              if (text.includes('followers') || text.includes('likes')) {
                followers = text;
              } else if (!category && text !== name && text.length < 100) {
                category = text;
              }
            }
          } catch (err) {
            console.log('Could not extract page info');
          }

          if (name !== 'N/A' && profileUrl) {
            leads.push({
              name,
              platform: 'Facebook',
              jobField: keyword,
              jobTitle: category || 'Facebook Page',
              company: name,
              location: 'N/A',
              profileUrl,
              email: '',
              additionalInfo: `${category} - ${followers}`,
              pageCategory: category,
              pageFollowers: followers
            });

            console.log(`Extracted page ${i + 1}: ${name}`);
          }

        } catch (error) {
          console.log(`Error extracting page ${i}:`, error.message);
          continue;
        }
      }

    } catch (error) {
      console.error('Error extracting page leads:', error);
    }

    return leads;
  }

  /**
   * Extract group leads from search results
   */
  async extractGroupLeads(keyword, limit) {
    const leads = [];

    try {
      const resultCards = await this.driver.findElements(
        By.css('div[role="article"]')
      );

      for (let i = 0; i < Math.min(resultCards.length, limit); i++) {
        try {
          const card = resultCards[i];

          let name = 'N/A';
          let profileUrl = '';
          let members = '';
          let privacy = '';

          try {
            const nameElement = await card.findElement(By.css('a span'));
            name = await nameElement.getText();

            const linkElement = await card.findElement(By.css('a'));
            profileUrl = await linkElement.getAttribute('href');
            profileUrl = profileUrl.split('?')[0];

            const infoElements = await card.findElements(By.css('span'));
            for (let elem of infoElements) {
              const text = await elem.getText();
              if (text.includes('members') || text.includes('member')) {
                members = text;
              } else if (text.includes('Public') || text.includes('Private')) {
                privacy = text;
              }
            }
          } catch (err) {
            console.log('Could not extract group info');
          }

          if (name !== 'N/A' && profileUrl) {
            leads.push({
              name,
              platform: 'Facebook',
              jobField: keyword,
              jobTitle: 'Facebook Group',
              company: name,
              location: 'N/A',
              profileUrl,
              email: '',
              additionalInfo: `${privacy} - ${members}`,
              groupMembers: members,
              groupPrivacy: privacy
            });

            console.log(`Extracted group ${i + 1}: ${name}`);
          }

        } catch (error) {
          console.log(`Error extracting group ${i}:`, error.message);
          continue;
        }
      }

    } catch (error) {
      console.error('Error extracting group leads:', error);
    }

    return leads;
  }

  /**
   * Scroll page to load more results
   */
  async scrollPage(times = 3) {
    for (let i = 0; i < times; i++) {
      await this.driver.executeScript('window.scrollTo(0, document.body.scrollHeight)');
      await this.driver.sleep(2000);
    }
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(filename = 'screenshot.png') {
    try {
      const screenshot = await this.driver.takeScreenshot();
      require('fs').writeFileSync(filename, screenshot, 'base64');
      console.log(`Screenshot saved as ${filename}`);
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.driver) {
      await this.driver.quit();
      console.log('Browser closed');
    }
  }
}

exports.fetchLinkedInLeads = async (keyword, filters) => {
  // Simulated LinkedIn API integration
  // In production, integrate with LinkedIn API or scraping service
  return [
    {
      name: 'John Doe',
      email: 'john.doe@example.com',
      platform: 'LinkedIn',
      jobField: keyword,
      jobTitle: 'Senior Developer',
      company: 'Tech Corp',
      location: 'New York, NY',
      profileUrl: 'https://linkedin.com/in/johndoe',
    },
  ];
};

exports.fetchUpworkLeads = async (keyword, filters) => {
  // Simulated Upwork API integration
  return [
    {
      name: 'Jane Smith',
      email: 'jane.smith@example.com',
      platform: 'Upwork',
      jobField: keyword,
      jobTitle: 'Web Designer',
      company: 'Freelancer',
      location: 'Remote',
      profileUrl: 'https://upwork.com/freelancers/janesmith',
    },
  ];
};

exports.fetchTwitterLeads = async (keyword, filters) => {
  // Simulated Twitter API integration
  return [
    {
      name: 'Mike Johnson',
      email: 'mike.j@example.com',
      platform: 'Twitter',
      jobField: keyword,
      jobTitle: 'Marketing Specialist',
      company: 'Digital Agency',
      location: 'Los Angeles, CA',
      profileUrl: 'https://twitter.com/mikej',
    },
  ];
};

exports.fetchFacebookLeads = async (keyword, filters = {}) => {
  const scraper = new FacebookLeadFetcher();

  try {
    // Initialize browser
    await scraper.initialize();

    // Login with credentials from environment variables
    const fbEmail = process.env.FACEBOOK_EMAIL;
    const fbPassword = process.env.FACEBOOK_PASSWORD;

    if (!fbEmail || !fbPassword) {
      throw new Error('Facebook credentials not found in environment variables');
    }

    await scraper.login(fbEmail, fbPassword);

    // Search for leads
    const searchOptions = {
      searchType: filters.searchType || 'people', // 'people', 'pages', 'groups'
      location: filters.location || '',
      limit: filters.limit || 10
    };

    const leads = await scraper.searchLeads(keyword, searchOptions);

    // Optional: Take screenshot for debugging
    // await scraper.takeScreenshot('facebook_search.png');

    return leads;

  } catch (error) {
    console.error('Error fetching Facebook leads:', error);
    throw error;
  } finally {
    // Always close the browser
    await scraper.close();
  }
};


exports.fetchLeadsFromPlatforms = async (keyword, platforms, filters) => {
  const leads = [];

  // if (platforms.includes('LinkedIn')) {
  //   const linkedInLeads = await exports.fetchLinkedInLeads(keyword, filters);
  //   leads.push(...linkedInLeads);
  // }

  // if (platforms.includes('Upwork')) {
  //   const upworkLeads = await exports.fetchUpworkLeads(keyword, filters);
  //   leads.push(...upworkLeads);
  // }

  // if (platforms.includes('Twitter')) {
  //   const twitterLeads = await exports.fetchTwitterLeads(keyword, filters);
  //   leads.push(...twitterLeads);
  // }

  const gptLeads = await fetchGPTLeads(keyword, 10);
  leads.push(...gptLeads);

  return leads;
};



// exports.testFacebookScraper = async () => {
async function testFacebookScraper() {
  const scraper = new FacebookLeadFetcher();

  try {
    // 1. Initialize
    await scraper.initialize();

    console.log("scraperinitialize")

    // 2. Login
    await scraper.login(
      process.env.FACEBOOK_EMAIL,
      process.env.FACEBOOK_PASSWORD
    );

    // 3. Search for people
    const peopleLeads = await scraper.searchLeads('web developer', {
      searchType: 'people',
      limit: 10
    });
    console.log('People Leads:', peopleLeads);

    // 4. Search for pages
    const pageLeads = await scraper.searchLeads('digital marketing agency', {
      searchType: 'pages',
      limit: 5
    });
    console.log('Page Leads:', pageLeads);

    // 5. Search for groups
    const groupLeads = await scraper.searchLeads('freelance developers', {
      searchType: 'groups',
      limit: 5
    });
    console.log('Group Leads:', groupLeads);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await scraper.close();
  }
}

// Uncomment to test
// testFacebookScraper();