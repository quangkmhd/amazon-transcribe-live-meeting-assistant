/*
 * Audio Processing Utilities
 * Converts 48kHz stereo PCM to 16kHz mono PCM for Soniox STT
 */

/**
 * Downsample and convert stereo to mono
 * Input: 48kHz stereo PCM (Int16Array with interleaved L,R samples)
 * Output: 16kHz mono PCM (Int16Array)
 * 
 * Process:
 * 1. De-interleave stereo channels (L, R, L, R, ... -> separate L and R arrays)
 * 2. Average L and R channels to create mono
 * 3. Downsample from 48kHz to 16kHz (keep every 3rd sample)
 */
export function downsampleStereoToMono(
    stereoData: Buffer,
    inputSampleRate = 48000,
    outputSampleRate = 16000
): Buffer {
    // Convert Buffer to Int16Array (stereo interleaved)
    const stereoSamples = new Int16Array(
        stereoData.buffer,
        stereoData.byteOffset,
        stereoData.length / 2
    );

    // Calculate downsampling ratio
    const ratio = inputSampleRate / outputSampleRate; // 48000 / 16000 = 3
    
    // Calculate output length (mono, downsampled)
    const outputLength = Math.floor(stereoSamples.length / 2 / ratio);
    const monoDownsampled = new Int16Array(outputLength);

    let outputIndex = 0;
    
    // Process samples: de-interleave, average, and downsample
    for (let i = 0; i < stereoSamples.length; i += 2 * ratio) {
        // Get left and right samples
        const leftIndex = Math.floor(i);
        const rightIndex = leftIndex + 1;
        
        if (rightIndex < stereoSamples.length && outputIndex < outputLength) {
            const left = stereoSamples[leftIndex];
            const right = stereoSamples[rightIndex];
            
            // Average the two channels for mono
            const mono = Math.floor((left + right) / 2);
            monoDownsampled[outputIndex] = mono;
            outputIndex++;
        }
    }

    // Convert Int16Array back to Buffer
    return Buffer.from(monoDownsampled.buffer);
}

/**
 * Simple linear interpolation downsampler (better quality)
 * Uses linear interpolation between samples for smoother downsampling
 */
export function downsampleStereoToMonoInterpolated(
    stereoData: Buffer,
    inputSampleRate = 48000,
    outputSampleRate = 16000
): Buffer {
    const stereoSamples = new Int16Array(
        stereoData.buffer,
        stereoData.byteOffset,
        stereoData.length / 2
    );

    const ratio = inputSampleRate / outputSampleRate;
    const stereoFrames = stereoSamples.length / 2; // number of L,R pairs
    const outputLength = Math.floor(stereoFrames / ratio);
    const monoDownsampled = new Int16Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        // Calculate position in input array
        const position = i * ratio;
        const leftIndex = Math.floor(position) * 2;
        const rightIndex = leftIndex + 1;
        
        if (rightIndex < stereoSamples.length) {
            // Get left and right samples
            const left = stereoSamples[leftIndex];
            const right = stereoSamples[rightIndex];
            
            // Average to mono
            const mono = Math.floor((left + right) / 2);
            monoDownsampled[i] = mono;
        }
    }

    return Buffer.from(monoDownsampled.buffer);
}

/**
 * Check if audio processing is needed
 */
export function needsAudioProcessing(
    samplingRate: number,
    channels: number,
    targetRate = 16000,
    targetChannels = 1
): boolean {
    return samplingRate !== targetRate || channels !== targetChannels;
}
