import express from 'express';
import {UsernameAuth,parseSigningKey} from './username-auth.js';
import {createUsernameApp} from './username-app.js';
// No migration/fs readiness/sweep timer in an Edge worker. The operator migrates first.
const auth=await UsernameAuth.create(process.env.AUTH_ISSUER!,process.env.AUTH_AUDIENCE!,process.env.TEAM_ID!,parseSigningKey(process.env.AUTH_SIGNING_JWK!));
const app=express();
app.use(['/history','/functions/v1/history'],createUsernameApp(auth));
app.listen(8000);
