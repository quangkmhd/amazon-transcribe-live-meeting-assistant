/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
  if (request.action === "StartTranscription") {
    console.log("Received recorder start streaming message", request);
    startStreaming();
  } else if (request.action === "StopTranscription") {
    console.log("Received recorder stop streaming message", request);
    stopStreaming();
  }
}); 

/* globals */
let audioProcessor = undefined;
let samplingRate = 44100;
let audioContext;
let displayStream;
let micStream;

/* Helper funcs */
const bytesToBase64DataUrl = async (bytes, type = "application/octet-stream") => {
  return await new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(new File([bytes], "", { type }));
  });
}

const pcmEncode = (input) => {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};

const convertToMono = (audioSource) => {
  const splitter = audioContext.createChannelSplitter(2);
  const merger = audioContext.createChannelMerger(1);
  audioSource.connect(splitter);
  splitter.connect(merger, 0, 0);
  splitter.connect(merger, 1, 0);
  return merger;
};

const stopStreaming = async () => {
  console.log("recorder stop streaming");
  if (audioProcessor && audioProcessor.port) {
    audioProcessor.port.postMessage({
      message: 'UPDATE_RECORDING_STATE',
      setRecording: false,
    });
    audioProcessor.port.close();
    audioProcessor.disconnect();
    audioProcessor = null;

    displayStream.getTracks().forEach((track) => {
      track.stop();
    });

    micStream.getTracks().forEach((track) => {
      track.stop();
    });

    if (audioContext) {
      audioContext.close().then(() => {
        chrome.runtime.sendMessage({ action: "TranscriptionStopped" });
        console.log('AudioContext closed.');
        audioContext = null;
      });
    }
  }
}

const startStreaming = async (sendResponse) => {
  try {
    audioContext = new window.AudioContext({
      sampleRate: 16000  // Changed from 8000 for Soniox
    });
    /* Get display media works */
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      preferCurrentTab: true,
      video: true,
      audio: {
        noiseSuppression: true,
        autoGainControl: true,
        echoCancellation: true,
      }
    });

    // hook up the stop streaming event
    displayStream.getAudioTracks()[0].onended = () => {
      stopStreaming();
    };

    micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        noiseSuppression: true,
        autoGainControl: true,
        echoCancellation: true,
      }
    });

    samplingRate = audioContext.sampleRate;
    console.log("Sending sampling rate:", samplingRate);
    chrome.runtime.sendMessage({ action: "SamplingRate", samplingRate: samplingRate });

    let displayAudioSource = audioContext.createMediaStreamSource(displayStream);
    let micAudioSource = audioContext.createMediaStreamSource(micStream);

    let monoDisplaySource = convertToMono(displayAudioSource);
    let monoMicSource = convertToMono(micAudioSource);

    // Create mono merged stream for Soniox (instead of stereo dual-channel)
    const destination = audioContext.createMediaStreamDestination();
    
    // Create gain nodes for mixing both sources
    const displayGain = audioContext.createGain();
    const micGain = audioContext.createGain();
    displayGain.gain.value = 1.0;  // Meeting audio
    micGain.gain.value = 1.0;      // User audio
    
    // Merge both sources into single mono stream
    monoDisplaySource.connect(displayGain).connect(destination);
    monoMicSource.connect(micGain).connect(destination);

    try {
      await audioContext.audioWorklet.addModule('audio-worklet.js');
    } catch (error) {
      console.log(`Add module error ${error}`);
    }

    // Configure AudioWorkletNode for mono input (1 channel)
    audioProcessor = new AudioWorkletNode(audioContext, 'recording-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers'
    });
    audioProcessor.port.onmessageerror = (error) => {
      console.log(`Error receving message from worklet ${error}`);
    };

    audioProcessor.port.onmessage = async (event) => {
      // this is pcm audio
      //sendMessage(event.data);
      let base64AudioData = await bytesToBase64DataUrl(event.data);
      let payload = { action: "AudioData", audio: base64AudioData };
      chrome.runtime.sendMessage(payload);
    };
    // Connect the merged destination to audio processor
    const mergedSource = audioContext.createMediaStreamSource(destination.stream);
    mergedSource.connect(audioProcessor);
    

    // buffer[0] - display stream,  buffer[1] - mic stream
    /*audioProcessor.port.onmessage = async (event) => {
      let audioData = new Uint8Array(
        interleave(event.data.buffer[0], event.data.buffer[1]),
      );
      let base64AudioData = await bytesToBase64DataUrl(audioData);
      // send audio to service worker:
      let payload = { action: "AudioData", audio: base64AudioData };
      chrome.runtime.sendMessage(payload);
    };*/
  } catch (error) {
    // console.error("Error in recorder", error);
    await stopStreaming();
  }
};

console.log("Inside the recorder.js");