/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useState, useEffect } from 'react';

const useCurrentSessionCreds = ({ authState }) => {
  const [currentSession, setCurrentSession] = useState({ dummy: true });
  const [currentCredentials, setCurrentCredentials] = useState({ dummy: true });

  useEffect(() => {
    if (authState === 'signedin') {
      setCurrentSession({ dummy: true });
      setCurrentCredentials({ dummy: true });
    } else {
      setCurrentSession(null);
      setCurrentCredentials(null);
    }
  }, [authState]);

  return { currentSession, currentCredentials };
};

export default useCurrentSessionCreds;
