import ImageKit from 'imagekit';
import env from './env.js';

let imagekit = null;

/**
 * Get ImageKit instance (lazy-initialized).
 * Returns null if credentials are not configured.
 */
export const getImageKit = () => {
  if (imagekit) return imagekit;

  // The env.js module ensures these variables are present on startup

  imagekit = new ImageKit({
    publicKey: env.IMAGEKIT_PUBLIC_KEY,
    privateKey: env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
  });

  console.log('✅ ImageKit initialized');
  return imagekit;
};

export default getImageKit;
