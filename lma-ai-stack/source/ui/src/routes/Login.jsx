/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../utils/supabase-client';
import { REGISTER_PATH } from './constants';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Chào mừng trở lại</h2>
          <p>Đăng nhập để tiếp tục sử dụng</p>
        </div>

        <form className="auth-form" onSubmit={handleSignIn}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                autoComplete="email"
              />
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="password">
              Mật khẩu
              <input
                id="password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Chưa có tài khoản?</p>
          <Link to={REGISTER_PATH} className="auth-link">
            Đăng ký ngay
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
