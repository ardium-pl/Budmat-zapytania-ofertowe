import { BodyParamErrorResponse, ErrorResponse, GotExpectedBodyParamErrorResponse } from './request-param-errors';
import { UserInfoResponse } from './user-info.EXAMPLE';

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export type AuthLoginResponse =
  | UserInfoResponse
  | ErrorResponse
  | BodyParamErrorResponse
  | GotExpectedBodyParamErrorResponse;
