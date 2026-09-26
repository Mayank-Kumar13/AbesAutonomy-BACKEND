import mongoose from 'mongoose';
import dotenv from 'dotenv';
import CreditSection from './src/models/CreditSection.js';
import CreditMember from './src/models/CreditMember.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Please define MONGODB_URI in .env");
  process.exit(1);
}

const seedCredits = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB");

    // Check if sections already exist
    const count = await CreditSection.countDocuments();
    if (count > 0) {
      console.log("Credit sections already exist. Clearing them for a fresh seed...");
      await CreditSection.deleteMany({});
      await CreditMember.deleteMany({});
    }

    // Create Development Team Section
    const devSection = await CreditSection.create({
      title: "Development Team",
      description: "The core developers behind ABES Autonomy.",
      displayOrder: 1,
      isPublished: true,
    });

    const descriptions = [
      "Passionate about technology and innovation, constantly learning, building, and turning ideas into impactful solutions while growing into a better developer every day.",
      "Believes consistency beats talent, learning something new every day while building skills for a brighter future.",
      "Believes in the power of continuous learning and deep problem-solving. Passionate about tackling complex data structures and building webapps "
    ];
    
    await CreditMember.create({
      sectionId: devSection._id,
      name: "Mayank Kotuli",
      role: "Developer",
      description: descriptions[0],
      photoUrl: "/koutli_2.jpeg",
      year: "2nd Year",
      github: "https://github.com/mayankkotuli099",
      linkedin: "https://www.linkedin.com/in/mayank-kotuli-445891363/",
      instagram: "https://www.instagram.com/_mayank099_/",
      displayOrder: 1,
      isVisible: true,
    });

    await CreditMember.create({
      sectionId: devSection._id,
      name: "Mayank Kumar",
      role: "Developer",
      description: descriptions[1],
      photoUrl: "/TOMAR.png",
      year: "2nd Year",
      github: "https://github.com/Mayank-Kumar13",
      linkedin: "https://www.linkedin.com/in/mayank-kumar-206209377/",
      instagram: "https://www.instagram.com/tomar.13?igsh=MWFmeWp0azkzYzZiOA==",
      displayOrder: 2,
      isVisible: true,
    });

    await CreditMember.create({
      sectionId: devSection._id,
      name: "Mukul Yadav",
      role: "Developer",
      description: descriptions[2],
      photoUrl: "/mukul2.png",
      year: "2nd Year",
      github: "https://github.com/mukul2007yadav-lab",
      linkedin: "https://www.linkedin.com/in/mukul-yadav-19ab44377/",
      instagram: "https://www.instagram.com/oogway5001/",
      displayOrder: 3,
      isVisible: true,
    });

    // Create Contributor Section
    const notesSection = await CreditSection.create({
      title: "Handwritten Notes Contributor",
      description: "Special thanks to our contributors for providing high-quality resources.",
      displayOrder: 2,
      isPublished: true,
    });

    await CreditMember.create({
      sectionId: notesSection._id,
      name: "NITIN",
      role: "Contributor",
      description: "Topper student with 10 SGPA. Contributed high-quality handwritten notes to help fellow students excel in their academics.",
      photoUrl: "/NITIN.jpeg",
      year: "2nd Year",
      github: "https://github.com/nitinbhhardwaj",
      linkedin: "https://www.linkedin.com/in/nitin-bhardwaj-8bb880395/",
      instagram: "https://www.instagram.com/nitinbhhardwaz?igsh=MWlwbDFsZmVrY28wYQ%3D%3D&igsi=MWlwbDFsZmVrY28wYQ%3D%3D&utm_source=qr",
      displayOrder: 1,
      isVisible: true,
    });

    console.log("Successfully seeded initial credits data.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

seedCredits();
