require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

// Content Security Policy Relaxation Middleware Stack
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self' http://localhost:* https://*; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  next();
});

const JWT_SECRET = process.env.JWT_SECRET || 'lumina_academic_excellence_secret_2026';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'c8f7a1e39b2d4f6e8a0c2b4d6e8f0a2b'; 
const IV_LENGTH = 16;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "MOCK_KEY");

// --- 1. Cloud MongoDB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('[Lumina Core Engine]: Connected to MongoDB Cloud Cluster.'))
  .catch(err => console.error('[Cloud Connection Error]:', err));

// --- 2. Cryptographic Storage Helpers ---
const encryptPassword = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
};

const decryptPassword = (text) => {
  const [ivHex, encryptedHex, authTagHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

// --- 3. Database Schemas & Data Models ---
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  enrollment: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  lmsCredentialsCached: { type: String, default: null },
  lmsCredentialsUpdated: { type: Date, default: null },
  lastLmsSyncTimestamp: { type: Date, default: null } 
});
const User = mongoose.model('User', userSchema);

const courseSchema = new mongoose.Schema({
  userEnrollment: { type: String, required: true, index: true }, 
  semesterName: String,
  courses: [{ id: String, code: String, registeredTitle: String, creditHours: String, className: String, teacherName: String }]
});
const Semester = mongoose.model('Semester', courseSchema);

const assignmentSchema = new mongoose.Schema({
  userEnrollment: { type: String, required: true, index: true },
  courseCode: { type: String, required: true },
  courseTitle: { type: String, required: true },
  title: { type: String, required: true },
  portalIndex: { type: String, required: true }, 
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
  urgencyAlertSent: { type: Boolean, default: false }
}, { timestamps: true });
const Assignment = mongoose.model('Assignment', assignmentSchema);

const lectureSchema = new mongoose.Schema({
  userEnrollment: { type: String, required: true, index: true },
  courseCode: { type: String, required: true },
  courseTitle: { type: String, required: true },
  title: { type: String, required: true },
  fileType: { type: String, required: true },
  downloadUrl: { type: String, required: true }
}, { timestamps: true });
const Lecture = mongoose.model('Lecture', lectureSchema);

// --- 4. Startup Database Self-Cleaning Patch ---
(async () => {
  try {
    console.log('[Lumina Cleanup Subsystem]: Scanning cluster for historical duplicate assignment rows...');
    const assignments = await Assignment.find({}).sort({ updatedAt: -1 });
    const seenKeys = new Set();
    let deleteCount = 0;

    for (const asn of assignments) {
      const cleanTitle = asn.title ? asn.title.replace(/\s+/g, ' ').trim().toLowerCase() : '';
      const courseCode = asn.courseCode ? asn.courseCode.trim().toLowerCase() : '';
      const enrollment = asn.userEnrollment ? asn.userEnrollment.trim().toLowerCase() : '';
      
      const uniqueCompositeKey = `${enrollment}_${courseCode}_${cleanTitle}`;

      if (seenKeys.has(uniqueCompositeKey)) {
        await Assignment.deleteOne({ _id: asn._id });
        deleteCount++;
      } else {
        seenKeys.add(uniqueCompositeKey);
      }
    }

    if (deleteCount > 0) {
      console.log(`[Lumina Cleanup Subsystem]: Success! Automatically purged ${deleteCount} historical duplicates from your database.`);
    } else {
      console.log('[Lumina Cleanup Subsystem]: Check complete. No duplicate entries detected inside database collections.');
    }
  } catch (err) {
    console.error('[Lumina Cleanup Subsystem Error]:', err.message);
  }
})();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: "Authentication token required." });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, message: "Session expired." });
    req.user = decoded;
    next();
  });
};

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

const dispatchNotificationEmail = async (email, username, subject, bannerText, detailsHtml) => {
  const mailOptions = {
    from: `"Lumina Academic Automation" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subject,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; padding: 24px; background-color: #030712; color: #f8fafc; border-radius: 16px; max-width: 520px; margin: auto; border: 1px solid rgba(255,255,255,0.08);">
        <h2 style="color: #6366f1; font-weight: 800; margin-top:0;">LUMINA ALERTS ENGINE</h2>
        <p>Hello <strong>${username}</strong>,</p>
        <p>${bannerText}</p>
        ${detailsHtml}
        <br/>
        <p style="font-size: 11px; color: #6b7280; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px;">Automated academic monitoring provided by Project Lumina.</p>
      </div>
    `
  };
  try { 
    await transporter.sendMail(mailOptions); 
    console.log(`[Email Alert Dispatcher]: Notification transmitted to ${email}`);
  } catch (e) { 
    console.error("[Mail Subsystem Send Exception]:", e.message); 
  }
};

const scrapeCurrentSemesterCourses = async (page, studentEnrollment) => {
  console.log("[Lumina Course Scraper]: Navigating to registration records panel...");
  await page.goto('https://cms.bahria.edu.pk/Sys/Student/CourseRegistration/RegisteredCourses.aspx', { waitUntil: 'domcontentloaded', timeout: 90000 });
  
  let coursesHtml = await page.content();
  let $ = cheerio.load(coursesHtml);
  const semestersData = [];

  const activeTable = $('table').first();
  if (activeTable.length > 0) {
    const semesterName = activeTable.find('caption').text().trim() || 'Active Term';
    const courses = [];
    
    activeTable.find('tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length > 0) {
        courses.push({
          id: $(cols[0]).text().trim(), 
          code: $(cols[1]).text().trim(),
          registeredTitle: $(cols[2]).text().trim(), 
          creditHours: $(cols[3]).text().trim(),
          className: $(cols[6]).text().trim(), 
          teacherName: $(cols[7]).text().trim(),
        });
      }
    });
    if (courses.length > 0) semestersData.push({ userEnrollment: studentEnrollment, semesterName, courses });
  }

  if (semestersData.length > 0) {
    await Semester.deleteMany({ userEnrollment: studentEnrollment });
    await Semester.insertMany(semestersData);
    return semestersData;
  }
  return [];
};

// --- 6. AUTONOMOUS ASSIGNMENT SCRAPER (WITH IN-FLIGHT SESSION DEDUPLICATION) ---
const executeDynamicMultiCourseScrape = async (page, studentEnrollment, userEmail, userName) => {
  await page.waitForSelector('select', { timeout: 15000 }).catch(() => {});
  
  const currentUrl = page.url();
  let semesterParam = "MjAyNjE%3D"; 
  const urlMatch = currentUrl.match(/s=([^&]+)/);
  if (urlMatch && urlMatch[1]) semesterParam = urlMatch[1];

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

  const existingAssignments = await Assignment.find({ userEnrollment: studentEnrollment });
  
  // ✅ FIXED: Track assignments extracted during this specific session execution loop
  const runtimeExtractedKeys = new Set();

  for (let course of courseOptions) {
    const targetQueryRoute = `https://lms.bahria.edu.pk/Student/Assignments.php?s=${semesterParam}&oc=${encodeURIComponent(course.value)}`;
    
    try {
      await page.goto(targetQueryRoute, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise(r => setTimeout(r, 1200)); 

      let currentHtml = await page.content();
      let $ = cheerio.load(currentHtml);

      for (const row of $('table tr').toArray()) {
        const cols = $(row).find('td');
        if (cols.length >= 7 && !$(row).text().toLowerCase().includes('no assignment found')) {
          const textContent = $(row).text().toLowerCase();
          
          const portalIndex = $(cols[0]).text().trim();
          const titleStr = $(cols[1]).text().replace(/\s+/g, ' ').trim();
          const deadlineRawText = $(cols[7]).text().trim();
          const courseCode = course.text.split(' - ')[0] || 'GEN';

          if (portalIndex && titleStr && !titleStr.toLowerCase().includes('title') && deadlineRawText) {
            
            // ✅ FIXED: Generate unique signature and immediately discard row if already parsed this session
            const sessionUniqueSignature = `${courseCode}_${portalIndex}_${titleStr.toLowerCase()}`;
            if (runtimeExtractedKeys.has(sessionUniqueSignature)) {
              continue; 
            }
            runtimeExtractedKeys.add(sessionUniqueSignature);

            const regexPattern = /(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*[^A-Za-z0-9]*\s*\d{1,2}:\d{2}\s*(?:am|pm))/gi;
            const matches = deadlineRawText.match(regexPattern);
            let targetCleanDate = matches && matches[0] ? matches[0] : deadlineRawText;

            targetCleanDate = targetCleanDate.replace('-', ' ').replace(/\s+/g, ' ').trim();
            const parsedDate = Date.parse(targetCleanDate);
            const finalDeadline = isNaN(parsedDate) ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) : new Date(parsedDate);

            const calculatedStatus = (textContent.includes('submit') && !textContent.includes('submitted') && !textContent.includes('exceeded')) ? 'Pending' : 'Completed';

            const match = existingAssignments.find(a => 
              a.courseCode === courseCode && 
              ((a.portalIndex && a.portalIndex === portalIndex) || a.title.toLowerCase() === titleStr.toLowerCase())
            );

            if (match) {
              const existingDayString = new Date(match.deadline).toISOString().split('T')[0];
              const crawledDayString = new Date(finalDeadline).toISOString().split('T')[0];

              if (existingDayString === crawledDayString && match.status === calculatedStatus) {
                continue;
              }

              match.deadline = finalDeadline;
              match.status = calculatedStatus;
              match.portalIndex = portalIndex;
              await match.save();

              const isDeadlineRecent = finalDeadline >= new Date();
              const isNotUploadedYet = calculatedStatus !== 'Completed';

              if (existingDayString !== crawledDayString && isNotUploadedYet && isDeadlineRecent) {
                await dispatchNotificationEmail(
                  userEmail,
                  userName,
                  `Assignment Deadline Extended: ${match.courseCode}`,
                  `A course instructor has extended an assignment completion timeline on your LMS portal dashboard:`,
                  `<div style="background: rgba(255,255,255,0.04); padding: 16px; border-left: 4px solid #a855f7; border-radius: 4px;">
                     <strong>Course:</strong> ${match.courseTitle}<br/>
                     <strong>Assignment Task:</strong> ${match.title}<br/>
                     <strong>Old Deadline:</strong> <span style="color: #94a3b8; text-decoration: line-through;">${new Date(match.deadline).toLocaleDateString()}</span><br/>
                     <strong>New Extended Deadline:</strong> <span style="color: #10b981; font-weight: bold;">${finalDeadline.toLocaleDateString()}</span>
                   </div>`
                );
              }
            } else {
              const newAssignment = new Assignment({
                userEnrollment: studentEnrollment,
                courseCode,
                courseTitle: course.text,
                title: titleStr,
                portalIndex,
                deadline: finalDeadline,
                status: calculatedStatus
              });
              await newAssignment.save();
              existingAssignments.push(newAssignment);

              if (calculatedStatus === 'Pending') {
                await dispatchNotificationEmail(
                  userEmail,
                  userName,
                  `New Assignment Uploaded: ${newAssignment.courseCode}`,
                  `A new pending assignment milestone has been discovered on your university dashboard catalog:`,
                  `<div style="background: rgba(255,255,255,0.04); padding: 16px; border-left: 4px solid #6366f1; border-radius: 4px;">
                     <strong>Course:</strong> ${newAssignment.courseTitle}<br/>
                     <strong>Assignment Task:</strong> ${newAssignment.title}<br/>
                     <strong>Target Deadline:</strong> <span style="color: #ef4444; font-weight: bold;">${targetCleanDate}</span>
                   </div>`
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Sub-route link error: ${err.message}`);
    }
  }
};

const executeLectureCatalogScrape = async (page, studentEnrollment) => {
  await page.goto('https://lms.bahria.edu.pk/Student/LectureNotes.php', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('select', { timeout: 15000 }).catch(() => {});

  const currentUrl = page.url();
  let semesterParam = "MjAyNjE%3D";
  const urlMatch = currentUrl.match(/s=([^&]+)/);
  if (urlMatch && urlMatch[1]) semesterParam = urlMatch[1];

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

  const parsedLectures = [];
  for (let course of courseOptions) {
    const targetQueryRoute = `https://lms.bahria.edu.pk/Student/LectureNotes.php?s=${semesterParam}&oc=${encodeURIComponent(course.value)}`;
    try {
      await page.goto(targetQueryRoute, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise(r => setTimeout(r, 1000));
      let loopHtml = await page.content();
      let $ = cheerio.load(loopHtml);

      $('table tr').each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 3 && !$(row).text().toLowerCase().includes('no lecture note found')) {
          const rawTitle = $(cols[1]).text().trim();
          const downloadAnchor = $(cols[2]).find('a').attr('href') || $(cols[1]).find('a').attr('href');

          if (rawTitle && !rawTitle.toLowerCase().includes('title') && downloadAnchor) {
            let ext = "PDF";
            if (downloadAnchor.toLowerCase().includes('.ppt') || downloadAnchor.toLowerCase().includes('.pptx')) ext = "PPTX";
            else if (downloadAnchor.toLowerCase().includes('.doc') || downloadAnchor.toLowerCase().includes('.docx')) ext = "DOCX";

            parsedLectures.push({
              userEnrollment: studentEnrollment,
              courseCode: course.text.split(' - ')[0] || 'GEN',
              courseTitle: course.text,
              title: rawTitle.replace(/\s+/g, ' '),
              fileType: ext,
              downloadUrl: downloadAnchor.startsWith('http') ? downloadAnchor : `https://lms.bahria.edu.pk/Student/${downloadAnchor}`
            });
          }
        }
      });
    } catch (err) {
      console.error(`Lecture scanning failed: ${err.message}`);
    }
  }

  if (parsedLectures.length > 0) {
    await Lecture.deleteMany({ userEnrollment: studentEnrollment });
    await Lecture.insertMany(parsedLectures);
  }
  return parsedLectures;
};

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, enrollment, password } = req.body;
    if (!username || !email || !enrollment || !password) return res.status(400).json({ success: false, message: "Required fields missing." });
    const existingUser = await User.findOne({ enrollment });
    if (existingUser) return res.status(400).json({ success: false, message: "Enrollment ID already registered." });

    const newUser = new User({ username, email, enrollment, password });
    await newUser.save();
    const token = jwt.sign({ enrollment: newUser.enrollment }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user: { name: newUser.username, enrollment: newUser.enrollment } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { enrollment, password } = req.body;
    const student = await User.findOne({ enrollment });
    if (!student || student.password !== password) return res.status(400).json({ success: false, message: "Invalid credentials." });

    const token = jwt.sign({ enrollment: student.enrollment }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { name: student.username, enrollment: student.enrollment } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/courses', authenticateToken, async (req, res) => {
  try {
    const data = await Semester.find({ userEnrollment: req.user.enrollment });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: "Database lookup failed." }); }
});

app.get('/api/scrape/portal-status', authenticateToken, async (req, res) => {
  try {
    const student = await User.findOne({ enrollment: req.user.enrollment });
    if (!student) return res.status(404).json({ success: false, message: "User index node missing." });
    res.json({ success: true, isCached: !!student.lmsCredentialsCached, lastUpdated: student.lmsCredentialsUpdated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/scrape/portal-update', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: "Password variable string required." });
    const encryptedText = encryptPassword(password);
    const rightNow = new Date();
    await User.updateOne({ enrollment: req.user.enrollment }, { lmsCredentialsCached: encryptedText, lmsCredentialsUpdated: rightNow });
    res.json({ success: true, message: "Credentials safely written into vault memory block.", lastUpdated: rightNow });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/scrape/assignments-live', authenticateToken, async (req, res) => {
  const studentEnrollment = req.user.enrollment;
  let browser;

  try {
    const studentProfile = await User.findOne({ enrollment: studentEnrollment });
    if (!studentProfile || !studentProfile.lmsCredentialsCached) {
      return res.status(400).json({ success: false, message: "No cached verification vectors found." });
    }

    const rightNow = new Date();
    if (studentProfile.lastLmsSyncTimestamp && (rightNow - new Date(studentProfile.lastLmsSyncTimestamp)) < 3 * 60 * 1000) {
      const cachedSemesters = await Semester.find({ userEnrollment: studentEnrollment });
      const cachedAssignments = await Assignment.find({ userEnrollment: studentEnrollment, status: 'Pending' }).sort({ deadline: 1 });
      return res.json({ 
        success: true, 
        message: "Loaded from secure cluster cache (Throttled to once per 3 mins).", 
        semesters: cachedSemesters, 
        assignments: cachedAssignments 
      });
    }

    const decryptedPassword = decryptPassword(studentProfile.lmsCredentialsCached);
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-web-security', '--ignore-certificate-errors']
    });

    const page = await browser.newPage();
    await page.setBypassCSP(true);
    page.setDefaultNavigationTimeout(90000);

    await page.goto('https://cms.bahria.edu.pk/Logins/Student/Login.aspx', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.type('#BodyPH_tbEnrollment', studentEnrollment);
    await page.type('#BodyPH_tbPassword', decryptedPassword);
    await page.select('#BodyPH_ddlInstituteID', '9');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
      page.evaluate(() => document.getElementById('BodyPH_btnLogin').click())
    ]);

    await new Promise(r => setTimeout(r, 2000));
    if (page.url().includes('Login.aspx')) {
      throw new Error("Cached LMS credentials rejected.");
    }
    
    await scrapeCurrentSemesterCourses(page, studentEnrollment);

    let homepageHtml = await page.content();
    let $ = cheerio.load(homepageHtml);
    let lmsGatewayUrl = '';
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (href.includes('lms.bahria.edu.pk') || $(el).text().includes('Go To LMS')) lmsGatewayUrl = href;
    });

    await page.goto(lmsGatewayUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await new Promise(r => setTimeout(r, 1500));
    
    await page.goto('https://lms.bahria.edu.pk/Student/Assignments.php', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await executeDynamicMultiCourseScrape(page, studentEnrollment, studentProfile.email, studentProfile.username);
    await executeLectureCatalogScrape(page, studentEnrollment);

    await browser.close();

    await User.updateOne({ enrollment: studentEnrollment }, { lastLmsSyncTimestamp: rightNow });

    const compiledSemesters = await Semester.find({ userEnrollment: studentEnrollment });
    const compiledAssignments = await Assignment.find({ userEnrollment: studentEnrollment, status: 'Pending' }).sort({ deadline: 1 });

    res.json({ 
      success: true, 
      message: "Database cached registers sync complete.",
      semesters: compiledSemesters,
      assignments: compiledAssignments
    });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: `Sync exception: ${err.message}` });
  }
});

app.post('/api/gpa/plan', authenticateToken, async (req, res) => {
  const { difficultDomains } = req.body; 
  const studentEnrollment = req.user.enrollment;
  const targetGpa = parseFloat(req.body.targetGpa);

  if (isNaN(targetGpa) || targetGpa < 1.00 || targetGpa > 4.00) {
    return res.status(400).json({ success: false, message: "Target bounds error." });
  }

  try {
    const semesterRecord = await Semester.findOne({ userEnrollment: studentEnrollment });
    if (!semesterRecord || semesterRecord.courses.length === 0) {
      return res.status(400).json({ success: false, message: "LMS cache empty. Sync first." });
    }

    const mapGradeToPoints = (g) => {
      if (g >= 85) return 4.00; if (g >= 80) return 3.50; if (g >= 75) return 3.00;
      if (g >= 70) return 2.50; if (g >= 65) return 2.00; if (g >= 60) return 1.50;
      if (g >= 50) return 1.00; return 0.00;
    };

    const mapPointsToGradeLabel = (p) => {
      if (p >= 4.00) return 'A';   if (p >= 3.50) return 'B+';
      if (p >= 3.00) return 'B';   if (p >= 2.50) return 'C+';
      if (p >= 2.00) return 'C';   if (p >= 1.50) return 'D+';
      if (p >= 1.00) return 'D';   return 'F';
    };

    const parseCredits = (str) => {
      if (!str) return 3;
      const clean = str.toString().replace(/[^0-9.]/g, '');
      return clean === '' ? 3 : Math.round(parseFloat(clean));
    };

    const formattedCourses = semesterRecord.courses.map(c => {
      const credits = parseCredits(c.creditHours);
      let strength = 0.5;
      let label = "Medium"; let color = "#eab308"; let desc = "Standard learning baseline parameters.";
      const lowerTitle = c.registeredTitle.toLowerCase();

      if (difficultDomains && difficultDomains.includes('coding') && (lowerTitle.includes('lab') || lowerTitle.includes('engineering'))) {
        strength = 0.25; label = "Weak"; color = "#ef4444"; desc = "Targeted cognitive weak spot: High code intensity.";
      } else if (difficultDomains && difficultDomains.includes('math') && (lowerTitle.includes('intelligence') || lowerTitle.includes('computing') || lowerTitle.includes('algorithm'))) {
        strength = 0.25; label = "Weak"; color = "#ef4444"; desc = "Targeted cognitive weak spot: High mathematics density.";
      } else if (difficultDomains && difficultDomains.includes('theory') && (lowerTitle.includes('writing') || lowerTitle.includes('presentation') || lowerTitle.includes('testing') || lowerTitle.includes('quality'))) {
        strength = 0.25; label = "Weak"; color = "#ef4444"; desc = "Targeted cognitive weak spot: High documentation requirements.";
      } else if (lowerTitle.includes('quran') || lowerTitle.includes('islamic') || lowerTitle.includes('writing')) {
        strength = 1.0; label = "Strong"; color = "#10b981"; desc = "Historically high performance strength index.";
      }

      return { id: c.id, code: c.code, title: c.registeredTitle, credits, strength, difficulty: { score: strength === 1.0 ? 1 : (strength === 0.5 ? 3 : 5), label, color, desc } };
    });

    const gpaCourses = formattedCourses.filter(c => c.credits > 0);
    const nonGpaCourses = formattedCourses.filter(c => c.credits === 0);

    let currentGPs = gpaCourses.map(() => 1.0); 
    let totalCredits = gpaCourses.reduce((sum, c) => sum + c.credits, 0);
    let requiredQP = targetGpa * totalCredits;

    let loops = 0;
    while (loops < 100) {
      let currentQP = gpaCourses.reduce((sum, c, i) => sum + (c.credits * currentGPs[i]), 0);
      if (currentQP >= requiredQP) break;

      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < gpaCourses.length; i++) {
        if (currentGPs[i] < 4.0) {
          let score = (gpaCourses[i].strength * 20) + (4.0 - currentGPs[i]);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
      }

      if (bestIdx === -1) break;

      // ✅ FIXED: Corrected assignment statement evaluation syntax bug
      if (currentGPs[bestIdx] === 1.0) currentGPs[bestIdx] = 1.5;
      else if (currentGPs[bestIdx] === 1.5) currentGPs[bestIdx] = 2.0;
      else if (currentGPs[bestIdx] === 2.0) currentGPs[bestIdx] = 2.5;
      else if (currentGPs[bestIdx] === 2.5) currentGPs[bestIdx] = 3.0;
      else if (currentGPs[bestIdx] === 3.0) currentGPs[bestIdx] = 3.5;
      else if (currentGPs[bestIdx] === 3.5) currentGPs[bestIdx] = 4.0;
      loops++;
    }

    const GPToMarks = (gp) => {
      if (gp === 4.00) return 85; if (gp === 3.50) return 80; if (gp === 3.00) return 75;
      if (gp >= 2.50) return 70; if (gp >= 2.00) return 65; if (gp >= 1.50) return 60;
      return 50;
    };

    const finalGradesMap = gpaCourses.map((_, i) => GPToMarks(currentGPs[i]));

    const plan = gpaCourses.map((c, idx) => {
      const assignedNumericGrade = finalGradesMap[idx];
      const targetLetter = mapPointsToGradeLabel(mapGradeToPoints(assignedNumericGrade));
      const gradeFactor = Math.max(0.1, Math.min(1.0, (assignedNumericGrade - 45) / 55));
      let baseHoursPerCredit = 1.0 + (gradeFactor * 3.8); 
      
      if (c.difficulty.label === "Weak") baseHoursPerCredit *= 1.35; 
      else if (c.difficulty.label === "Strong") baseHoursPerCredit *= 0.70; 
      
      const targetWeeklyHours = Math.max(1, Math.round(c.credits * baseHoursPerCredit));

      return {
        code: c.code,
        title: c.title,
        credits: c.credits,
        difficulty: c.difficulty,
        targetGrade: `${targetLetter} (${assignedNumericGrade} Marks)`,
        recommendedWorkload: `${targetWeeklyHours} hours/week`
      };
    });

    const auditPlan = nonGpaCourses.map(c => ({
      code: c.code,
      title: c.title,
      credits: 0,
      difficulty: c.difficulty,
      targetGrade: "S (Pass / Satisfactory)",
      recommendedWorkload: "1 hour/week"
    }));

    res.json({ 
      success: true, 
      targetGpa, 
      projectedGpa: parseFloat((gpaCourses.reduce((sum, c, i) => sum + (c.credits * currentGPs[i]), 0) / totalCredits).toFixed(2)), 
      plan: [...plan, ...auditPlan] 
    });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/assignments', authenticateToken, async (req, res) => {
  try {
    const activeDeadlines = await Assignment.find({ userEnrollment: req.user.enrollment, status: 'Pending' }).sort({ deadline: 1 });
    res.json({ success: true, data: activeDeadlines });
  } catch (err) { res.status(500).json({ success: false, message: "Read error." }); }
});

app.get('/api/lectures', authenticateToken, async (req, res) => {
  try {
    const data = await Lecture.find({ userEnrollment: req.user.enrollment }).sort({ courseCode: 1 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Read failed." });
  }
});

app.post('/api/chat/completions', authenticateToken, async (req, res) => {
  const { lectureId, userPrompt } = req.body;
  if (!userPrompt) return res.status(400).json({ success: false, message: "Prompt query required." });

  let browser;
  try {
    const rootVaultFolder = path.join(__dirname, 'Lumina_Local_Vault');
    let analyticalContextString = "No specialized file context attached.";

    if (lectureId) {
      const fileTargetNode = await Lecture.findById(lectureId);
      const studentProfile = await User.findOne({ enrollment: req.user.enrollment });

      if (fileTargetNode && studentProfile && studentProfile.lmsCredentialsCached) {
        const decryptedPassword = decryptPassword(studentProfile.lmsCredentialsCached);
        const sanitizedCode = fileTargetNode.courseCode.replace(/[^a-z0-9]/gi, '_');
        const diskFolderTarget = path.join(rootVaultFolder, sanitizedCode);
        const safeName = `${fileTargetNode.title.replace(/[^a-z0-9\- ]/gi, '_').trim()}.${fileTargetNode.fileType.toLowerCase()}`;
        const finalDiskPath = path.join(diskFolderTarget, safeName);

        if (!fs.existsSync(finalDiskPath)) {
          browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--ignore-certificate-errors'] });
          const page = await browser.newPage();
          page.setDefaultNavigationTimeout(90000);
          
          await page.goto('https://cms.bahria.edu.pk/Logins/Student/Login.aspx', { waitUntil: 'domcontentloaded', timeout: 90000 });
          await page.type('#BodyPH_tbEnrollment', studentProfile.enrollment);
          await page.type('#BodyPH_tbPassword', decryptedPassword);
          await page.select('#BodyPH_ddlInstituteID', '9');
          
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
            page.evaluate(() => document.getElementById('BodyPH_btnLogin').click())
          ]);
          await new Promise(r => setTimeout(r, 2000));

          let html = await page.content();
          let $ = cheerio.load(html);
          let bridge = $('a').toArray().map(el => $(el).attr('href') || '').find(h => h.includes('lms.bahria.edu.pk'));
          
          if (bridge) {
            await page.goto(bridge, { waitUntil: 'domcontentloaded', timeout: 90000 });
            await syncDownloadSingleFile(page, fileTargetNode.downloadUrl, diskFolderTarget, safeName);
          }
          await browser.close();
        }
        analyticalContextString = `[ACTIVE UNIVERSITY LECTURE FILE CACHED ATTACHMENT]\nCourse Code: ${fileTargetNode.courseCode}\nTopic: ${fileTargetNode.title}\nFormat Profile: ${fileTargetNode.fileType}\nLocal Absolute Storage Node File Path: ${finalDiskPath}`;
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const formattedSystemPrompt = `You are the Project Lumina Core Chatbot System Assistant. Guided context:\n${analyticalContextString}\nQuery: "${userPrompt}"`;
    const result = await model.generateContent(formattedSystemPrompt);
    res.json({ success: true, response: result.response.text() });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, message: `Lumina AI Engine error: ${err.message}` });
  }
});

app.post('/api/scrape/disconnect', authenticateToken, async (req, res) => {
  try {
    const studentEnrollment = req.user.enrollment;
    await User.updateOne({ enrollment: studentEnrollment }, { lmsCredentialsCached: null, lmsCredentialsUpdated: null, lastLmsSyncTimestamp: null });
    await Semester.deleteMany({ userEnrollment: studentEnrollment });
    await Assignment.deleteMany({ userEnrollment: studentEnrollment });
    await Lecture.deleteMany({ userEnrollment: studentEnrollment });
    res.json({ success: true, message: "Purge complete." });
  } catch (err) { res.status(500).json({ success: false, message: "Purge exception." }); }
});

// --- 13. SILENT HOURLY AUTOMATION DAEMON BACKGROUND WORKER ---
setInterval(async () => {
  console.log("[Lumina Background Daemon]: Initiating automated hourly campus crawl sync sequence...");
  try {
    const users = await User.find({ lmsCredentialsCached: { $ne: null } });
    for (let student of users) {
      let decryptedPassword = decryptPassword(student.lmsCredentialsCached);
      let browser;
      try {
        browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'] });
        const page = await browser.newPage();
        await page.setBypassCSP(true);
        page.setDefaultNavigationTimeout(90000);

        await page.goto('https://cms.bahria.edu.pk/Logins/Student/Login.aspx', { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.type('#BodyPH_tbEnrollment', student.enrollment);
        await page.type('#BodyPH_tbPassword', decryptedPassword);
        await page.select('#BodyPH_ddlInstituteID', '9');
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {}),
          page.evaluate(() => document.getElementById('BodyPH_btnLogin').click())
        ]);
        await new Promise(r => setTimeout(r, 2000));

        await scrapeCurrentSemesterCourses(page, student.enrollment);

        let backgroundHtml = await page.content();
        let $ = cheerio.load(backgroundHtml);
        let lmsGatewayUrl = '';
        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          if (href.includes('lms.bahria.edu.pk') || $(el).text().includes('Go To LMS')) lmsGatewayUrl = href;
        });

        if (lmsGatewayUrl) {
          await page.goto(lmsGatewayUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
          await new Promise(r => setTimeout(r, 1500));
          await page.goto('https://lms.bahria.edu.pk/Student/Assignments.php', { waitUntil: 'domcontentloaded', timeout: 90000 });
          await executeDynamicMultiCourseScrape(page, student.enrollment, student.email, student.username);
          await executeLectureCatalogScrape(page, student.enrollment);
        }
        await browser.close();
      } catch (inner) { 
        if (browser) await browser.close(); 
        console.error(`Background worker error for ${student.enrollment}:`, inner.message);
      }
    }
  } catch (err) { console.error("Global Daemon Exception:", err.message); }
}, 60 * 60 * 1000); 

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => console.log(`Lumina Production Server running on port ${PORT}`));