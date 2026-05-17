import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { ThemeToggle } from '../App';
import './Dashboard.css';

//const BACKEND_URL = 'http://localhost:5005';
const BACKEND_URL = 'https://eman-sarfraz-lumina-backend.hf.space';

const GpaPredictor = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ name: 'Academic User', enrollment: '' });
  const [semesters, setSemesters] = useState([]);
  const [targetGpaInput, setTargetGpaInput] = useState('');
  const [gpaPlan, setGpaPlan] = useState(null);
  const [gpaLoading, setGpaLoading] = useState(false);
  const [gpaStatus, setGpaStatus] = useState('');
  const [weakDomains, setWeakDomains] = useState([]); 

  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState('');
  const [portalLastUpdated, setPortalLastUpdated] = useState(null);
  const [isPortalCached, setIsPortalCached] = useState(false);

  const [manualCourses, setManualCourses] = useState([
    { title: '', credits: '3', grade: 'A' },
    { title: '', credits: '3', grade: 'B+' },
    { title: '', credits: '3', grade: 'B' }
  ]);
  const [manualResult, setManualResult] = useState(null);

  const bahriaGradePoints = { 'A': 4.00, 'B+': 3.50, 'B': 3.00, 'C+': 2.50, 'C': 2.00, 'D+': 1.50, 'D': 1.00, 'F': 0.00 };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
    loadSemestersForAutoMapping();
    fetchPortalVaultStatus();
  }, []);

  useEffect(() => {
    if (semesters && semesters.length > 0) {
      const activeSemesterBlock = semesters[0];
      if (activeSemesterBlock && activeSemesterBlock.courses && activeSemesterBlock.courses.length > 0) {
        const autoMappedCourses = activeSemesterBlock.courses.map(c => {
          const extractedCH = c.creditHours ? c.creditHours.toString().replace(/[^0-9]/g, '') : '3';
          return { title: `${c.code} - ${c.registeredTitle}`, credits: extractedCH === '0' ? '0' : (extractedCH || '3'), grade: 'A' };
        });
        setManualCourses(autoMappedCourses);
      }
    }
  }, [semesters]);

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
        setGpaStatus("Secure password vault updated successfully."); setTimeout(() => setGpaStatus(''), 4000);
      }
    } catch (err) { setGpaStatus(`Vault update rejected: ${err.message}`); }
  };

  const loadSemestersForAutoMapping = async () => {
    const token = localStorage.getItem('token');
    if (!token || token === 'mock_jwt_token_for_lumina_testing') return;
    try {
      const response = await axios.get(`${BACKEND_URL}/api/courses`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success && Array.isArray(response.data.data)) setSemesters(response.data.data);
    } catch (err) { setSemesters([]); }
  };

  const handleDomainToggle = (domain) => { 
    setWeakDomains(prev => prev.includes(domain) ? prev.filter(d => d !== domain) : [...prev, domain]); 
  };

  const handleCalculateManualGpa = (e) => {
    e.preventDefault();
    let totalQualityPoints = 0; 
    let totalCreditHours = 0;
    (manualCourses || []).forEach(c => {
      const ch = parseFloat(c.credits) || 0; 
      const gp = bahriaGradePoints[c.grade] ?? 0;
      totalQualityPoints += (ch * gp); 
      totalCreditHours += ch;
    });
    if (totalCreditHours === 0) { alert("Attempted Credit hours sum cannot add up to 0 CH."); return; }
    setManualResult({ gpa: parseFloat((totalQualityPoints / totalCreditHours).toFixed(2)), credits: totalCreditHours });
  };

  const addManualRow = () => setManualCourses([...manualCourses, { title: '', credits: '3', grade: 'A' }]);
  const removeManualRow = (index) => manualCourses.length > 1 && setManualCourses(manualCourses.filter((_, i) => i !== index));
  const updateManualRow = (index, field, value) => { const updated = [...manualCourses]; updated[index][field] = value; setManualCourses(updated); };

  const handleGpaPredict = async (e) => {
    e.preventDefault();
    const parsedTarget = parseFloat(targetGpaInput);
    if (!parsedTarget || parsedTarget < 1.00 || parsedTarget > 4.00) { setGpaStatus("Select valid bounds (1.00 - 4.00)."); return; }
    const token = localStorage.getItem('token');
    
    setGpaLoading(true); 
    setGpaStatus("Running state-space pathfinding heuristics matrix model...");
    try {
      const response = await axios.post(`${BACKEND_URL}/api/gpa/plan`, { targetGpa: parsedTarget, difficultDomains: weakDomains }, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.data.success) { 
        setGpaPlan(response.data.plan); 
        setGpaStatus(`Plan calculated successfully! Projected SGPA Outcome: ${response.data.projectedGpa}`); 
      } else { 
        setGpaStatus(`Calculation failed: ${response.data.message}`); 
      }
    } catch (err) { 
      setGpaStatus(`Predictor Error: ${err.response?.data?.message || err.message}`); 
    } finally { 
      setGpaLoading(false); 
    }
  };

  const handleDisconnectPortal = () => {
    localStorage.removeItem('token'); 
    localStorage.removeItem('user'); 
    navigate('/login');
  };

  const isGpaStatusError = gpaStatus.toLowerCase().includes('error') || gpaStatus.toLowerCase().includes('failed') || gpaStatus.toLowerCase().includes('valid bounds');

  return (
    <div className="page-db-container">
      <div className="glow-sphere-1"></div><div className="glow-sphere-2"></div>

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

      <main className="dashboard-display">
        <header className="display-header">
          <div className="header-greeting">
            <div className="breadcrumb-trail">
              <span>Lumina Core</span> / <span className="active">Predictor Engine</span>
            </div>
            <h2>GPA Predictor</h2>
          </div>
          <div className="auth-top-controls-dashboard">
            <ThemeToggle />
          </div>
        </header>

        <div className="dashboard-scrollable-content">
          <div className="fade-in gpa-forecaster-tab">
            
            <div className="dashboard-glass-card forecaster-main-card">
              <p className="forecaster-welcome-text">
                Configure your expected SGPA and select technical domains you find personally challenging. 
              </p>

              <form onSubmit={handleGpaPredict} className="forecaster-form-card">
                <div className="cognitive-selection-section">
                  <span className="forecaster-section-label">WEAK DOMAINS</span>
                  <div className="cognitive-grid">
                    {[
                      { id: 'coding', label: 'Complex Programming / Projects' },
                      { id: 'math', label: 'Theoretical Algorithms / Math Core' },
                      { id: 'theory', label: 'Extensive Documentation & Testing Frameworks' }
                    ].map(domain => (
                      <button 
                        key={domain.id} 
                        type="button" 
                        onClick={() => handleDomainToggle(domain.id)} 
                        className={`cognitive-tag-btn ${weakDomains.includes(domain.id) ? 'selected' : ''}`}
                      >
                        {domain.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gpa-action-deck">
                  <div className="gpa-input-group">
                    <label htmlFor="targetGpaField" className="forecaster-section-label">TARGET GPA</label>
                    <input 
                      type="number" 
                      id="targetGpaField"
                      step="0.01" 
                      min="1.00" 
                      max="4.00" 
                      placeholder="0.00"
                      value={targetGpaInput} 
                      onChange={(e) => setTargetGpaInput(e.target.value)} 
                      required 
                    />
                  </div>
                  <button type="submit" className="forecaster-submit-btn" disabled={gpaLoading}>
                    {gpaLoading ? 'Analyzing Matrices...' : 'Construct Adaptive Plan'}
                  </button>
                </div>
              </form>

              {gpaStatus && (
                <div className={`forecaster-status-alert ${isGpaStatusError ? 'error' : 'success'}`}>
                  {gpaStatus}
                </div>
              )}
            </div>

            {gpaPlan && (
              <div className="gpa-plan-roadmap">
                <h3 style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1px', color: 'var(--text-muted)', margin: '10px 0 4px 0' }}>AI RECOMMENDED ALLOCATION STRUCT</h3>
                {gpaPlan.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '14px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '70%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-glow)' }}>{item.code}</span>
                        <span style={{ fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '12px', background: item.difficulty.color + '15', color: item.difficulty.color, border: '1px solid ' + item.difficulty.color + '25' }}>{item.difficulty.label.toUpperCase()}</span>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)' }}>({item.credits} Credit Hours)</span>
                      </div>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: '4px 0' }}>{item.title}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0', lineHeight: '1.4' }}>{item.difficulty.desc}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '40px', alignItems: 'center', textAlign: 'right' }}>
                      <div style={{ textAlign: 'right' }}><span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)' }}>WEEKLY STUDY BUDGET</span><span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>{item.recommendedWorkload}</span></div>
                      <div style={{ textAlign: 'right' }}><span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)' }}>TARGET GRADE</span><span style={{ fontSize: '18px', fontWeight: '950', color: 'var(--secondary-glow)', display: 'block', marginTop: '2px' }}>{item.targetGrade}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="dashboard-glass-card" style={{ marginTop: '24px' }}>
              <div className="card-header">
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: '0' }}>GPA CALCULATOR</h2>
                </div>
                <span className="metric-tag highlight">Grading Scale 2025/2026</span>
              </div>

              <form onSubmit={handleCalculateManualGpa} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                <div className="gpa-manual-calculator-scroll">
                  {(manualCourses || []).map((course, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'center', background: 'var(--glass-bg)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                      <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--primary-glow)', width: '75px', minWidth: '75px', letterSpacing: '0.5px' }}>Course {idx + 1}</span>
                      <input type="text" value={course.title} onChange={(e) => updateManualRow(idx, 'title', e.target.value)} style={{ flex: 2, padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }} required />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '110px' }}>
                        <select value={course.credits} onChange={(e) => updateManualRow(idx, 'credits', e.target.value)} style={{ padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                          <option value="3">3 Credit Hrs</option><option value="2">2 Credit Hrs</option><option value="1">1 Credit Hr</option><option value="0">0 CH (Non-Credit)</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '90px' }}>
                        <select value={course.grade} onChange={(e) => updateManualRow(idx, 'grade', e.target.value)} style={{ padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontWeight: '700', cursor: 'pointer' }}>
                          <option value="A">A (4.00)</option><option value="B+">B+ (3.50)</option><option value="B">B (3.00)</option><option value="C+">C+ (2.50)</option><option value="C">C (2.00)</option><option value="D+">D+ (1.50)</option><option value="D">D (1.00)</option><option value="F">F (0.00)</option>
                        </select>
                      </div>
                      <button type="button" onClick={() => removeManualRow(idx)} disabled={manualCourses.length <= 1} style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', color: 'var(--error-color)', borderRadius: '8px', cursor: manualCourses.length <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '700' }}>X</button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                  <button type="button" onClick={addManualRow} style={{ padding: '8px 16px', background: 'var(--input-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>+ Add Additional Subject</button>
                  <button type="submit" className="action-button-glow" style={{ marginTop: '0' }}>Compute Manual Score</button>
                </div>
              </form>

              {manualResult && (
                <div className="fade-in" style={{ marginTop: '24px', padding: '20px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>TOTAL CALCULATED ATTEMPT</span><strong style={{ fontSize: '24px', display: 'block', color: 'var(--text-primary)', marginTop: '4px' }}>{manualResult.gpa.toFixed(2)} <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '400' }}>/ 4.00 GPA</span></strong></div>
                    <div style={{ textAlign: 'right' }}><span style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-muted)' }}>CREDITS REGISTERED</span><span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--primary-glow)', display: 'block', marginTop: '2px' }}>{manualResult.credits} CH</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {manualResult.gpa >= 3.50 && manualResult.credits >= 15 && <div style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>Dean's List Elite Qualifier (GPA &ge; 3.50 & CH &ge; 15)</div>}
                    {manualResult.gpa < 2.00 ? <div style={{ padding: '8px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--error-color)', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>Academic Probation Warning (GPA Below 2.00 Threshold)</div> : <div style={{ padding: '8px 14px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', color: 'var(--primary-glow)', borderRadius: '8px', fontSize: '11px', fontWeight: '700' }}>Good Standing Academic Status</div>}
                  </div>
                </div>
              )}
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

export default GpaPredictor;