/*
 * Unit tests for audio processor
 */
import { downsampleStereoToMono, needsAudioProcessing } from '../utils/audio-processor';

describe('Audio Processor', () => {
    describe('needsAudioProcessing', () => {
        it('should return true when sample rate differs', () => {
            expect(needsAudioProcessing(48000, 1, 16000, 1)).toBe(true);
        });

        it('should return true when channels differ', () => {
            expect(needsAudioProcessing(16000, 2, 16000, 1)).toBe(true);
        });

        it('should return true when both differ', () => {
            expect(needsAudioProcessing(48000, 2, 16000, 1)).toBe(true);
        });

        it('should return false when no processing needed', () => {
            expect(needsAudioProcessing(16000, 1, 16000, 1)).toBe(false);
        });
    });

    describe('downsampleStereoToMono', () => {
        it('should downsample 48kHz stereo to 16kHz mono', () => {
            // Create test audio: 48 samples @ 48kHz stereo = 1ms of audio
            // Result should be: 16 samples @ 16kHz mono = 1ms of audio
            const stereoSamples = new Int16Array(48 * 2); // 48 L+R pairs
            
            // Fill with test pattern: left channel = 1000, right channel = 2000
            for (let i = 0; i < 48; i++) {
                stereoSamples[i * 2] = 1000;     // Left
                stereoSamples[i * 2 + 1] = 2000; // Right
            }

            const inputBuffer = Buffer.from(stereoSamples.buffer);
            const outputBuffer = downsampleStereoToMono(inputBuffer, 48000, 16000);
            const monoSamples = new Int16Array(
                outputBuffer.buffer,
                outputBuffer.byteOffset,
                outputBuffer.length / 2
            );

            // Should have 16 samples (downsampled 3:1)
            expect(monoSamples.length).toBe(16);

            // Each sample should be average of L and R: (1000 + 2000) / 2 = 1500
            expect(monoSamples[0]).toBe(1500);
            expect(monoSamples[monoSamples.length - 1]).toBe(1500);
        });

        it('should handle empty buffer', () => {
            const emptyBuffer = Buffer.alloc(0);
            const result = downsampleStereoToMono(emptyBuffer, 48000, 16000);
            expect(result.length).toBe(0);
        });

        it('should reduce data size by approximately 6x', () => {
            // 480 stereo samples @ 48kHz = 1920 bytes
            const stereoSamples = new Int16Array(480 * 2);
            const inputBuffer = Buffer.from(stereoSamples.buffer);
            
            const outputBuffer = downsampleStereoToMono(inputBuffer, 48000, 16000);
            
            // Should be ~320 bytes (6x smaller: 3x rate + 2x channels)
            expect(outputBuffer.length).toBeLessThan(inputBuffer.length / 5);
            expect(outputBuffer.length).toBeGreaterThan(inputBuffer.length / 7);
        });
    });
});
