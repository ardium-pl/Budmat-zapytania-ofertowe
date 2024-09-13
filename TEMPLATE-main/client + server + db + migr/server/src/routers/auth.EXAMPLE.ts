
import { loginHandler } from '@handlers/login.EXAMPLE';
import { Router } from 'express';

const router = Router();

router.post('/login', loginHandler);

export const authRouter = router;
