import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  displayName: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  content: { type: String, required: true },
  approved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model('Review', reviewSchema);

mongoose.connect('mongodb+srv://abesautonomy30_db_user:rRnZNI7vLMxYyOzw@abes.mvo7qih.mongodb.net/')
  .then(async () => {
    const res = await Review.find();
    console.log(res);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
