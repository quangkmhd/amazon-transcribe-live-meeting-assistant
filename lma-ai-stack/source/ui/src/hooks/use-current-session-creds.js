/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useState, useEffect } from 'react';

// Create a Cognito-compatible session mock for AWS Amplify libraries
const createCognitoCompatibleSession = () => {
  // Get tokens from localStorage (set by useUserAuthStateSupabase)
  const accessToken = localStorage.getItem('supabase-client-accesstokenjwt') || '';
  const idToken = localStorage.getItem('supabase-client-idtokenjwt') || '';
  const refreshToken = localStorage.getItem('supabase-client-refreshtoken') || '';

  return {
    getAccessToken: () => ({
      getJwtToken: () => accessToken,
      jwtToken: accessToken,
    }),
    getIdToken: () => ({
      getJwtToken: () => idToken,
      jwtToken: idToken,
    }),
    getRefreshToken: () => ({
      getToken: () => refreshToken,
      token: refreshToken,
    }),
    isValid: () => !!accessToken,
  };
};

const useCurrentSessionCreds = ({ authState }) => {
  const [currentSession, setCurrentSession] = useState(null);
  const [currentCredentials, setCurrentCredentials] = useState({ dummy: true });

  useEffect(() => {
    if (authState === 'signedin') {
      setCurrentSession(createCognitoCompatibleSession());
      setCurrentCredentials({ dummy: true });
    } else {
      setCurrentSession(null);
      setCurrentCredentials(null);
    }
  }, [authState]);

  return { currentSession, currentCredentials };
};

export default useCurrentSessionCreds;
