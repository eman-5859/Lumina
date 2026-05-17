import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../App';
import './Auth.css';
import buLogo from '../assets/bu-logo.png';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isFormActive, setIsFormActive] = useState(false); // Tracks form interaction/typing focus
  const [formData, setFormData] = useState({
    fullName: '',
    enrollment: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();
  //const API_URL = 'http://localhost:5005/api/auth';
const API_URL = 'https://eman-sarfraz-lumina-backend.hf.space/api/auth';
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormFocus = () => {
    setIsFormActive(true); // Triggers sliding layout transformation shift to screen center
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrollment: formData.enrollment,
            password: formData.password
          })
        });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Login failed.');
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      } else {
        if (formData.password !== formData.confirmPassword) {
          setError("Passwords do not match!");
          setLoading(false);
          return;
        }

        const response = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.fullName,
            email: formData.email,
            enrollment: formData.enrollment,
            password: formData.password
          })
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.message || 'Registration failed.');
        
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Server connection failed. Is your backend server active on port 5005?');
    } finally {
      setLoading(false);
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFormData({ fullName: '', enrollment: '', email: '', password: '', confirmPassword: '' });
  };

  return (
    <div className={`lumina-auth-page ${isFormActive ? 'form-active' : ''}`}>
      <div className="bg-glow-purple"></div>
      <div className="bg-glow-indigo"></div>
      
      {/* Pinned University Logo container up in the corner */}
      <div className="auth-top-left-branding">
        <img src={buLogo} alt="Bahria University" className="bu-logo-image" />
      </div>

      {/* SYMMETRICAL LEFT STAGE: Introduction Details */}
      <div className="auth-left-intro">
        <div className="intro-branding">
          <h1>LUMINA ACADEMIC PORTAL</h1>
          <p className="intro-subtitle"><i>Academic Excellence Platform</i></p>
        </div>
        <p className="intro-description">
          Welcome to Lumina, your central academic command center for managing university life. Securely sync your portal data to automatically track schedules, monitor deadlines, forecast target GPAs, and access your AI study tutor.
        </p>
      </div>

      {/* SYMMETRICAL RIGHT STAGE: Form block container aligned center */}
      <div className="auth-right-form-pane">
        <div className={`auth-card-container ${isLogin ? 'login-mode' : 'signup-mode'}`}>
          <div className="form-container">
            {isLogin ? (
              <form onSubmit={handleSubmit} className="auth-form fade-in">
                <div className="section-title-group">
                  <h2>Login</h2>
                </div>

                {error && <div className="error-banner">{error}</div>}

                <div className="input-group">
                  <label htmlFor="enrollment">ENROLLMENT NUMBER</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="enrollment" 
                      name="enrollment" 
                      value={formData.enrollment} 
                      onChange={handleInputChange} 
                      onFocus={handleFormFocus}
                      required 
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="password">PASSWORD</label>
                  <div className="input-wrapper">
                    <input 
                      type="password" 
                      id="password" 
                      name="password" 
                      value={formData.password} 
                      onChange={handleInputChange} 
                      onFocus={handleFormFocus}
                      required 
                    />
                  </div>
                </div>

                <button type="submit" className="main-cta" disabled={loading}>
                  {loading ? 'Processing...' : 'Sign In to Lumina'}
                </button>

                <p className="switch-prompt">
                  New to the platform?{' '}
                  <button type="button" onClick={toggleAuthMode} className="switch-link">Create an account</button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form fade-in">
                <div className="section-title-group">
                  <h2>Signup</h2>
                </div>

                {error && <div className="error-banner">{error}</div>}

                <div className="input-group">
                  <label htmlFor="fullName">FULL NAME</label>
                  <div className="input-wrapper">
                    <input 
                      type="text" 
                      id="fullName" 
                      name="fullName" 
                      value={formData.fullName} 
                      onChange={handleInputChange} 
                      onFocus={handleFormFocus}
                      required 
                    />
                  </div>
                </div>

                <div className="row-inputs">
                  <div className="input-group">
                    <label htmlFor="enrollment">ENROLLMENT ID</label>
                    <div className="input-wrapper">
                      <input 
                        type="text" 
                        id="enrollment" 
                        name="enrollment" 
                        value={formData.enrollment} 
                        onChange={handleInputChange} 
                        onFocus={handleFormFocus}
                        required 
                      />
                  </div>
                </div>

                  <div className="input-group">
                    <label htmlFor="email">EMAIL ADDRESS</label>
                    <div className="input-wrapper">
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        value={formData.email} 
                        onChange={handleInputChange} 
                        onFocus={handleFormFocus}
                        required 
                      />
                    </div>
                  </div>
                </div>

                <div className="row-inputs">
                  <div className="input-group">
                    <label htmlFor="password">PASSWORD</label>
                    <div className="input-wrapper">
                      <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        value={formData.password} 
                        onChange={handleInputChange} 
                        onFocus={handleFormFocus}
                        required 
                      />
                    </div>
                  </div>

                  <div className="input-group">
                    <label htmlFor="confirmPassword">RE-ENTER PASSWORD</label>
                    <div className="input-wrapper">
                      <input 
                        type="password" 
                        id="confirmPassword" 
                        name="confirmPassword" 
                        value={formData.confirmPassword} 
                        onChange={handleInputChange} 
                        onFocus={handleFormFocus}
                        required 
                      />
                    </div>
                  </div>
                </div>

                <button type="submit" className="main-cta" disabled={loading}>
                  {loading ? 'Creating...' : 'Get Started'}
                </button>

                <p className="switch-prompt">
                  Already have an account?{' '}
                  <button type="button" onClick={toggleAuthMode} className="switch-link">Log in</button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Floating Control Layer containing Theme Switches */}
      <div className="auth-top-controls">
        <ThemeToggle />
      </div>
    </div>
  );
};

export default Auth;