/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Redirect, Route, Switch } from 'react-router-dom';

import Login from './Login';
import Register from './Register';
import { LOGIN_PATH, REGISTER_PATH, LOGOUT_PATH, REDIRECT_URL_PARAM } from './constants';

const UnauthRoutes = ({ location }) => {
  return (
    <Switch>
      <Route path={LOGIN_PATH}>
        <Login />
      </Route>
      <Route path={REGISTER_PATH}>
        <Register />
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
