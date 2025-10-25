/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Logger } from 'aws-amplify';
import Spinner from '@awsui/components-react/spinner';

import UnauthRoutes from './UnauthRoutes';

import useAppContext from '../contexts/app';
import AuthRoutes from './AuthRoutes';

import { REDIRECT_URL_PARAM } from './constants';

const logger = new Logger('Routes');

const Routes = () => {
  const { authState, user, isLoading } = useAppContext();
  const location = useLocation();
  const [urlSearchParams, setUrlSearchParams] = useState(new URLSearchParams({}));
  const [redirectParam, setRedirectParam] = useState('');

  useEffect(() => {
    if (!location?.search) {
      return;
    }
    const searchParams = new URLSearchParams(location.search);
    logger.debug('searchParams:', searchParams);
    setUrlSearchParams(searchParams);
  }, [location]);

  useEffect(() => {
    const redirect = urlSearchParams?.get(REDIRECT_URL_PARAM);
    if (!redirect) {
      return;
    }
    logger.debug('redirect:', redirect);
    setRedirectParam(redirect);
  }, [urlSearchParams]);

  // Show loading while checking auth state
  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          gap: '16px',
        }}
      >
        <Spinner size="large" />
        <div style={{ fontSize: '16px', color: '#666' }}>Đang kiểm tra phiên đăng nhập...</div>
      </div>
    );
  }

  return !(authState === 'signedin' && user) ? (
    <UnauthRoutes location={location} />
  ) : (
    <AuthRoutes redirectParam={redirectParam} />
  );
};

export default Routes;
