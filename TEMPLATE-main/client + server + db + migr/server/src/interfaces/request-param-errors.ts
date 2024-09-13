export interface ErrorResponse {
  success: false;
  error: string;
}
export interface BodyParamErrorResponse extends ErrorResponse {
  field: string;
}
export interface GotExpectedBodyParamErrorResponse<G = unknown, E = unknown> extends BodyParamErrorResponse {
  got: G;
  expected: E;
}
