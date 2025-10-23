/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { useEffect, useState } from 'react';
import logo from './logo.svg';
import './LoginCognito.css';
import { Box, Button, Container, ContentLayout, Form, FormField, Grid, Header, Input, Link, SpaceBetween, Alert } from '@cloudscape-design/components';
import { useNavigation } from '../../context/NavigationContext';
import { useUserContext } from '../../context/UserContext';
import { useSupabase } from '../../context/SupabaseContext';

function LoginCognito() {

  const { navigate } = useNavigation();
  const { login, loggedIn, exchangeCodeForToken, checkTokenExpired } = useUserContext();
  const { signIn, user: supabaseUser } = useSupabase();

  const queryParameters = new URLSearchParams(window.location.search);
  const code = queryParameters.get("code");

  const [version, setVersion] = useState("");
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (chrome && chrome.runtime) {
      const manifestData = chrome.runtime.getManifest();
      setVersion(manifestData.version)
    } else {
      setVersion("dev/web");
    }
  }, [version, setVersion]);

  if (code && !loggedIn) {
    exchangeCodeForToken(code, 'authorization_code');
  }

  const handleEmailLogin = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setIsLoading(true);
    setError("");

    const { error: signInError } = await signIn(email, password);

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message || "Login failed. Please check your credentials.");
    }
  };

  if (supabaseUser) {
    return null;
  }

  return (
    <ContentLayout header={
      <div></div>
    }>
      <Container
        fitHeight={true}
        footer={''}
      >
        <SpaceBetween size={'l'}>
          <div></div>
          <Grid gridDefinition={[{ colspan: 4, offset: 4 }]}>
            <img className='logo' src='q_svg.svg'></img>
          </Grid>
          <Grid gridDefinition={[{ colspan: 10, offset: 1 }]}>
            <SpaceBetween size={'xs'}>
              <h2 className='header'>Amazon Live<br />Meeting Assistant</h2>
              <p className='headerDesc'>Powered by Amazon Transcribe and Amazon Bedrock</p>
            </SpaceBetween>
          </Grid>

          {!showEmailLogin ? (
            <>
              <Grid gridDefinition={[{ colspan: 6, offset: 3 }]}>
                <Button variant='primary' fullWidth={true} onClick={() => setShowEmailLogin(true)}>
                  Login with Email
                </Button>
              </Grid>
              <Grid gridDefinition={[{ colspan: 6, offset: 3 }]}>
                <Button fullWidth={true} onClick={() => login()}>
                  Login with Cognito
                </Button>
              </Grid>
            </>
          ) : (
            <Grid gridDefinition={[{ colspan: 8, offset: 2 }]}>
              <SpaceBetween size='m'>
                {error && <Alert type="error">{error}</Alert>}
                <FormField label="Email">
                  <Input
                    value={email}
                    onChange={({ detail }) => setEmail(detail.value)}
                    type="email"
                    placeholder="your.email@example.com"
                  />
                </FormField>
                <FormField label="Password">
                  <Input
                    value={password}
                    onChange={({ detail }) => setPassword(detail.value)}
                    type="password"
                    placeholder="••••••••"
                  />
                </FormField>
                <Button
                  variant='primary'
                  fullWidth={true}
                  onClick={handleEmailLogin}
                  loading={isLoading}
                >
                  Sign In
                </Button>
                <Button
                  fullWidth={true}
                  onClick={() => {
                    setShowEmailLogin(false);
                    setError("");
                  }}
                >
                  Back
                </Button>
              </SpaceBetween>
            </Grid>
          )}

          <Grid gridDefinition={[{ colspan: 10, offset: 1 }]}>
            <div className='version'>{version}</div>
          </Grid>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}

export default LoginCognito;
