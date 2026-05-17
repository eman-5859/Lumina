import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../App';
import './Chatbot.css';

const BACKEND_URL = 'http://localhost:5005';

const Chatbot = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const chatStreamRef = useRef(null); 
  const [user, setUser] = useState({ name: 'Academic User', enrollment: '' });
  
  const [lectures, setLectures] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(''); 
  const [selectedLecture, setSelectedLecture] = useState('');
  const [loadingLectures, setLoadingLectures] = useState(false);

  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hello! I am your Lumina AI Study Assistant. Sync your lecture directory on the side, select any slide, and ask me to prepare study prep materials instantly without manually uploading a thing!' }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [chatProcessing, setChatProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [lastSync, setLastSync] = useState(localStorage.getItem('lastLmsSync') || null);

  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalLastUpdated, setPortalLastUpdated] = useState(null);
  const [isPortalCached, setIsPortalCached] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
    fetchLecturesCacheList();
    fetchPortalVaultStatus();
  }, []);

  useEffect(() => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMarkdownText = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      let processedLine = line;
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      processedLine = processedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');

      if (line.startsWith('### ')) {
        const cleanContent = processedLine.replace('### ', '');
        return <h3 key={idx} style={{ margin: '14px 0 6px 0', color: 'var(--secondary-glow)', fontWeight: '700', fontSize: '15px' }} dangerouslySetInnerHTML={{ __html: cleanContent }} />;
      }
      if (line.startsWith('## ')) {
        const cleanContent = processedLine.replace('## ', '');
        return <h2 key={idx} style={{ margin: '18px 0 8px 0', color: 'var(--primary-glow)', fontWeight: '800', fontSize: '18px' }} dangerouslySetInnerHTML={{ __html: cleanContent }} />;
      }
      if (line.startsWith('# ')) {
        const cleanContent = processedLine.replace('# ', '');
        return <h1 key={idx} style={{ margin: '22px 0 10px 0', color: 'var(--text-primary)', fontWeight: '900', fontSize: '22px' }} dangerouslySetInnerHTML={{ __html: cleanContent }} />;
      }
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const cleanContent = processedLine.trim().replace(/^[\*\-]\s+/, '');
        return <li key={idx} style={{ marginLeft: '18px', marginBottom: '6px', listStyleType: 'disc', color: 'var(--text-secondary)', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: cleanContent }} />;
      }
      return <p key={idx} style={{ margin: '0 0 6px 0', color: 'var(--text-primary)', lineHeight: '1.6', minHeight: '1em' }} dangerouslySetInnerHTML={{ __html: processedLine }} />;
    });
  };

  const fetchPortalVaultStatus = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/scrape/portal-status`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        setIsPortalCached(response.data.isCached);
        setPortalLastUpdated(response.data.lastUpdated);
      }
    } catch (err) { }
  };

  const handlePortalVaultUpdate = async (e) => {
    e.preventDefault(); if (!portalPassword) return;
    const token = localStorage.getItem('token');
    try {
      const response = await axios.post(`${BACKEND_URL}/api/scrape/portal-update`, { password: portalPassword }, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        setIsPortalCached(true); setPortalLastUpdated(response.data.lastUpdated);
        setPortalPassword(''); setShowPortalModal(false);
        setStatusText("Secure password vault updated successfully."); setTimeout(() => setStatusText(''), 4000);
      }
    } catch (err) { setStatusText(`Vault update rejected: ${err.message}`); }
  };

  const fetchLecturesCacheList = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      setLoadingLectures(true);
      const res = await axios.get(`${BACKEND_URL}/api/lectures`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.success) setLectures(res.data.data);
    } catch (err) { } finally { setLoadingLectures(false); }
  };

  const handleScrapeLecturesDirectory = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!isPortalCached) { setStatusText("Please secure your LMS password in the vault first to enable live sync."); setShowPortalModal(true); return; }

    try {
      setChatProcessing(true); setStatusText("Headlessly crawling LMS Course Directories... Isolate attachments takes approx 15 seconds.");
      const res = await axios.post(`${BACKEND_URL}/api/scrape/assignments-live`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.success) {
        setStatusText("Lecture catalog synchronization successfully written to DB cache."); setTimeout(() => setStatusText(''), 4000);
        fetchLecturesCacheList();
        const now = new Date().toISOString(); localStorage.setItem('lastLmsSync', now); setLastSync(now);
      }
    } catch (err) { setStatusText(`Crawl Blocked: ${err.response?.data?.message || err.message}`); } 
    finally { setChatProcessing(false); }
  };

  const handleSendPromptMessage = async (e, forcedPrompt = '') => {
    if (e) e.preventDefault();
    const promptToSend = forcedPrompt || inputPrompt;
    if (!promptToSend.trim() || chatProcessing) return;

    setMessages(prev => [...prev, { sender: 'user', text: promptToSend }]);
    if (!forcedPrompt) setInputPrompt('');
    setChatProcessing(true);

    const token = localStorage.getItem('token');
    try {
      const res = await axios.post(`${BACKEND_URL}/api/chat/completions`, { lectureId: selectedLecture || null, userPrompt: promptToSend }, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.success) { setMessages(prev => [...prev, { sender: 'bot', text: res.data.response }]); }
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'bot', text: `Processing error: ${err.response?.data?.message || err.message}` }]);
    } finally { setChatProcessing(false); }
  };

  const triggerStudyShortcut = (type) => {
    if (!selectedLecture) { alert("Please select a specific course lecture note from the directory dropdown first!"); return; }
    const fileMeta = lectures.find(l => l._id === selectedLecture);
    let promptText = "";
    if (type === 'prep') promptText = `Prepare complete comprehensive lecture note study preparations for ${fileMeta.courseCode}: ${fileMeta.title}. Give structural summary notes guidelines.`;
    if (type === 'flash') promptText = `Generate a set of 5 highly technical Q&A smart flashcards based directly on the key constraints inside ${fileMeta.courseCode}: ${fileMeta.title}.`;
    if (type === 'quiz') promptText = `Synthesize a rigorous 3-question multiple-choice evaluation check quiz testing core conceptual logic in ${fileMeta.courseCode}: ${fileMeta.title}. Include the answer key options below.`;
    handleSendPromptMessage(null, promptText);
  };

  const uniqueCourses = Array.from(new Set(lectures.map(l => l.courseCode))).map(code => {
    const matchingLec = lectures.find(l => l.courseCode === code);
    return { code: code, title: matchingLec ? matchingLec.courseTitle : code };
  });

  const filteredLectures = selectedCourse ? lectures.filter(l => l.courseCode === selectedCourse) : [];

  return (
    <div className="page-chat-container">
      <div className="glow-sphere-1"></div><div className="glow-sphere-2"></div>

      <aside className="sidebar-hud">
        <div className="sidebar-branding" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
          <div className="brand-icon">L</div><span>Lumina Control</span>
        </div>
        <nav className="sidebar-nav">
          <button 
            className={`nav-tab-btn ${location.pathname === '/dashboard' ? 'active' : ''}`} 
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </button>
          <button 
            className={`nav-tab-btn ${location.pathname === '/gpa' ? 'active' : ''}`} 
            onClick={() => navigate('/gpa')}
          >
            GPA Predictor
          </button>
          <button 
            className={`nav-tab-btn ${location.pathname === '/assignments' ? 'active' : ''}`} 
            onClick={() => navigate('/assignments')}
          >
            Assignment Alerts
          </button>
          <button 
            className={`nav-tab-btn ${location.pathname === '/chatbot' ? 'active' : ''}`} 
            onClick={() => navigate('/chatbot')}
          >
            AI Chatbot
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <button 
            type="button" 
            className="action-button-glow" 
            style={{ width: '100%', marginBottom: '14px', padding: '10px 0', fontSize: '11px', justifyContent: 'center' }} 
            onClick={() => setShowPortalModal(true)}
          >
            Update Portal Password
          </button>
          <div className="user-profile-badge">
            <div className="user-avatar">{user.name ? user.name[0] : 'U'}</div>
            <div className="user-meta"><span className="profile-name">{user.name}</span><span className="profile-id">{user.enrollment}</span></div>
          </div>
          <button className="logout-action-btn" onClick={() => { localStorage.clear(); navigate('/login'); }}>Disconnect Portal</button>
        </div>
      </aside>

      <main className="dashboard-display">
        <header className="display-header">
          <div className="header-greeting">
            <div className="breadcrumb-trail">
              <span>Lumina Core</span> / <span className="active">AI Chat Assistant</span>
            </div>
            <h2>Lumina AI Tutor</h2>
            <p>Engage in contextual discussions or generate mock examinations directly linked with synced modules.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <ThemeToggle />
          </div>
        </header>

        {statusText && <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', fontSize: '11px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', color: 'var(--primary-glow)', lineHeight: '1.4' }}>{statusText}</div>}

        <div className="chat-panels-matrix-grid">
          <div className="chat-workspace-pane">
            <div className="chat-viewport-card">
              <div className="chat-messages-stream" ref={chatStreamRef}>
                {messages.map((msg, i) => (
                  <div key={i} className={`chat-bubble-frame ${msg.sender === 'bot' ? 'incoming' : 'outgoing'}`}>
                    <div className="avatar-icon-node">{msg.sender === 'bot' ? 'AI' : 'YOU'}</div>
                    <div className="bubble-content-markdown">
                      {renderMarkdownText(msg.text)}
                    </div>
                  </div>
                ))}
                {chatProcessing && (
                  <div className="chat-bubble-frame incoming processing">
                    <div className="avatar-icon-node">AI</div>
                    <div className="pulse-loader-dots"><span></span><span></span><span></span></div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSendPromptMessage} className="chat-input-bar-form">
                <input type="text" placeholder={selectedLecture ? "Ask any query about the selected slide attachment document..." : "Select a lecture note file directory on the right menu panel to activate RAG processing context..."} value={inputPrompt} onChange={(e) => setInputPrompt(e.target.value)} disabled={chatProcessing} required />
                <button type="submit" className="action-button-glow" disabled={chatProcessing}>Transmit</button>
              </form>
            </div>
          </div>

          <div className="chat-context-sidebar-panel">
            <div className="control-menu-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>CONTEXT SELECTION PANEL</h4>
                  <p className="card-description" style={{ margin: 0 }}>Pick any document file node crawled from your LMS accounts directory sheets.</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <button 
                  type="button" 
                  className="action-button-glow" 
                  style={{ width: '100%', margin: 0, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} 
                  onClick={handleScrapeLecturesDirectory} 
                  disabled={chatProcessing}
                >
                  <span style={{ backgroundColor: '#10b981', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
                  {chatProcessing ? "Crawling LMS Notes..." : "Sync LMS Data"}
                </button>
                {lastSync && (
                  <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Last Sync: {new Date(lastSync).toLocaleString()}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--primary-glow)' }}>CHOOSE TARGET COURSE CODE</span>
                <select value={selectedCourse} onChange={(e) => { setSelectedCourse(e.target.value); setSelectedLecture(''); }} style={{ padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '12px', width: '100%', outline: 'none', cursor: 'pointer' }} disabled={loadingLectures || chatProcessing}>
                  <option value="">-- No Course Selected  --</option>
                  {uniqueCourses.map(course => <option key={course.code} value={course.code}>{course.title}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--primary-glow)' }}>CHOOSE TARGET RECORD NOTE</span>
                <select value={selectedLecture} onChange={(e) => setSelectedLecture(e.target.value)} style={{ padding: '12px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', fontSize: '12px', width: '100%', outline: 'none', cursor: 'pointer' }} disabled={loadingLectures || chatProcessing || !selectedCourse}>
                  <option value="">{selectedCourse ? "-- Select Target Slide note --" : "-- Select a Course First --"}</option>
                  {filteredLectures.map(lec => <option key={lec._id} value={lec._id}>{`${lec.title} (${lec.fileType})`}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)' }}>QUICK COGNITIVE SHORTCUT ACTIONS</span>
                <button onClick={() => triggerStudyShortcut('prep')} type="button" className="secondary-button" disabled={chatProcessing}>Prepare Lecture Study Guide</button>
                <button onClick={() => triggerStudyShortcut('flash')} type="button" className="secondary-button" style={{ marginTop: '10px' }} disabled={chatProcessing}>Synthesize Technical Flashcards</button>
                <button onClick={() => triggerStudyShortcut('quiz')} type="button" className="secondary-button" style={{ marginTop: '10px' }} disabled={chatProcessing}>Generate Concept Check Quiz</button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showPortalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-deep)', opacity: 0.95, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="dashboard-glass-card" style={{ width: '90%', maxWidth: '420px', padding: '30px', position: 'relative', zIndex: 1001, boxShadow: '0 0 50px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Saved Credentials Vault</h3>
            <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', padding: '12px 16px', borderRadius: '10px', fontSize: '12px', lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Vault Status: <span style={{ fontWeight: '800', color: isPortalCached ? '#10b981' : 'var(--error-color)' }}>{isPortalCached ? 'PASSWORD CACHED' : 'EMPTY VAULT'}</span><br/>
              Last Encryption Node: <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{portalLastUpdated ? new Date(portalLastUpdated).toLocaleString() : 'Never Updated'}</span>
            </div>
            <form onSubmit={handlePortalVaultUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="input-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="vaultPassword" style={{ fontSize: '11px', fontWeight: '700', color: 'var(--primary-glow)', letterSpacing: '0.5px' }}>SAVE / UPDATE LMS PASSWORD</label>
                <div className="input-wrapper" style={{ display: 'flex', width: '100%' }}>
                  <input type="password" id="vaultPassword" placeholder="Enter new password to encrypt" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none' }} required autoFocus />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => { setShowPortalModal(false); setPortalPassword(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: '10px 15px' }}>Close</button>
                <button type="submit" className="action-button-glow" style={{ padding: '10px 20px', fontSize: '13px', fontWeight: '700', marginTop: '0', height: 'auto' }}>Update Vault</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chatbot;