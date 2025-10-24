/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
import React, { useEffect, useState } from 'react';
import { Logger } from 'aws-amplify';
import ReactAudioPlayer from 'react-audio-player';

import useAppContext from '../../contexts/app';
import generateS3PresignedUrl from '../common/generate-s3-presigned-url';

const logger = new Logger('RecordingPlayer');

/* eslint-disable react/prop-types, react/destructuring-assignment */
export const RecordingPlayer = ({ recordingUrl }) => {
  const [preSignedUrl, setPreSignedUrl] = useState();
  const { setErrorMessage, currentCredentials } = useAppContext();

  useEffect(async () => {
    if (recordingUrl) {
      let url;
      logger.debug('recording url to process', recordingUrl);

      try {
        // Check if URL is from Supabase Storage (already public, no presigning needed)
        const isSupabaseUrl = recordingUrl.includes('supabase.co/storage/v1/object/public/');

        if (isSupabaseUrl) {
          // Supabase URLs are already public, use directly
          logger.debug('using Supabase public URL directly', recordingUrl);
          url = recordingUrl;
        } else {
          // Legacy S3 URLs need presigning
          logger.debug('presigning S3 URL', recordingUrl);
          url = await generateS3PresignedUrl(recordingUrl, currentCredentials);
          logger.debug('recording presigned url', url);
        }

        setPreSignedUrl(url);
      } catch (error) {
        setErrorMessage('failed to get recording url - please try again later');
        logger.error('failed to process recording url', error);
      }
    }
  }, [recordingUrl, currentCredentials]);

  return preSignedUrl?.length ? <ReactAudioPlayer src={preSignedUrl} controls /> : null;
};

export default RecordingPlayer;
