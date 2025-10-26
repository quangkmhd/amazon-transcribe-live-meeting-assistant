/*
 * Copyright (c) 2025 Amazon.com
 * This file is licensed under the MIT License.
 * See the LICENSE file in the project root for full license information.
 */
/* eslint-disable */
// The values in this file are generated in CodeBuild
// You can also create a .env.local file during development
// https://create-react-app.dev/docs/adding-custom-environment-variables/

const {
  REACT_APP_USER_POOL_ID,
  REACT_APP_USER_POOL_CLIENT_ID,
  REACT_APP_IDENTITY_POOL_ID,
  REACT_APP_APPSYNC_GRAPHQL_URL,
  REACT_APP_AWS_REGION,
} = process.env;

// Default to dummy values if not set (for Supabase-only mode)
const awsmobile = {
  aws_project_region: REACT_APP_AWS_REGION || 'ap-southeast-1',
  aws_cognito_identity_pool_id: REACT_APP_IDENTITY_POOL_ID || 'ap-southeast-1:dummy-identity-pool-id',
  aws_cognito_region: REACT_APP_AWS_REGION || 'ap-southeast-1',
  aws_user_pools_id: REACT_APP_USER_POOL_ID || 'ap-southeast-1_dummypool',
  aws_user_pools_web_client_id: REACT_APP_USER_POOL_CLIENT_ID || 'dummyclientid123456789',
  oauth: {},
  aws_cognito_login_mechanisms: ['PREFERRED_USERNAME'],
  aws_cognito_signup_attributes: ['EMAIL'],
  aws_cognito_mfa_configuration: 'OFF',
  aws_cognito_mfa_types: ['SMS'],
  aws_cognito_password_protection_settings: {
    passwordPolicyMinLength: 8,
    passwordPolicyCharacters: [],
  },
  aws_cognito_verification_mechanisms: ['EMAIL'],
  aws_appsync_graphqlEndpoint:
    REACT_APP_APPSYNC_GRAPHQL_URL || 'https://dummy-appsync.appsync-api.ap-southeast-1.amazonaws.com/graphql',
  aws_appsync_region: REACT_APP_AWS_REGION || 'ap-southeast-1',
  aws_appsync_authenticationType: 'AWS_IAM', // Changed from COGNITO to IAM for flexibility
};

export default awsmobile;
