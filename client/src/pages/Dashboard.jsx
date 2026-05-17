import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../App';
import './Dashboard.css';

//const BACKEND_URL = 'http://localhost:5005';
const BACKEND_URL = 'https://eman-sarfraz-lumina-backend.hf.space';
const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Academic User', enrollment: '' });
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [lastSync, setLastSync] = useState(localStorage.getItem('lastLmsSync') || null);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalLastUpdated, setPortalLastUpdated] = useState(null);
  const [isPortalCached, setIsPortalCached] = useState(false);

  const [liveMetrics, setLiveMetrics] = useState({
    courseCount: 0,
    pendingAssignments: 0,
    semesterName: 'Not Synced'
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));

    const token = localStorage.getItem('token');
    if (token === 'mock_jwt_token_for_lumina_testing') {
      setIsSandboxMode(true);
      setStatusMsg("Sandbox Mode Active: Real scraping is bypassed because you are logged in offline.");
    } else {
      setIsSandboxMode(false);
      loadDataFromDB();
      fetchPortalVaultStatus();
    }
  }, []);

  useEffect(() => {
    if (semesters && semesters.length > 0) {
      const activeSemesterBlock = semesters[0];
      if (activeSemesterBlock) {
        setLiveMetrics(prev => ({
          ...prev,
          courseCount: activeSemesterBlock.courses?.length || 0,
          semesterName: activeSemesterBlock.semesterName || 'Active Semester'
        }));
      }
    }
  }, [semesters]);

  const fetchPortalVaultStatus = async () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'mock_jwt_token_for_lumina_testing') return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/scrape/portal-status`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        setIsPortalCached(response.data.isCached);
        setPortalLastUpdated(response.data.lastUpdated);
      }
    } catch (err) {}
  };

  const handlePortalVaultUpdate = async (e) => {
    e.preventDefault();
    if (!portalPassword) return;
    const token = localStorage.getItem('token');
    try {
      const response = await axios.post(`${BACKEND_URL}/api/scrape/portal-update`, { password: portalPassword }, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        setIsPortalCached(true); 
        setPortalLastUpdated(response.data.lastUpdated);
        setPortalPassword(''); 
        setShowPortalModal(false);
        setStatusMsg("Secure password vault updated successfully."); 
        setTimeout(() => setStatusMsg(''), 4000);
      }
    } catch (err) { 
      setStatusMsg(`Vault update synchronization rejected: ${err.response?.data?.message || err.message}`); 
    }
  };

  const handleDisconnectPortal = async () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token'); 
    localStorage.removeItem('user'); 
    navigate('/login');
    if (token && token !== 'mock_jwt_token_for_lumina_testing') {
      try { await axios.post(`${BACKEND_URL}/api/scrape/disconnect`, {}, { headers: { 'Authorization': `Bearer ${token}` } }); } catch (err) {}
    }
  };

  const loadDataFromDB = async () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'mock_jwt_token_for_lumina_testing') return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/courses`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success && Array.isArray(response.data.data)) setSemesters(response.data.data);
      
      const assignmentsResponse = await axios.get(`${BACKEND_URL}/api/assignments`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (assignmentsResponse.data.success && Array.isArray(assignmentsResponse.data.data)) {
        setLiveMetrics(prev => ({ ...prev, pendingAssignments: assignmentsResponse.data.data.length }));
      }
    } catch (err) { setSemesters([]); }
  };

  const handleLiveSync = async () => {
    const token = localStorage.getItem('token');
    if (token === 'mock_jwt_token_for_lumina_testing') { setStatusMsg("Sandbox Mode: Real scraping is bypassed."); return; }
    if (!isPortalCached) { setStatusMsg("Please secure your LMS password in the vault first to enable live sync."); setShowPortalModal(true); return; }
    
    setLoading(true); 
    setStatusMsg("Opening secure headless session with Bahria CMS... This takes approx 15 seconds.");
    try {
      const response = await axios.post(`${BACKEND_URL}/api/scrape/assignments-live`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        // ✅ FIXED: Inject new dataset arrays reactively to instantly render updates without reloading page
        if (response.data.semesters && Array.isArray(response.data.semesters)) {
          setSemesters(response.data.semesters);
        }
        if (response.data.assignments && Array.isArray(response.data.assignments)) {
          setLiveMetrics(prev => ({ ...prev, pendingAssignments: response.data.assignments.length }));
        }
        fetchPortalVaultStatus();
        setStatusMsg(response.data.message || "LMS sync completed safely and written into Cloud storage.");
        const now = new Date().toISOString(); 
        localStorage.setItem('lastLmsSync', now); 
        setLastSync(now);
      }
    } catch (err) { 
      setStatusMsg(`Server Error: ${err.response?.data?.message || err.message}`); 
    } finally { 
      setLoading(false); 
    }
  };

  const downloadCSV = () => {
    if (!semesters || semesters.length === 0) return;
    let csvContent = "data:text/csv;charset=utf-8,Semester,Code,Registered Course Title,Credit Hours,Class,Teacher Name\n";
    semesters.forEach(s => (s.courses || []).forEach(c => { 
      csvContent += `"${s.semesterName}",${c.code},"${c.registeredTitle}",${c.creditHours},"${c.className}","${c.teacherName}"\n`; 
    }));
    const link = document.createElement("a"); 
    link.setAttribute("href", encodeURI(csvContent)); 
    link.setAttribute("download", `Lumina_Courses_${user.enrollment}.csv`);
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
  };

  const isStatusError = statusMsg.toLowerCase().includes('error') || statusMsg.toLowerCase().includes('rejected') || statusMsg.toLowerCase().includes('failed') || statusMsg.toLowerCase().includes('bypassed');

  return (
    <div className="page-db-container">
      <div className="glow-sphere-1"></div><div className="glow-sphere-2"></div>

      {/* Navigation HUD Sidebar Dashboard Module */}
      <aside className="sidebar-hud">
        <div className="sidebar-branding"><div className="brand-icon">L</div><span>Lumina Control</span></div>
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
          <button className="logout-action-btn" onClick={handleDisconnectPortal}>Disconnect Portal</button>
        </div>
      </aside>

      {/* Main Workspace Terminal Stage */}
      <main className="dashboard-display">
        <header className="display-header">
          <div className="header-greeting">
            <div className="breadcrumb-trail">
              <span>Lumina Core</span> / <span className="active">Workspace Overview</span>
            </div>
            <h2>Welcome Back, {user.name ? user.name.split(' ')[0] : 'User'}</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <ThemeToggle />
              <button className="action-button-glow" onClick={handleLiveSync} disabled={loading} style={{ margin: 0, padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '10px', width: 'auto' }}>
                <span style={{ backgroundColor: isSandboxMode ? '#f59e0b' : '#10b981', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', boxShadow: `0 0 8px ${isSandboxMode ? '#f59e0b' : '#10b981'}` }}></span>
                {loading ? 'Syncing...' : 'Sync LMS'}
              </button>
            </div>
            {lastSync && (
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>
                Last Sync: {new Date(lastSync).toLocaleString()}
              </span>
            )}
          </div>
        </header>

        {statusMsg && (
          <div style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', marginBottom: '20px', background: isStatusError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.08)', border: isStatusError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(99, 102, 241, 0.2)', color: isStatusError ? 'var(--error-color)' : 'var(--primary-glow)' }}>{statusMsg}</div>
        )}

        <div className="dashboard-scrollable-content">
          <div className="dashboard-grid fade-in">
            <section className="dashboard-glass-card academic-card">
              <div className="card-header"><h3>Live System Performance</h3></div>
              <div className="gpa-metric-visualizer" style={{ gap: '24px', padding: '10px 0' }}>
                <div className="metric-score-dial" style={{ border: '4px solid var(--secondary-glow)' }}>
                  <h4 style={{ fontSize: '24px', color: 'var(--text-primary)' }}>{liveMetrics.courseCount}</h4>
                  <p>Active Modules</p>
                </div>
                <div className="predictor-forecast">
                  <div className="forecast-point">
                    <span className="label">Current Academic Term:</span>
                    <span className="val value-glow" style={{ fontSize: '14px', marginTop: '2px' }}>{liveMetrics.semesterName}</span>
                  </div>
                  <div className="forecast-point">
                    <span className="label">LMS Deadlines Remaining:</span>
                    <span className="val" style={{ color: liveMetrics.pendingAssignments > 0 ? 'var(--error-color)' : '#10b981', fontSize: '20px', marginTop: '2px' }}>
                      {liveMetrics.pendingAssignments} Pending Tasks
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="dashboard-glass-card flashcard-core-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header"><h3>AI Study Assistant</h3></div>
                <p className="card-description">Have questions regarding your course contents, lesson presentations, or syllabus tasks?</p>
              </div>
              <button onClick={() => navigate('/chatbot')} type="button" className="action-button-glow">Ask Lumina AI Assistant</button>
            </section>

            <section className="dashboard-glass-card sync-tasks-card">
              <div className="card-header">
                <h3>Registered Courses</h3>
                {semesters?.length > 0 && <button onClick={downloadCSV} className="panel-action-btn">Export CSV</button>}
              </div>
              {!semesters || semesters.length === 0 ? (
                <p className="card-description">No active registered course schedules located inside MongoDB cache maps.</p>
              ) : (
                semesters.map((semester, idx) => (
                  <div key={idx} style={{ marginTop: '25px' }}>
                    <h4 style={{ fontSize: '13px', color: 'var(--secondary-glow)', margin: '0 0 10px 0' }}>{semester.semesterName}</h4>
                    <div className="lumina-table-container">
                      <table className="lumina-table">
                        <thead>
                          <tr><th>CODE</th><th>REGISTERED COURSE TITLE</th><th>CREDIT HOURS</th><th>CLASS</th><th>TEACHER NAME</th></tr>
                        </thead>
                        <tbody>
                          {(semester.courses || []).map((course, cIdx) => (
                            <tr key={cIdx}>
                              <td className="code-column">{course.code}</td>
                              <td className="title-column">{course.registeredTitle}</td>
                              <td>{course.creditHours} CH</td>
                              <td>{course.className}</td>
                              <td className="teacher-column">{course.teacherName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Secure Credentials Vault Modal */}
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
                  <input type="password" id="vaultPassword" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none' }} required autoFocus />
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

export default Dashboard;