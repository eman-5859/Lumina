const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function runLectureDiagnostic() {
  // --- CONFIGURATION VAULT ---
  const ENROLLMENT = "01-131232-021"; 
  const PORTAL_PASSWORD = "emansarfrazyay10@"; 
  // --------------------------

  console.log("🚀 Initializing Lumina Chatbot Automated Context Scraper Test Tool...");
  let browser;
  
  try {
    // Launches a visible browser so you can verify DOM state changes live
    browser = await puppeteer.launch({
      headless: false, 
      defaultViewport: null,
      args: ['--start-maximized', '--disable-web-security', '--ignore-certificate-errors']
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    console.log("📡 Step 1: Navigating to Bahria University Entry Node Gateway...");
    await page.goto('https://cms.bahria.edu.pk/Logins/Student/Login.aspx', { waitUntil: 'load' });

    console.log("✍️ Step 2: Injecting enrollment strings and authorization parameters...");
    await page.type('#BodyPH_tbEnrollment', ENROLLMENT);
    await page.type('#BodyPH_tbPassword', PORTAL_PASSWORD);
    await page.select('#BodyPH_ddlInstituteID', '9');
    await new Promise(r => setTimeout(r, 500));

    console.log("⚡ Step 3: Submitting login credentials postback event...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 20000 }).catch(() => {}),
      page.evaluate(() => document.getElementById('BodyPH_btnLogin').click())
    ]);
    await new Promise(r => setTimeout(r, 2000));

    if (page.url().includes('Login.aspx')) {
      console.log("❌ Error: Portal login credentials rejected. Verify password string.");
      if (browser) await browser.close();
      return;
    }
    console.log("✅ Step 4: Successfully inside central CMS dashboard workspace.");

    console.log("🔍 Step 5: Locating and intercepting the 'Go To LMS' cross-domain anchor...");
    const lmsGatewayUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find(a => a.textContent.trim().includes('Go To LMS'));
      return match ? match.href : null;
    });

    if (!lmsGatewayUrl) {
      console.log("❌ Error: Failed to extract session bridge link from left drawer.");
      return;
    }

    console.log("🔗 Step 6: Passing runtime tokens onto lms.bahria.edu.pk subdomain room...");
    await page.goto(lmsGatewayUrl, { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2500));

    console.log("📂 Step 7: Intercepting sidebar layout to move directly onto 'Lecture Notes' view...");
    const lectureNotesUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      // Finds the specific menu container link matching your exact UI sidebar choice
      const match = anchors.find(a => a.textContent.trim().toLowerCase().includes('lecture notes'));
      return match ? match.href : null;
    });

    // Fallback if URL extraction is blocked by layout wrappers
    const targetPath = lectureNotesUrl || 'https://lms.bahria.edu.pk/Student/LectureNotes.php';
    await page.goto(targetPath, { waitUntil: 'load' });
    
    console.log("⏱️ Step 8: Pausing for asynchronous choice dropdown selections to hydrate completely...");
    await page.waitForSelector('select', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    const currentUrl = page.url();
    let semesterParam = "MjAyNjE%3D"; // Default baseline Spring-2026 query hash token
    const urlMatch = currentUrl.match(/s=([^&]+)/);
    if (urlMatch && urlMatch[1]) semesterParam = urlMatch[1];

    // Target the specific Subject Course dropdown using your validated layout filter rules
    const courseOptions = await page.evaluate(() => {
      const dropdowns = document.querySelectorAll('select');
      if (dropdowns.length < 1) return [];
      
      const dynamicCourseDropdown = Array.from(dropdowns).find(selectElement => {
        if (selectElement.options.length === 0) return false;
        const sampleText = selectElement.options[selectElement.options.length - 1].text.toLowerCase();
        return !sampleText.includes('spring-') && !sampleText.includes('fall-') && !sampleText.includes('summer-');
      }) || dropdowns[dropdowns.length - 1];

      return Array.from(dynamicCourseDropdown.options)
        .map(opt => ({ value: opt.value, text: opt.text.trim() }))
        .filter(opt => opt.value && opt.value !== "" && !opt.text.toLowerCase().includes('select'));
    });

    console.log(`\n🔬 ====== DOCUMENT SEARCH INTERCEPT ACTIVE ======`);
    console.log(`Located ${courseOptions.length} registered course folders ready for conversational lookup parsing.`);

    const totalLecturesCatalog = [];

    // Step 9: Iterate through each subject to extract raw file attachment grids
    for (let course of courseOptions) {
      // Maps exactly onto the URL structure pattern used by your university portal architecture
      const targetQueryRoute = `https://lms.bahria.edu.pk/Student/LectureNotes.php?s=${semesterParam}&oc=${encodeURIComponent(course.value)}`;
      console.log(`➡️ Scanning document map for folder: [${course.text}]`);
      
      await page.goto(targetQueryRoute, { waitUntil: 'load' });
      await new Promise(r => setTimeout(r, 1500)); 

      let html = await page.content();
      let $ = cheerio.load(html);

      let subjectFilesCount = 0;

      $('table tr').each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 3 && !$(row).text().toLowerCase().includes('no lecture note found')) {
          const rawTitle = $(cols[1]).text().trim();
          const downloadAnchor = $(cols[2]).find('a').attr('href') || $(cols[1]).find('a').attr('href');

          if (rawTitle && !rawTitle.toLowerCase().includes('title') && downloadAnchor) {
            // Identify document format constraints automatically
            let fileType = "Unknown Doc";
            if (downloadAnchor.toLowerCase().includes('.pdf')) fileType = "PDF Document";
            else if (downloadAnchor.toLowerCase().includes('.ppt') || downloadAnchor.toLowerCase().includes('.pptx')) fileType = "PowerPoint Presentation";
            else if (downloadAnchor.toLowerCase().includes('.doc') || downloadAnchor.toLowerCase().includes('.docx')) fileType = "Word Document";

            totalLecturesCatalog.push({
              "Subject Directory": course.text.split(' - ')[0],
              "Document Title": rawTitle.replace(/\s+/g, ' '),
              "File Extension Spec": fileType,
              "Download Source URI": downloadAnchor.startsWith('http') ? downloadAnchor : `https://lms.bahria.edu.pk/Student/${downloadAnchor}`
            });
            subjectFilesCount++;
          }
        }
      });
      console.log(`   Found ${subjectFilesCount} lecture assets parsed safely into memory cache list.`);
    }

    console.log("\n================= 📑 INSTANT AI-READY KNOWLEDGE CATALOG REPOSITORY =================");
    if (totalLecturesCatalog.length === 0) {
      console.log("❌ Diagnostic Check Failed: Extracted exactly 0 lecture file nodes. Confirm your LMS directory states.");
    } else {
      console.table(totalLecturesCatalog);
      console.log(`\n🎉 EXTRACTION VERIFICATION COMPLETE! Extracted ${totalLecturesCatalog.length} structural documents.`);
      console.log("Lumina Chatbot has enough parsing mappings to fetch context parameters on demand!");
    }
    console.log("====================================================================================\n");

    console.log("⏸️ Test script execution paused. Look over the generated file metadata directory in your shell console.");
    console.log("Press Ctrl + C in this terminal screen to terminate the diagnostic window session.");

  } catch (error) {
    console.error("💥 Diagnostic Testing Tool Exception Context Raised:", error.message);
    if (browser) await browser.close();
  }
}

runLectureDiagnostic();