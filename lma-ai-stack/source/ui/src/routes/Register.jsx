/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import supabaseConfig from '../supabase-config';
import { LOGIN_PATH } from './constants';
import './Auth.css';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const Register = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState('');

  const checkPasswordStrength = (pwd) => {
    if (pwd.length < 6) return 'weak';
    if (pwd.length < 10) return 'medium';
    if (pwd.length >= 10 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) {
      return 'strong';
    }
    return 'medium';
  };

  const handlePasswordChange = (e) => {
    const pwd = e.target.value;
    setPassword(pwd);
    setPasswordStrength(checkPasswordStrength(pwd));
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: `${firstName} ${lastName}`,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
      } else {
        setSuccess('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.');
        // Clear form
        setFirstName('');
        setLastName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setPasswordStrength('');
      }
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Tạo tài khoản mới</h2>
          <p>Điền thông tin để bắt đầu</p>
        </div>

        <form className="auth-form" onSubmit={handleSignUp}>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="form-name-group">
            <div className="form-group">
              <label htmlFor="firstName">
                Họ
                <input
                  id="firstName"
                  type="text"
                  className="form-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Nguyễn"
                  required
                  autoComplete="given-name"
                />
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="lastName">
                Tên
                <input
                  id="lastName"
                  type="text"
                  className="form-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Văn A"
                  required
                  autoComplete="family-name"
                />
              </label>
            </div>
          </div>

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
                onChange={handlePasswordChange}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </label>
            {password && <div className={`password-strength ${passwordStrength}`} />}
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">
              Xác nhận mật khẩu
              <input
                id="confirmPassword"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Đã có tài khoản?</p>
          <Link to={LOGIN_PATH} className="auth-link">
            Đăng nhập ngay
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
