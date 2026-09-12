import mongoose from 'mongoose';
import env from '../config/env.js';
import connectDB from '../config/db.js';
import Subject from '../models/Subject.js';

const INITIAL_SUBJECTS = [
  // Common Year 1
  { name: 'DSA', description: 'Data Structures and Algorithms', year: 1, group: 'common', icon: 'LineChart', displayOrder: 1 },
  { name: 'MATHS', description: 'Mathematics for Problem Solving', year: 1, group: 'common', icon: 'BookOpen', displayOrder: 2 },
  { name: 'PHYSICS', description: 'Engineering Physics and Applications', year: 1, group: 'common', icon: 'Atom', displayOrder: 3 },
  { name: 'EVS', description: 'Environmental Studies and Sustainability', year: 1, group: 'common', icon: 'Leaf', displayOrder: 4 },
  { name: 'AI', description: 'Artificial Intelligence Fundamentals', year: 1, group: 'electrical', icon: 'BrainCircuit', displayOrder: 5 },
  { name: 'ELECTRICAL', description: 'Basic Electrical Engineering', year: 1, group: 'electrical', icon: 'Zap', displayOrder: 6 },
  
  // Some for electronics
  { name: 'SOFT SKILL', description: 'Soft Skills and Personal Development', year: 1, group: 'electronics', icon: 'Code', displayOrder: 7 },
  { name: 'DT', description: 'Digital Techniques and Logic Design', year: 1, group: 'electronics', icon: 'Monitor', displayOrder: 8 },
  { name: 'MECHANICS', description: 'Engineering Mechanics and Dynamics', year: 1, group: 'electronics', icon: 'Cog', displayOrder: 9 },
  { name: 'ELECTRONICS', description: 'Fundamentals of Electronics Engineering', year: 1, group: 'electronics', icon: 'Cpu', displayOrder: 10 },
];

const seedSubjects = async () => {
  try {
    await connectDB();
    console.log('Connected to DB. Seeding subjects...');

    for (const subjectData of INITIAL_SUBJECTS) {
      const exists = await Subject.findOne({ name: subjectData.name, year: subjectData.year });
      if (!exists) {
        await Subject.create(subjectData);
        console.log(`Created subject: ${subjectData.name}`);
      } else {
        console.log(`Subject already exists: ${subjectData.name}`);
      }
    }

    console.log('Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seedSubjects();
