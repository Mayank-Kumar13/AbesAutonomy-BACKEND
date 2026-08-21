import { Router } from 'express';
import {
  googleLogin,
  googleCallback,
  githubLogin,
  githubCallback,
} from '../controllers/oauthController.js';

const router = Router();

router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);
router.get('/github', githubLogin);
router.get('/github/callback', githubCallback);

export default router;