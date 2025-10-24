/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';

import { Alert, AppLayout, Button, Container, ContentLayout, Header, Link, SpaceBetween } from '@cloudscape-design/components';
import Meeting from './components/screens/Meeting';
import Login from './components/screens/Login';
import { useNavigation } from './context/NavigationContext';
import Capture from './components/screens/Capture';
import LoginCognito from './components/screens/LoginCognito';
import { useUserContext } from './context/UserContext';
import { useSupabase } from './context/SupabaseContext';

function App() {

  const { currentScreen } = useNavigation();
  const { user: cognitoUser, loggedIn: cognitoLoggedIn, isLoading: cognitoIsLoading } = useUserContext();
  const { user: supabaseUser, isLoading: supabaseIsLoading } = useSupabase();

  const isLoggedIn = cognitoLoggedIn || supabaseUser !== null;

  if (cognitoIsLoading || supabaseIsLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AppLayout
      className='lmaAppLayout'
      navigationHide={true}
      toolsHide={true}
      content={
        (isLoggedIn ? <Capture /> : <LoginCognito />)
      }
    />
  );
}

export default App;
