/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState } from 'react';
import { HashRouter } from 'react-router-dom';

import { AppContext } from './contexts/app';

import useUserAuthStateSupabase from './hooks/use-user-auth-state-supabase';
import useSupabaseConfig from './hooks/use-supabase-config';
import useCurrentSessionCreds from './hooks/use-current-session-creds';

import Routes from './routes/Routes';

import './App.css';

const logger = {
  debug: (...args) => process.env.NODE_ENV === 'development' && console.log('[App]', ...args),
  error: (...args) => console.error('[App]', ...args),
};

const App = () => {
  const supabaseConfig = useSupabaseConfig();
  const { authState, user } = useUserAuthStateSupabase();
  const { currentSession, currentCredentials } = useCurrentSessionCreds({ authState });
  const [errorMessage, setErrorMessage] = useState();
  const [navigationOpen, setNavigationOpen] = useState(true);

  // eslint-disable-next-line react/jsx-no-constructed-context-values
  const appContextValue = {
    authState,
    awsConfig: supabaseConfig, // Keep property name for backward compatibility
    supabaseConfig,
    errorMessage,
    currentCredentials,
    currentSession,
    setErrorMessage,
    user,
    navigationOpen,
    setNavigationOpen,
  };
  logger.debug('appContextValue', appContextValue);

  return (
    <div className="App">
      <AppContext.Provider value={appContextValue}>
        <HashRouter>
          <Routes />
        </HashRouter>
      </AppContext.Provider>
    </div>
  );
};

export default App;
