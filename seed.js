import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

// ─── Import models AFTER dotenv ──────────────────────
import Note from './src/models/Note.js';
import User from './src/models/User.js';
import { listFiles } from './src/services/imagekitService.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in .env');
  process.exit(1);
}

// Ensure subjects map to the frontend exact names
function extractMetadata(file) {
  const parts = file.filePath.split('/').filter(Boolean);
  
  let subject = 'COMMON';
  let branch = 'common';
  let year = 1;
  let semester = 1;
  
  // Try to infer subject from folder name
  if (parts.length > 0) {
    const rawSubject = parts[0].toUpperCase();
    if (rawSubject.includes('ELECT') && !rawSubject.includes('ELECTRONICS')) {
      subject = 'ELECTRICAL';
      branch = 'electrical';
    } else if (rawSubject.includes('ELECTRONICS')) {
      subject = 'ELECTRONICS';
      branch = 'electronics';
    } else if (rawSubject.includes('MATH')) {
      subject = 'MATHS';
    } else if (rawSubject.includes('PHY')) {
      subject = 'PHYSICS';
    } else if (rawSubject.includes('DSA')) {
      subject = 'DSA';
    } else {
      subject = rawSubject; 
    }
  }

  // Try to infer unit from filename (e.g. "Unit 4", "unit_1")
  let unit = 1;
  const unitMatch = file.name.match(/unit[\s_]*(\d)/i);
  if (unitMatch) {
    unit = parseInt(unitMatch[1], 10);
  }

  // Generate tags
  const tags = [branch, subject.toLowerCase(), `unit${unit}`, 'year1', 'handwritten'];

  return {
    title: file.name.replace(/\.[^/.]+$/, "").trim() || 'Untitled Note',
    description: `Handwritten notes for ${subject} - Unit ${unit}`,
    subject,
    branch,
    year,
    semester,
    resourceType: 'handwritten', // Explicitly setting this per requirement
    unit,
    university: 'ABES Engineering College',
    tags,
    pdfUrl: file.url,
    imagekitFileId: file.fileId,
    imagekitFilePath: file.filePath,
    thumbnailUrl: file.thumbnail || '',
    isPublished: true,
  };
}

async function runImport() {
  try {
    console.log('🌱 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    // Make sure we have an admin user
    let adminUser = await User.findOne({ email: 'admin@abesautonomy.com' });
    if (!adminUser) {
      console.log('👤 Creating admin user...');
      adminUser = await User.create({
        name: 'Admin',
        email: 'admin@abesautonomy.com',
        password: 'admin123456',
        role: 'admin',
      });
    }

    console.log('🔍 Fetching PDFs from ImageKit...');
    let allFiles = [];
    let skip = 0;
    let limit = 100;
    
    // Pagination loop
    while (true) {
      // Use no path and no searchQuery to search globally across all folders
      const files = await listFiles({ fileType: 'non-image', limit, skip });
      if (!files || files.length === 0) break;
      allFiles = allFiles.concat(files);
      if (files.length < limit) break;
      skip += limit;
    }

    const pdfFiles = allFiles.filter(f => f.mime === 'application/pdf');
    console.log(`✅ Found ${pdfFiles.length} PDFs on ImageKit.\n`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    console.log('📝 Syncing to MongoDB...');
    for (const file of pdfFiles) {
      try {
        // Check if note already exists based on unique imagekitFileId
        const exists = await Note.findOne({ imagekitFileId: file.fileId });
        
        if (exists) {
          skipped++;
          continue; // Idempotent: don't duplicate
        }

        const metadata = extractMetadata(file);
        metadata.uploadedBy = adminUser._id;

        await Note.create(metadata);
        inserted++;
      } catch (err) {
        console.error(`❌ Failed to insert ${file.name}:`, err.message);
        errors++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Import Summary:');
    console.log(`   PDFs Found:      ${pdfFiles.length}`);
    console.log(`   Notes Inserted:  ${inserted}`);
    console.log(`   Notes Skipped:   ${skipped} (already exist)`);
    if (errors > 0) console.log(`   Errors:          ${errors}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

runImport();
