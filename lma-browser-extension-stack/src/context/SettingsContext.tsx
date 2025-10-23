/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import { createContext, useContext, useState } from 'react';

type Settings = {
  wssEndpoint: string,
  clientId: string,
  cognitoDomain: string,
  cloudfrontEndpoint: string,
  recordingDisclaimer: string,
  recordingMessage: string,
  stopRecordingMessage: string
}

const initialSettings = {} as Settings;
const SettingsContext = createContext(initialSettings);

function SettingsProvider({ children }: any) {
  let settingsJson = {} ;
  
  // Determine the correct path for the config file
  const configPath = chrome?.runtime ? chrome.runtime.getURL('lma_config.json') : 'lma_config.json';
  
  const xhr = new XMLHttpRequest();
  xhr.open('GET', configPath, false);
  xhr.send();

  if (xhr.status === 200) {
    // Success!
    settingsJson = JSON.parse(xhr.responseText);
    console.log('[SettingsContext] Config loaded successfully:', settingsJson);
  } else {
    console.error('[SettingsContext] Failed to load config from:', configPath, 'Status:', xhr.status);
  }

  const [settings, setSettings] = useState(settingsJson as Settings);
  
  // Load settings from a file
  /*useEffect(() => {
    const loadSettings = async () => {
      const response = await fetch('lma_config.json');
      const data = await response.json();
      setSettings(data);
    };

    loadSettings();
  }, []);*/

  return (
    <SettingsContext.Provider value={ settings }>
      {children}
    </SettingsContext.Provider>
  );
}
export function useSettings() { 
  return useContext(SettingsContext);
}
export default SettingsProvider;