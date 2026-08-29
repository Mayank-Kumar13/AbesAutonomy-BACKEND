import express from 'express';
import { streamNotePdf } from './src/controllers/noteController.js';
import mongoose from 'mongoose';

const app = express();
app.get('/test/:id/pdf', streamNotePdf);

app.listen(4001, () => {
  console.log('Test server on 4001');
});
