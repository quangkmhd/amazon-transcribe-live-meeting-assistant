/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useState, useEffect } from 'react';
import supabase from '../utils/supabase-client';

const logger = {
  debug: (...args) => console.log('[useUserAuthStateSupabase]', ...args),
  error: (...args) => console.error('[useUserAuthStateSupabase]', ...args),
};

const useUserAuthStateSupabase = () => {
  const [authState, setAuthState] = useState();
  const [user, setUser] = useState();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthState('signedin');
        setUser({
          username: session.user.email,
          attributes: {
            email: session.user.email,
          },
          pool: {
            clientId: 'supabase-client',
          },
          signInUserSession: {
            idToken: {
              jwtToken: session.access_token,
            },
            accessToken: {
              jwtToken: session.access_token,
            },
            refreshToken: {
              jwtToken: session.refresh_token,
            },
          },
        });

        // Store tokens
        localStorage.setItem('supabase-client-idtokenjwt', session.access_token);
        localStorage.setItem('supabase-client-accesstokenjwt', session.access_token);
        localStorage.setItem('supabase-client-refreshtoken', session.refresh_token || '');
      } else {
        setAuthState('signedout');
        setUser(null);
      }
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      logger.debug('Auth state change:', event, session);

      if (session) {
        setAuthState('signedin');
        setUser({
          username: session.user.email,
          attributes: {
            email: session.user.email,
          },
          pool: {
            clientId: 'supabase-client',
          },
          signInUserSession: {
            idToken: {
              jwtToken: session.access_token,
            },
            accessToken: {
              jwtToken: session.access_token,
            },
            refreshToken: {
              jwtToken: session.refresh_token,
            },
          },
        });

        localStorage.setItem('supabase-client-idtokenjwt', session.access_token);
        localStorage.setItem('supabase-client-accesstokenjwt', session.access_token);
        localStorage.setItem('supabase-client-refreshtoken', session.refresh_token || '');
      } else {
        setAuthState('signedout');
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { authState, user, isLoading };
};

export default useUserAuthStateSupabase;
