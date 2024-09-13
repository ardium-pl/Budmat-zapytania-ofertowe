import ansis from 'ansis';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectToDb } from './db';
import './dotenv-type';
import { authRouter } from './routers/auth.EXAMPLE';
import { clientRouter } from './routers/client';
import { OK_STR } from './utils/console-colors';

const PORT = process.env.PORT ?? 8080;

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors({ credentials: true, origin: process.env.APP_URL }));

// Routers
app.use('/api/auth', authRouter);
app.use(clientRouter);

// Startup
console.log(`Starting server...`);
app.listen(PORT, () => {
  console.log(`${OK_STR}Running on port ${ansis.greenBright.underline(String(PORT))}!`);

  try {
    connectToDb();
    console.log(`${OK_STR}Connected to database!`);
  } catch (err) {
    throw err;
  }
});
