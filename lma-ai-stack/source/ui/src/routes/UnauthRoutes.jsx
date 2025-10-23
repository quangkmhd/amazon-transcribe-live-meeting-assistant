/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Redirect, Route, Switch } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';

import supabaseConfig from '../supabase-config';
import { LOGIN_PATH, LOGOUT_PATH, REDIRECT_URL_PARAM } from './constants';

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

const UnauthRoutes = ({ location }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }
  };

  return (
    <Switch>
      <Route path={LOGIN_PATH}>
        <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
          <h2>Sign In</h2>
          <form onSubmit={handleSignIn}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="email">
                Email:
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', display: 'block' }}
                />
              </label>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="password">
                Password:
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.5rem', display: 'block' }}
                />
              </label>
            </div>
            {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}
            <button type="submit" style={{ padding: '0.5rem 2rem' }}>
              Sign In
            </button>
          </form>
        </div>
      </Route>
      <Route path={LOGOUT_PATH}>
        <Redirect to={LOGIN_PATH} />
      </Route>
      <Route>
        <Redirect
          to={{
            pathname: LOGIN_PATH,
            search: `?${REDIRECT_URL_PARAM}=${location.pathname}${location.search}`,
          }}
        />
      </Route>
    </Switch>
  );
};

UnauthRoutes.propTypes = {
  location: PropTypes.shape({
    pathname: PropTypes.string,
    search: PropTypes.string,
  }).isRequired,
};

export default UnauthRoutes;
