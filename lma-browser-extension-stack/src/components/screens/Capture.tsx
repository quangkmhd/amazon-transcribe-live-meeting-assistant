/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useCallback, useEffect } from 'react';
import logo from './logo.svg';
import './Capture.css'
import { Box, Button, Container, ContentLayout, CopyToClipboard, FormField, Grid, Header, Icon, Input, Link, Modal, SpaceBetween } from '@cloudscape-design/components';
import UserMessage from '../views/UserMessage';
import OtherMessage from '../views/OtherMessage';
import { useNavigation } from '../../context/NavigationContext';
import AssistantMessage from '../views/AssistantMessage';
import ValueWithLabel from '../views/ValueWithLabel';
import { useUserContext } from '../../context/UserContext';
import { useIntegration } from '../../context/ProviderIntegrationContext';
import { useSettings } from '../../context/SettingsContext';
import { useSupabase } from '../../context/SupabaseContext';
import { useTranscriptSubscription } from '../../hooks/useTranscriptSubscription';

function Capture() {
  const { navigate } = useNavigation();
  const { user, logout } = useUserContext();
  const { signOut } = useSupabase();
  const settings = useSettings();
  const { currentCall, muted, setMuted, paused, setPaused, activeSpeaker, metadata, fetchMetadata, isTranscribing, startTranscription, stopTranscription, platform } = useIntegration();

  const [topic, setTopic] = React.useState("");
  const [agentName, setAgentName] = React.useState("");
  const [nameErrorText, setNameErrorText] = React.useState("");
  const [meetingTopicErrorText, setMeetingTopicErrorText] = React.useState("");
  const [formError, setFormError] = React.useState(false);
  const [showDisclaimer, setShowDisclaimer] = React.useState(false);

  // 🎯 STAGE 6 FIX: Subscribe to transcripts and log UI_RECEIVED
  const { transcripts, isLoading: transcriptsLoading, error: transcriptsError } = useTranscriptSubscription(
    isTranscribing ? currentCall?.callId : null
  );

  // Debug log when transcripts are received
  useEffect(() => {
    if (transcripts.length > 0) {
      console.log(`[Capture] 🎉 Stage 6 triggered! Received ${transcripts.length} transcripts`, {
        latest: transcripts[transcripts.length - 1],
        callId: currentCall?.callId
      });
    }
  }, [transcripts, currentCall]);

  // componentDidMount:
  useEffect(() => {
    // Your code here
    fetchMetadata();
  }, []);

  useEffect(() => {
    console.log("Metadata changed");
    if (metadata && metadata.meetingTopic) {
      setTopic(metadata.meetingTopic);
    }
    if (metadata && metadata.userName) {
      setAgentName(metadata.userName);
    }
  }, [metadata, setTopic, setAgentName]);

  const validateForm = useCallback(() => {
    let isValid = true;
    if (agentName === undefined || agentName.trim().length === 0) {
      setNameErrorText("Name required.")
      isValid = false
    } else {
      setNameErrorText("");
    }
    if (topic === undefined || topic.trim().length === 0) {
      setMeetingTopicErrorText("Topic required.")
      isValid = false;
    } else {
      setMeetingTopicErrorText("");
    }
    return isValid;
  }, [topic, agentName, nameErrorText, setNameErrorText, meetingTopicErrorText, setMeetingTopicErrorText]);

  const startListening = useCallback(() => {
    // eslint-disable-next-line no-useless-escape
    setTopic(topic.replace(/[\/?#%\+&]/g, '|'));

    if (validateForm() === false) {
      return;
    }
    setShowDisclaimer(true);
  }, [settings, validateForm, showDisclaimer]);

  const disclaimerConfirmed = useCallback(() => {
    startTranscription(user, agentName, topic);
  }, [user, agentName, topic, startTranscription])

  const stopListening = useCallback(() => {
    stopTranscription();
  }, [stopTranscription]);

  const openInLMA = useCallback(async () => {
    const url = `${settings.cloudfrontEndpoint}/#/calls/${currentCall.callId}`;
    window.open(url, '_blank', 'noreferrer');
  }, [currentCall, settings])

  const mute = useCallback(() => {
    setMuted(true);
  }, [muted, setMuted]);

  const unmute = useCallback(() => {
    setMuted(false);
  }, [muted, setMuted]);

  const [version, setVersion] = React.useState("");
  useEffect(() => {
    if (chrome && chrome.runtime) {
      const manifestData = chrome.runtime.getManifest();
      setVersion(manifestData.version)
    } else {
      setVersion("dev/web");
    }
  }, [version, setVersion]);

  return (
    <ContentLayout
      header={
        <SpaceBetween size={'xs'}>
          <Header
            variant="h1"
            description="Powered by Amazon Transcribe and Amazon Bedrock"
          >
            Amazon Live Meeting Assistant
          </Header>
        </SpaceBetween>
      }
    >
      <Container
        fitHeight={true}
        header={
          <Header variant="h2" description="">
            Meeting Details
          </Header>
        }
      >
        <Modal
          onDismiss={() => setShowDisclaimer(false)}
          visible={showDisclaimer}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={async () => {
                  setShowDisclaimer(false);
                }}>Cancel</Button>
                <Button variant="primary" onClick={async () => {
                  setShowDisclaimer(false);
                  disclaimerConfirmed();
                }}>Agree</Button>
              </SpaceBetween>
            </Box>
          }
          header="Important:"
        >
          <Icon name="status-warning"></Icon>&nbsp;
          {settings.recordingDisclaimer}
        </Modal>
        <SpaceBetween size="l">
          <ValueWithLabel label="Platform Detected:">{platform}</ValueWithLabel>
          {(isTranscribing === true ?
            <>
              <Button fullWidth={true} onClick={async () => openInLMA()}>Open in LMA</Button>
              <ValueWithLabel label="Name:">{agentName}</ValueWithLabel>
              <ValueWithLabel label="Meeting Topic:">{topic}</ValueWithLabel>
              <ValueWithLabel label="Active Speaker:">{activeSpeaker}</ValueWithLabel>
              
              {/* 🎯 STAGE 6 FIX: Display real-time transcripts */}
              {transcripts.length > 0 && (
                <Container
                  header={
                    <Header
                      variant="h3"
                      description={`${transcripts.length} transcript segments received`}
                    >
                      Live Transcripts (Stage 6 Active ✅)
                    </Header>
                  }
                >
                  <SpaceBetween size="s">
                    {transcripts.slice(-5).map((t, idx) => (
                      <Box key={t.id} padding="s" className="transcript-item">
                        <SpaceBetween size="xxs">
                          <Box fontSize="body-s" fontWeight="bold" color="text-label">
                            {t.speaker || 'Unknown Speaker'}
                          </Box>
                          <Box fontSize="body-m">
                            {t.transcript}
                          </Box>
                          {t.confidence && (
                            <Box fontSize="body-s" color="text-status-inactive">
                              Confidence: {(t.confidence * 100).toFixed(1)}%
                            </Box>
                          )}
                        </SpaceBetween>
                      </Box>
                    ))}
                  </SpaceBetween>
                </Container>
              )}
              
              {transcriptsError && (
                <Box color="text-status-error">
                  ❌ Transcript Error: {transcriptsError.message}
                </Box>
              )}
              {
                paused === true ?
                  <>
                    <Button fullWidth={true} iconName="microphone-off" onClick={() => setPaused(false)}>Unmute All</Button>
                  </>
                  :
                  <>
                    <Button fullWidth={true} iconName="microphone" onClick={() => setPaused(true)}>Mute All</Button>
                  </>
              }
              <Button fullWidth={true} variant='primary' onClick={() => stopListening()}>Stop Listening</Button>
            </>
            :
            <>
              <FormField
                stretch={true}
                constraintText=""
                errorText={nameErrorText}
                label="Your name:"
              >
                <Input value={agentName} onChange={({ detail }) => setAgentName(detail.value)} placeholder='Your name' ></Input>
              </FormField>
              <FormField
                stretch={true}
                constraintText=""
                errorText={meetingTopicErrorText}
                label="Meeting Topic:"
              >
                <Input value={topic} onChange={({ detail }) => setTopic(detail.value)} placeholder='Meeting room topic' inputMode='text'></Input>
              </FormField>
              <Button fullWidth={true} variant='primary' onClick={() => startListening()}>Start Listening</Button>
            </>
          )}
          <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
            {muted === true ?
              <Button iconAlign="left" iconName="microphone-off" fullWidth={true} onClick={() => unmute()}>Unmute Me</Button>
              :
              <Button iconAlign="left" iconName="microphone" fullWidth={true} onClick={() => mute()}>Mute Me</Button>
            }
            <Button fullWidth={true} onClick={async () => {
              await signOut();
              logout();
            }}>Log out</Button>
          </Grid>

          <Grid gridDefinition={[{ colspan: 10, offset: 1 }]}>
            <div className='version'>{version}</div>
          </Grid>
        </SpaceBetween>
      </Container>
    </ContentLayout>
  );
}

export default Capture;
