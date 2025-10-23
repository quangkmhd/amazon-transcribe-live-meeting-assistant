import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Box, SpaceBetween, Button, FormField, Input } from '@awsui/components-react';

const SpeakerIdentificationModal = ({ visible, onDismiss, speakerNumber, currentName, onSave }) => {
  const [speakerName, setSpeakerName] = useState(currentName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Clean speaker number for display (strip spk_ prefix)
  const displaySpeakerNumber = speakerNumber ? speakerNumber.replace(/^spk_/, '') : 'Unknown';

  const handleSave = async () => {
    if (!speakerName.trim()) {
      setError('Speaker name cannot be empty');
      return;
    }

    if (!speakerNumber) {
      setError('Invalid speaker number');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await onSave(speakerNumber, speakerName.trim());
      onDismiss();
      setSpeakerName('');
    } catch (err) {
      setError(err.message || 'Failed to save speaker name');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setSpeakerName('');
    setError('');
    onDismiss();
  };

  return (
    <Modal
      onDismiss={handleDismiss}
      visible={visible}
      closeAriaLabel="Close modal"
      header={`Identify Speaker ${displaySpeakerNumber}`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleDismiss}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} loading={isLoading}>
              Save
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <FormField label="Speaker Name" description="Enter a name to identify this speaker" errorText={error}>
          <Input
            value={speakerName}
            onChange={({ detail }) => setSpeakerName(detail.value)}
            placeholder="e.g., John Smith"
            disabled={isLoading}
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
};

SpeakerIdentificationModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onDismiss: PropTypes.func.isRequired,
  speakerNumber: PropTypes.string,
  currentName: PropTypes.string,
  onSave: PropTypes.func.isRequired,
};

SpeakerIdentificationModal.defaultProps = {
  currentName: '',
  speakerNumber: null,
};

export default SpeakerIdentificationModal;
