import express from 'express';
import path from 'path';

export const clientRouter = express.Router();

const clientPath = path.join(__dirname, '../../../dist/client/browser');

//if we want all possible URLs to point to the app we need to use both of these
clientRouter.use('/', express.static(clientPath));
clientRouter.use('*', express.static(clientPath));
