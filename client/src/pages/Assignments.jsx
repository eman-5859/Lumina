import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../App';
import './Assignments.css';

//const BACKEND_URL = 'http://localhost:5005';
const BACKEND_URL = 'https://eman-sarfraz-lumina-backend.hf.space';

const Assignments = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Academic User', enrollment: '' });
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingLive, setSyncingLive] = useState(false);
  const [statusText, setStatusText] = useState('');
  
  const [lastSync, setLastSync] = useState(localStorage.getItem('lastLmsSync') || null);

  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalLastUpdated, setPortalLastUpdated] = useState(null);
  const [isPortalCached, setIsPortalCached] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
    fetchLmsAlertLogs();
    fetchPortalVaultStatus();
  }, []);

  const fetchPortalVaultStatus = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/scrape/portal-status`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) {
        setIsPortalCached(response.data.isCached);
        setPortalLastUpdated(response.data.lastUpdated);
      }
    } catch (err) {}
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

  const fetchLmsAlertLogs = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      setLoading(true);
      const res = await axios.get(`${BACKEND_URL}/api/assignments`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.success) setAssignments(res.data.data);
    } catch (err) { } finally { setLoading(false); }
  };

  const handleLiveLmsReconnect = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    if (!isPortalCached) { setStatusText("Please secure your LMS password in the vault first to enable live sync."); setShowPortalModal(true); return; }

    try {
      setSyncingLive(true); setStatusText("Reconnecting to Bahria CMS headlessly via cached credentials...");
      const res = await axios.post(`${BACKEND_URL}/api/scrape/assignments-live`, {}, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.data.success) {
        setStatusText(res.data.message || "Live Sync Complete! Rendering updated milestones."); 
        setTimeout(() => setStatusText(''), 4000);
        
        // ✅ FIXED: Directly bind updated collection stream response arrays to render list without manual re-query delays
        if (res.data.assignments && Array.isArray(res.data.assignments)) {
          setAssignments(res.data.assignments);
        } else {
          fetchLmsAlertLogs();
        }
        
        const now = new Date().toISOString(); 
        localStorage.setItem('lastLmsSync', now); 
        setLastSync(now);
      }
    } catch (err) { setStatusText(`Sync Blocked: ${err.response?.data?.message || err.message}`); } 
    finally { setSyncingLive(false); }
  };

  const handleDisconnectPortal = async () => {
    const token = localStorage.getItem('token');
    localStorage.removeItem('token'); localStorage.removeItem('user'); navigate('/login');
    if (token && token !== 'mock_jwt_token_for_lumina_testing') {
      try { axios.post(`${BACKEND_URL}/api/scrape/disconnect`, {}, { headers: { 'Authorization': `Bearer ${token}` } }); } catch (err) { }
    }
  };

  const getCountdownBadge = (dateStr) => {
    const target = new Date(dateStr); const diff = target - new Date();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return { label: 'Overdue task', color: 'var(--error-color)' };
    if (days === 0) return { label: 'Due today', color: '#f97316' };
    if (days === 1) return { label: '1 Day Remaining', color: '#f59e0b' };
    return { label: `${days} Days Left`, color: '#10b981' };
  };

  const isStatusError = statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('rejected') || statusText.toLowerCase().includes('blocked');

  return (
    <div className="page-asn-container">
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
          <button className="logout-action-btn" onClick={handleDisconnectPortal}>Disconnect Portal</button>
        </div>
      </aside>

      <main className="dashboard-display">
        <header className="display-header" style={{ marginBottom: '24px' }}>
          <div className="header-greeting">
            <div className="breadcrumb-trail">
              <span>Lumina Core</span> / <span className="active">Assignment Deadlines</span>
            </div>
            <h2>LMS Assignment Monitor</h2>
            <p>Lumina routinely queries the Bahria portal in the background to track active assignments.</p>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <ThemeToggle />
          </div>
        </header>

        {statusText && <div style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', background: isStatusError ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.08)', border: isStatusError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(99, 102, 241, 0.2)', color: isStatusError ? 'var(--error-color)' : 'var(--primary-glow)', marginBottom: '10px' }}>{statusText}</div>}

        <div className="dashboard-glass-card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{color: 'var(--text-primary)'}}>LIVE ACADEMIC DEADLINE LOGS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <button 
                className="action-button-glow" 
                style={{ width: 'auto', padding: '10px 20px', margin: 0, height: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }} 
                onClick={handleLiveLmsReconnect} 
                disabled={syncingLive}
              >
                <span style={{ backgroundColor: '#10b981', width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #10b981' }}></span>
                {syncingLive ? "Scraping Portal..." : "Sync LMS Data"}
              </button>
              {lastSync && (
                <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)' }}>
                  Last Sync: {new Date(lastSync).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="assignments-scroll-zone">
            {loading ? (
              <p className="card-description" style={{ textAlign: 'center', padding: '30px 0' }}>Querying active cluster collections...</p>
            ) : assignments.length === 0 ? (
              <p className="card-description" style={{ textAlign: 'center', padding: '30px 0' }}>No active assignment profiles located. Click <strong>"Sync LMS Data"</strong> above to establish a live connection bridge.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {assignments.map((task) => {
                  const countdown = getCountdownBadge(task.deadline);
                  return (
                    <div key={task._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '14px', opacity: task.status === 'Completed' ? 0.55 : 1 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '75%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-glow)' }}>{task.courseCode}</span>
                          <span style={{ fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '12px', background: `${countdown.color}15`, color: countdown.color, border: `1px solid ${countdown.color}25` }}>{countdown.label.toUpperCase()}</span>
                          {task.status === 'Completed' && <span style={{ fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '12px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>VERIFIED SUBMISSION</span>}
                        </div>
                        <h4 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', margin: '4px 0' }}>{task.title}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Portal Deadline: {new Date(task.deadline).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                  <input type="password" id="vaultPassword" placeholder="Enter password to encrypt" value={portalPassword} onChange={(e) => setPortalPassword(e.target.value)} style={{ width: '100%', padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none' }} required autoFocus />
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

export default Assignments;
