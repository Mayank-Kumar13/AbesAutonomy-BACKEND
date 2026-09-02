import { Router } from 'express';
import {
  googleLogin,
  googleCallback,
  googleCallbackPost,
  githubLogin,
  githubCallback,
  githubCallbackPost,
} from '../controllers/oauthController.js';

const router = Router();

router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);
router.post('/google/callback', googleCallbackPost);

router.get('/github', githubLogin);
router.get('/github/callback', githubCallback);
router.post('/github/callback', githubCallbackPost);

export default router;