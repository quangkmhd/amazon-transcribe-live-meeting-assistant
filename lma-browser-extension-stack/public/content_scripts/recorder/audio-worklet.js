/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
// Based on sample from 
// https://github.com/GoogleChromeLabs/web-audio-samples/blob/main/src/audio-worklet/migration/worklet-recorder/recording-processor.js

class RecordingProcessor extends AudioWorkletProcessor {

  floatTo16BitPCM (input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  };

  decodeWebMToAudioBuffer (audioBuffer) {
    // Handle mono input (1 channel)
    const mono32Bit = audioBuffer[0];
    if (!mono32Bit) {
      return new Int16Array(0);
    }
    const mono16Bit = this.floatTo16BitPCM(mono32Bit);
    return mono16Bit;
  };


  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (input && input.length > 0) {
      const outputData = this.decodeWebMToAudioBuffer(input);
      this.port.postMessage(outputData);
    }

    return true;
  }
}

registerProcessor('recording-processor', RecordingProcessor);