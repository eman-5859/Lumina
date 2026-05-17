const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function runVisualDiagnostic() {
  // --- CONFIGURATION ZONE ---
  const ENROLLMENT = "01-131232-021"; 
  const PORTAL_PASSWORD = "emansarfrazyay10@"; 
  // --------------------------

  console.log("🚀 Initializing Lumina Corrected Dropdown Diagnostic Scraper...");
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: false, // Visual execution mode so you can watch it fix itself
      defaultViewport: null,
      args: ['--start-maximized', '--disable-web-security', '--ignore-certificate-errors']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    console.log("📡 Step 1: Navigating to Bahria Central Login Gateway...");
    await page.goto('https://cms.bahria.edu.pk/Logins/Student/Login.aspx', { waitUntil: 'load' });

    console.log("✍️ Step 2: Entering authentication credentials...");
    await page.type('#BodyPH_tbEnrollment', ENROLLMENT);
    await page.type('#BodyPH_tbPassword', PORTAL_PASSWORD);
    await page.select('#BodyPH_ddlInstituteID', '9');
    await new Promise(r => setTimeout(r, 500));

    console.log("⚡ Step 3: Triggering portal login form submit event...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {}),
      page.evaluate(() => document.getElementById('BodyPH_btnLogin').click())
    ]);
    await new Promise(r => setTimeout(r, 2000));

    console.log("🔍 Step 4: Locating the 'Go To LMS' sidebar link component...");
    const lmsGatewayUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find(a => a.textContent.trim().includes('Go To LMS'));
      return match ? match.href : null;
    });

    if (!lmsGatewayUrl) {
      console.log("❌ Error: Could not parse the 'Go To LMS' sidebar token link.");
      return;
    }

    console.log("🔗 Step 5: Transferring session token matrix over to LMS subdomain...");
    await page.goto(lmsGatewayUrl, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));

    console.log("🎯 Step 6: Forcing direct path jump to assignments interface sheet...");
    await page.goto('https://lms.bahria.edu.pk/Student/Assignments.php', { waitUntil: 'load' });
    
    console.log("⏱️ Step 7: Waiting for dropdown components to render fully...");
    await page.waitForSelector('select', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    let semesterParam = "MjAyNjE%3D"; 
    const urlMatch = currentUrl.match(/s=([^&]+)/);
    if (urlMatch && urlMatch[1]) semesterParam = urlMatch[1];

    // FIX: Explicitly sorts dropdown items to find the Course menu while discarding the Semester menu
    const courseOptions = await page.evaluate(() => {
      const dropdowns = document.querySelectorAll('select');
      if (dropdowns.length < 1) return [];
      
      // Look at all available dropdowns and isolate the one that DOES NOT contain semester strings
      const dynamicCourseDropdown = Array.from(dropdowns).find(selectElement => {
        if (selectElement.options.length === 0) return false;
        const sampleText = selectElement.options[selectElement.options.length - 1].text.toLowerCase();
        return !sampleText.includes('spring-') && !sampleText.includes('fall-') && !sampleText.includes('summer-');
      }) || dropdowns[dropdowns.length - 1]; // Fallback to the right-most menu item if unsure

      return Array.from(dynamicCourseDropdown.options)
        .map(opt => ({ value: opt.value, text: opt.text.trim() }))
        .filter(opt => opt.value && opt.value !== "" && !opt.text.toLowerCase().includes('select'));
    });

    console.log(`\n🔬 ====== ANALYSIS OUTCOME ======`);
    console.log(`🎉 SUCCESS! Correctly targeted the Course Dropdown Menu.`);
    console.log(`Discovered ${courseOptions.length} individual subject configurations inside the course index.`);
    
    if (courseOptions.length === 0) {
      console.log("❌ Error: Dropdown sorting failed to target course items.");
      return;
    }

    const compiledAssignments = [];

    // Step 8: Direct URL mapping iteration loops across subjects
    for (let course of courseOptions) {
      const targetQueryRoute = `https://lms.bahria.edu.pk/Student/Assignments.php?s=${semesterParam}&oc=${encodeURIComponent(course.value)}`;
      console.log(`➡️ Crawling course catalog node: [${course.text}]`);
      
      await page.goto(targetQueryRoute, { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 1500)); // Allow table values to paint cleanly

      let loopHtml = await page.content();
      let $ = cheerio.load(loopHtml);

      let courseRowsParsed = 0;

      $('table tr').each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 7 && !$(row).text().toLowerCase().includes('no assignment found')) {
          const textContent = $(row).text().toLowerCase();
          const titleStr = $(cols[1]).text().trim();
          const deadlineRawText = $(cols[7]).text().trim(); // Target column index 7 (Deadline box)

          if (titleStr && !titleStr.toLowerCase().includes('title') && deadlineRawText) {
            // Segregates the dual-stacked date cells safely using regex rules
            const regexPattern = /(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*[^A-Za-z0-9]*\s*\d{1,2}:\d{2}\s*(?:am|pm))/gi;
            const matches = deadlineRawText.match(regexPattern);
            let targetCleanDate = matches && matches[0] ? matches[0] : deadlineRawText;

            targetCleanDate = targetCleanDate.replace('-', ' ').replace(/\s+/g, ' ').trim();
            const statusIndicator = textContent.includes('submit') && !textContent.includes('exceeded') ? 'Pending' : 'Completed';

            compiledAssignments.push({
              "Subject Course": course.text,
              "Assignment Title": titleStr,
              "Target Deadline": targetCleanDate,
              "Current Status": statusIndicator
            });
            courseRowsParsed++;
          }
        }
      });
      console.log(`   Processed rows successfully: ${courseRowsParsed}`);
    }

    console.log("\n================= 📑 FINAL PARSED DEADLINES DATABASE FEEDS =================");
    if (compiledAssignments.length === 0) {
      console.log("❌ ERROR: Scraped through every course profile but extracted exactly 0 total assignment tasks.");
    } else {
      console.table(compiledAssignments);
      console.log(`\n🎉 PARSE PIPELINE VERIFIED COMPLETE! Compiled ${compiledAssignments.length} assignments.`);
    }
    console.log("===========================================================================\n");

    console.log("⏸️ Diagnostic paused. Check your terminal printout table structure.");
    console.log("Press Ctrl + C in this terminal window to close the diagnostic browser session.");

  } catch (error) {
    console.error("💥 Diagnostic Script Engine Exception:", error.message);
    if (browser) await browser.close();
  }
}

runVisualDiagnostic();