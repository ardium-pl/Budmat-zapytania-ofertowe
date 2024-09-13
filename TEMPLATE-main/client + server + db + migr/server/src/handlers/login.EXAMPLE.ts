import { Assert } from '@assert';
import { UserModel } from '@models/user.EXAMPLE';
import { RequestHandler } from 'express';
import { AuthLoginRequest, AuthLoginResponse } from 'src/interfaces/login.EXAMPLE';

function isPasswordCorrect(reqPassword: string, passwordHash: string): boolean {
  // some implementation here...
  return true;
}

export const loginHandler: RequestHandler<null, AuthLoginResponse, AuthLoginRequest> = async (req, res) => {
  // validate all required args exist
  if (new Assert(res, req.body, 'email').exists().isString().minLength(6).maxLength(256).isFailed) return;
  if (new Assert(res, req.body, 'password').exists().isString().minLength(8).isFailed) return;

  const { email, password } = req.body;

  // find user and verify their password
  const user = await UserModel.findByEmail(email);

  if (!user || !isPasswordCorrect(password, user.password)) {
    res.status(400).json({ success: false, error: 'WRONG_EMAIL_OR_PASSWORD' });
    return;
  }

  await UserModel.updateLastLogin(user.id);

  res.status(200).json({ success: true, user: { email, username: user.username } });
};
